const { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const pty = require('node-pty');

const configPath = path.join(app.getPath('userData'), 'projects.json');
const settingsPath = path.join(app.getPath('userData'), 'project-settings.json');
const globalSettingsPath = path.join(app.getPath('userData'), 'global-settings.json');

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

function loadAllSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    return {};
  }
}

function saveAllSettings(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
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

app.setAboutPanelOptions({
  applicationName: 'Claude Controller',
  applicationVersion: require('./package.json').version,
  copyright: 'Built with Electron & Claude Code',
  iconPath: path.join(__dirname, 'build', 'icon.icns'),
  website: 'https://github.com/jukart/claude-controller'
});

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'GitHub Repository',
          click: () => shell.openExternal('https://github.com/jukart/claude-controller')
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
});

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

let usageCache = null;
let usageCacheTime = 0;
const USAGE_CACHE_MS = 180000; // 3 minutes

async function fetchUsage() {
  const now = Date.now();
  if (usageCache && (now - usageCacheTime) < USAGE_CACHE_MS) {
    return usageCache;
  }
  try {
    const { execSync } = require('child_process');
    const creds = JSON.parse(execSync(
      'security find-generic-password -s "Claude Code-credentials" -w',
      { encoding: 'utf8', timeout: 5000 }
    ));
    const token = creds.claudeAiOauth?.accessToken;
    if (!token) throw new Error('No token');

    const { net } = require('electron');
    const data = await new Promise((resolve, reject) => {
      const request = net.request({
        method: 'GET',
        url: 'https://api.anthropic.com/api/oauth/usage'
      });
      request.setHeader('Authorization', 'Bearer ' + token);
      request.setHeader('anthropic-beta', 'oauth-2025-04-20');
      request.setHeader('User-Agent', 'npm@anthropic-ai/claude-code');
      let body = '';
      request.on('response', (response) => {
        response.on('data', (chunk) => { body += chunk.toString(); });
        response.on('end', () => {
          if (response.statusCode !== 200) {
            reject(new Error('HTTP ' + response.statusCode));
            return;
          }
          try { resolve(JSON.parse(body)); } catch { reject(new Error('Bad JSON')); }
        });
      });
      request.on('error', reject);
      request.end();
    });

    const fiveHourRaw = data.five_hour?.utilization || 0;
    const sevenDayRaw = data.seven_day?.utilization || 0;
    usageCache = {
      fiveHour: fiveHourRaw <= 1 ? fiveHourRaw * 100 : fiveHourRaw,
      fiveHourResetsAt: data.five_hour?.resets_at || null,
      sevenDay: sevenDayRaw <= 1 ? sevenDayRaw * 100 : sevenDayRaw,
      sevenDayResetsAt: data.seven_day?.resets_at || null
    };
    usageCacheTime = now;
    return usageCache;
  } catch {
    // Fallback to ccline cache
    try {
      const cachePath = path.join(app.getPath('home'), '.claude', 'ccline', '.api_usage_cache.json');
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      return {
        fiveHour: cached.five_hour_utilization || 0,
        fiveHourResetsAt: null,
        sevenDay: cached.seven_day_utilization || 0,
        sevenDayResetsAt: cached.resets_at || null
      };
    } catch {
      return { fiveHour: 0, fiveHourResetsAt: null, sevenDay: 0, sevenDayResetsAt: null };
    }
  }
}

ipcMain.handle('get-usage', () => fetchUsage());

ipcMain.handle('stop-session', (_, sessionId) => {
  const proc = sessions.get(sessionId);
  if (proc) {
    proc.kill();
    sessions.delete(sessionId);
  }
});

// Project settings
ipcMain.handle('get-project-settings', (_, projectPath) => {
  const all = loadAllSettings();
  return all[projectPath] || {};
});

ipcMain.handle('save-project-settings', (_, projectPath, settings) => {
  const all = loadAllSettings();
  all[projectPath] = settings;
  saveAllSettings(all);
});

// Global settings
ipcMain.handle('get-global-settings', () => {
  try {
    return JSON.parse(fs.readFileSync(globalSettingsPath, 'utf8'));
  } catch {
    return {};
  }
});

ipcMain.handle('save-global-settings', (_, settings) => {
  fs.writeFileSync(globalSettingsPath, JSON.stringify(settings, null, 2));
});

// Launch external app
ipcMain.handle('launch-external-app', (_, projectPath, command) => {
  if (!command) return { error: 'No command provided' };

  const { exec } = require('child_process');
  exec(command, { cwd: projectPath }, (err) => {
    if (err) console.error('External app error:', err.message);
  });
  return { ok: true };
});
