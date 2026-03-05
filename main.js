const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const pty = require('node-pty');

const configPath = path.join(app.getPath('userData'), 'projects.json');

function loadProjects() {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return [];
  }
}

function saveProjects(projects) {
  fs.writeFileSync(configPath, JSON.stringify(projects, null, 2));
}

let mainWindow;
const sessions = new Map();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1e1e2e'
  });

  mainWindow.loadFile('renderer/index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  for (const [, proc] of sessions) {
    proc.kill();
  }
  app.quit();
});

// Project management
ipcMain.handle('get-projects', () => loadProjects());

ipcMain.handle('add-project', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select project folder'
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const projectPath = result.filePaths[0];
  const projects = loadProjects();
  if (!projects.includes(projectPath)) {
    projects.push(projectPath);
    saveProjects(projects);
  }
  return projects;
});

ipcMain.handle('remove-project', (_, projectPath) => {
  const projects = loadProjects().filter(p => p !== projectPath);
  saveProjects(projects);
  if (sessions.has(projectPath)) {
    sessions.get(projectPath).kill();
    sessions.delete(projectPath);
  }
  return projects;
});

// Session management
ipcMain.handle('start-session', (event, projectPath) => {
  if (sessions.has(projectPath)) {
    return { alreadyRunning: true };
  }

  const shell = process.env.SHELL || '/bin/zsh';
  const proc = pty.spawn(shell, ['-li'], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: projectPath,
    env: { ...process.env, TERM: 'xterm-256color' }
  });

  // Send claude command after shell initializes
  setTimeout(() => {
    proc.write('claude\n');
  }, 500);

  sessions.set(projectPath, proc);

  proc.onData((data) => {
    mainWindow?.webContents.send('session-data', projectPath, data);
  });

  proc.onExit(({ exitCode }) => {
    sessions.delete(projectPath);
    mainWindow?.webContents.send('session-exit', projectPath, exitCode);
  });

  return { alreadyRunning: false };
});

ipcMain.handle('session-write', (_, projectPath, data) => {
  const proc = sessions.get(projectPath);
  if (proc) proc.write(data);
});

ipcMain.handle('session-resize', (_, projectPath, cols, rows) => {
  const proc = sessions.get(projectPath);
  if (proc) proc.resize(cols, rows);
});

ipcMain.handle('session-active', (_, projectPath) => {
  return sessions.has(projectPath);
});

ipcMain.handle('stop-session', (_, projectPath) => {
  const proc = sessions.get(projectPath);
  if (proc) {
    proc.kill();
    sessions.delete(projectPath);
  }
});
