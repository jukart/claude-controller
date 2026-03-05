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
const sessions = new Map(); // sessionId -> pty process

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
  // Kill all sessions belonging to this project
  for (const [sessionId, proc] of sessions) {
    if (sessionId.startsWith(projectPath + '::')) {
      proc.kill();
      sessions.delete(sessionId);
    }
  }
  return projects;
});

// Session management
ipcMain.handle('start-session', (event, sessionId, projectPath, launchClaude) => {
  if (sessions.has(sessionId)) {
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

  if (launchClaude) {
    setTimeout(() => {
      proc.write('claude\n');
    }, 500);
  }

  sessions.set(sessionId, proc);

  proc.onData((data) => {
    if (!mainWindow?.isDestroyed()) {
      mainWindow.webContents.send('session-data', sessionId, data);
    }
  });

  proc.onExit(({ exitCode }) => {
    sessions.delete(sessionId);
    if (!mainWindow?.isDestroyed()) {
      mainWindow.webContents.send('session-exit', sessionId, exitCode);
    }
  });

  return { alreadyRunning: false };
});

ipcMain.handle('session-write', (_, sessionId, data) => {
  const proc = sessions.get(sessionId);
  if (proc) proc.write(data);
});

ipcMain.handle('session-resize', (_, sessionId, cols, rows) => {
  const proc = sessions.get(sessionId);
  if (proc) proc.resize(cols, rows);
});

ipcMain.handle('session-active', (_, sessionId) => {
  return sessions.has(sessionId);
});

ipcMain.handle('stop-session', (_, sessionId) => {
  const proc = sessions.get(sessionId);
  if (proc) {
    proc.kill();
    sessions.delete(sessionId);
  }
});
