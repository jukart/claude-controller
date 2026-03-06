/* global Terminal, FitAddon */

const projectList = document.getElementById('project-list');
const addProjectBtn = document.getElementById('add-project-btn');
const terminalContainer = document.getElementById('terminal-container');
const tabBar = document.getElementById('tab-bar');
const tabList = document.getElementById('tab-list');
const addTabBtn = document.getElementById('add-tab-btn');
const addClaudeBtn = document.getElementById('add-claude-btn');
const emptyState = document.getElementById('empty-state');
const launchAppButtons = document.getElementById('launch-app-buttons');
const projectSettingsBtn = document.getElementById('project-settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const settingsSaveBtn = document.getElementById('settings-save-btn');
const externalAppsList = document.getElementById('external-apps-list');
const addAppBtn = document.getElementById('add-app-btn');
const globalSettingsBtn = document.getElementById('global-settings-btn');
const globalSettingsModal = document.getElementById('global-settings-modal');
const globalSettingsCloseBtn = document.getElementById('global-settings-close-btn');
const globalSettingsSaveBtn = document.getElementById('global-settings-save-btn');
const globalAppsList = document.getElementById('global-apps-list');
const globalAddAppBtn = document.getElementById('global-add-app-btn');

// projectTabs: projectPath -> [{ sessionId, terminal, fitAddon, wrapper, opened, label }]
const projectTabs = new Map();
// activeTabId: projectPath -> sessionId (which tab is active per project)
const activeTabId = new Map();
// sessionToProject: sessionId -> projectPath
const sessionToProject = new Map();

let activeProject = null;
let tabCounter = 0;

// Theme definitions for xterm.js
const terminalThemes = {
  dark: {
    background: '#1e1e2e',
    foreground: '#cdd6f4',
    cursor: '#f5e0dc',
    selectionBackground: '#45475a',
    black: '#45475a',
    red: '#f38ba8',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    blue: '#89b4fa',
    magenta: '#cba6f7',
    cyan: '#94e2d5',
    white: '#bac2de',
    brightBlack: '#585b70',
    brightRed: '#f38ba8',
    brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af',
    brightBlue: '#89b4fa',
    brightMagenta: '#cba6f7',
    brightCyan: '#94e2d5',
    brightWhite: '#a6adc8'
  },
  light: {
    background: '#eff1f5',
    foreground: '#4c4f69',
    cursor: '#dc8a78',
    selectionBackground: '#ccd0da',
    black: '#5c5f77',
    red: '#d20f39',
    green: '#40a02b',
    yellow: '#df8e1d',
    blue: '#1e66f5',
    magenta: '#8839ef',
    cyan: '#179299',
    white: '#acb0be',
    brightBlack: '#6c6f85',
    brightRed: '#d20f39',
    brightGreen: '#40a02b',
    brightYellow: '#df8e1d',
    brightBlue: '#1e66f5',
    brightMagenta: '#8839ef',
    brightCyan: '#179299',
    brightWhite: '#bcc0cc'
  }
};

let currentTheme = 'dark';

function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  // Update all existing terminals
  const xtermTheme = terminalThemes[theme];
  for (const [, tabs] of projectTabs) {
    for (const tab of tabs) {
      tab.terminal.options.theme = xtermTheme;
    }
  }
}

async function loadTheme() {
  const settings = await window.api.getGlobalSettings();
  applyTheme(settings.theme || 'dark');
}

function generateSessionId(projectPath) {
  return projectPath + '::' + (tabCounter++);
}

async function renderProjects() {
  const projects = await window.api.getProjects();
  projectList.innerHTML = '';

  // Group projects by parent folder
  const groups = new Map();
  for (const projectPath of projects) {
    const parts = projectPath.split('/').filter(Boolean);
    const parentFolder = parts.length >= 2 ? parts[parts.length - 2] : '/';
    if (!groups.has(parentFolder)) {
      groups.set(parentFolder, []);
    }
    groups.get(parentFolder).push(projectPath);
  }

  for (const [groupName, groupProjects] of groups) {
    const header = document.createElement('li');
    header.className = 'group-header';
    header.textContent = groupName;
    projectList.appendChild(header);

    for (const projectPath of groupProjects) {
      const li = document.createElement('li');
      const tabs = projectTabs.get(projectPath) || [];
      const hasRunning = tabs.length > 0;
      if (hasRunning) li.classList.add('running');
      if (projectPath === activeProject) li.classList.add('active');

      const folderName = projectPath.split('/').filter(Boolean).pop();

      li.innerHTML = `
        <span class="status-dot"></span>
        <div class="project-info">
          <div class="project-name">${escapeHtml(folderName)}</div>
        </div>
        <button class="remove-btn" title="Remove project">&times;</button>
      `;

      li.addEventListener('click', (e) => {
        if (e.target.closest('.remove-btn')) return;
        selectProject(projectPath);
      });

      li.querySelector('.remove-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        const name = projectPath.split('/').pop();
        if (!confirm(`Remove "${name}" from the project list? Any project settings will be lost.`)) return;
        await removeProject(projectPath);
      });

      projectList.appendChild(li);
    }
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function shouldAutoStartClaude(projectPath) {
  const projectSettings = await window.api.getProjectSettings(projectPath);
  const projectValue = projectSettings.autoStartClaude || 'global';
  if (projectValue === 'yes') return true;
  if (projectValue === 'no') return false;
  const globalSettings = await window.api.getGlobalSettings();
  return globalSettings.autoStartClaude !== false;
}

async function selectProject(projectPath) {
  activeProject = projectPath;

  const tabs = projectTabs.get(projectPath) || [];

  if (tabs.length === 0) {
    const autoStart = await shouldAutoStartClaude(projectPath);
    if (autoStart) {
      await addTerminalTab(projectPath, true);
    }
  }

  showProject(projectPath);
  await renderProjects();
}

async function addTerminalTab(projectPath, launchClaude) {
  const sessionId = generateSessionId(projectPath);
  const label = launchClaude ? 'Claude' : 'Terminal';

  if (!projectTabs.has(projectPath)) {
    projectTabs.set(projectPath, []);
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'terminal-wrapper';
  terminalContainer.appendChild(wrapper);

  const terminal = new Terminal({
    fontSize: 13,
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
    theme: terminalThemes[currentTheme],
    cursorBlink: true,
    scrollback: 10000,
    allowProposedApi: true
  });

  const fitAddon = new FitAddon.FitAddon();
  terminal.loadAddon(fitAddon);

  terminal.onData((data) => {
    window.api.sessionWrite(sessionId, data);
  });

  terminal.onResize(({ cols, rows }) => {
    window.api.sessionResize(sessionId, cols, rows);
  });

  const tab = { sessionId, terminal, fitAddon, wrapper, opened: false, label };
  if (launchClaude) {
    projectTabs.get(projectPath).unshift(tab);
  } else {
    projectTabs.get(projectPath).push(tab);
  }
  sessionToProject.set(sessionId, projectPath);
  activeTabId.set(projectPath, sessionId);

  await window.api.startSession(sessionId, projectPath, launchClaude);
  return sessionId;
}

function showProject(projectPath) {
  emptyState.style.display = 'none';
  terminalContainer.classList.add('visible');
  tabBar.classList.add('visible');

  // Hide all terminal wrappers
  for (const [, tabs] of projectTabs) {
    for (const tab of tabs) {
      tab.wrapper.classList.remove('active');
    }
  }

  const currentSessionId = activeTabId.get(projectPath);
  const tabs = projectTabs.get(projectPath) || [];
  const activeTab = tabs.find(t => t.sessionId === currentSessionId);

  if (activeTab) {
    activeTab.wrapper.classList.add('active');
    if (!activeTab.opened) {
      activeTab.terminal.open(activeTab.wrapper);
      activeTab.opened = true;
    }
    activeTab.fitAddon.fit();
    activeTab.terminal.focus();
  }

  renderTabs(projectPath);
  updateLaunchAppButtons();
}

function switchTab(projectPath, sessionId) {
  activeTabId.set(projectPath, sessionId);
  showProject(projectPath);
}

function renderTabs(projectPath) {
  tabList.innerHTML = '';
  const tabs = projectTabs.get(projectPath) || [];

  for (const tab of tabs) {
    const tabEl = document.createElement('div');
    tabEl.className = 'tab';
    if (tab.sessionId === activeTabId.get(projectPath)) {
      tabEl.classList.add('active');
    }

    const labelSpan = document.createElement('span');
    labelSpan.className = 'tab-label';
    labelSpan.textContent = tab.label;
    tabEl.appendChild(labelSpan);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.title = 'Close terminal';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(projectPath, tab.sessionId);
    });
    tabEl.appendChild(closeBtn);

    tabEl.addEventListener('click', () => {
      switchTab(projectPath, tab.sessionId);
    });

    tabList.appendChild(tabEl);
  }

  const hasClaudeTab = tabs.some(t => t.label === 'Claude');
  addClaudeBtn.style.display = hasClaudeTab ? 'none' : '';
}

async function closeTab(projectPath, sessionId) {
  const tabs = projectTabs.get(projectPath);
  if (!tabs) return;

  const idx = tabs.findIndex(t => t.sessionId === sessionId);
  if (idx === -1) return;

  const tab = tabs[idx];
  await window.api.stopSession(sessionId);
  tab.terminal.dispose();
  tab.wrapper.remove();
  tabs.splice(idx, 1);
  sessionToProject.delete(sessionId);

  if (tabs.length === 0) {
    projectTabs.delete(projectPath);
    activeTabId.delete(projectPath);
    if (activeProject === projectPath) {
      renderTabs(projectPath);
    }
  } else {
    // Switch to another tab if we closed the active one
    if (activeTabId.get(projectPath) === sessionId) {
      const newIdx = Math.min(idx, tabs.length - 1);
      activeTabId.set(projectPath, tabs[newIdx].sessionId);
    }
    showProject(projectPath);
  }

  await renderProjects();
}

async function addProject() {
  const result = await window.api.addProject();
  if (result) await renderProjects();
}

async function removeProject(projectPath) {
  await window.api.removeProject(projectPath);

  const tabs = projectTabs.get(projectPath) || [];
  for (const tab of tabs) {
    tab.terminal.dispose();
    tab.wrapper.remove();
    sessionToProject.delete(tab.sessionId);
  }
  projectTabs.delete(projectPath);
  activeTabId.delete(projectPath);

  if (activeProject === projectPath) {
    activeProject = null;
    tabBar.classList.remove('visible');
    terminalContainer.classList.remove('visible');
    emptyState.style.display = '';
  }

  await renderProjects();
}

window.api.onSessionData((sessionId, data) => {
  const projectPath = sessionToProject.get(sessionId);
  if (!projectPath) return;
  const tabs = projectTabs.get(projectPath) || [];
  const tab = tabs.find(t => t.sessionId === sessionId);
  if (tab) tab.terminal.write(data);
});

window.api.onSessionExit(async (sessionId) => {
  const projectPath = sessionToProject.get(sessionId);
  if (!projectPath) return;
  await closeTab(projectPath, sessionId);
});

window.addEventListener('resize', () => {
  for (const [, tabs] of projectTabs) {
    for (const tab of tabs) {
      tab.fitAddon.fit();
    }
  }
});

addProjectBtn.addEventListener('click', addProject);
addClaudeBtn.addEventListener('click', async () => {
  if (!activeProject) return;
  await addTerminalTab(activeProject, true);
  showProject(activeProject);
  await renderProjects();
});

addTabBtn.addEventListener('click', async () => {
  if (!activeProject) return;
  await addTerminalTab(activeProject, false);
  showProject(activeProject);
  await renderProjects();
});

const usage5hFill = document.getElementById('usage-5h-fill');
const usage5hPct = document.getElementById('usage-5h-pct');
const usage7dFill = document.getElementById('usage-7d-fill');
const usage7dPct = document.getElementById('usage-7d-pct');

function applyUsageLevel(fillEl, pct) {
  fillEl.style.width = Math.min(pct, 100) + '%';
  fillEl.classList.remove('warn', 'critical');
  if (pct >= 80) fillEl.classList.add('critical');
  else if (pct >= 60) fillEl.classList.add('warn');
}

const usageReset = document.getElementById('usage-reset');

function formatResetTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatResetDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

async function updateUsage() {
  const { fiveHour, sevenDay, fiveHourResetsAt, sevenDayResetsAt } = await window.api.getUsage();
  usage5hPct.textContent = Math.round(fiveHour) + '%';
  usage7dPct.textContent = Math.round(sevenDay) + '%';
  applyUsageLevel(usage5hFill, fiveHour);
  applyUsageLevel(usage7dFill, sevenDay);

  const parts = [];
  if (fiveHourResetsAt) {
    parts.push('5h resets ' + formatResetTime(fiveHourResetsAt));
  }
  if (sevenDayResetsAt) {
    parts.push('7d resets ' + formatResetDate(sevenDayResetsAt) + ' ' + formatResetTime(sevenDayResetsAt));
  }
  usageReset.textContent = parts.join(' · ');
}

updateUsage();
setInterval(updateUsage, 30000);

// Settings modal - external apps
function createAppEntryRow(name = '', command = '') {
  const row = document.createElement('div');
  row.className = 'app-entry';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'app-name-input';
  nameInput.placeholder = 'Name';
  nameInput.value = name;

  const commandInput = document.createElement('input');
  commandInput.type = 'text';
  commandInput.className = 'app-command-input';
  commandInput.placeholder = "e.g. open -a 'Visual Studio Code' .";
  commandInput.value = command;

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-app-btn';
  removeBtn.textContent = '\u00d7';
  removeBtn.title = 'Remove app';
  removeBtn.addEventListener('click', () => row.remove());

  row.appendChild(nameInput);
  row.appendChild(commandInput);
  row.appendChild(removeBtn);
  return row;
}

function loadAppsIntoModal(settings) {
  externalAppsList.innerHTML = '';
  const apps = settings.externalApps || [];
  // Migrate old single-command format
  if (apps.length === 0 && settings.externalAppCommand) {
    apps.push({ name: 'Launch App', command: settings.externalAppCommand });
  }
  for (const app of apps) {
    externalAppsList.appendChild(createAppEntryRow(app.name, app.command));
  }
}

function getAppsFromModal() {
  const rows = externalAppsList.querySelectorAll('.app-entry');
  const apps = [];
  for (const row of rows) {
    const name = row.querySelector('.app-name-input').value.trim();
    const command = row.querySelector('.app-command-input').value.trim();
    if (name && command) apps.push({ name, command });
  }
  return apps;
}

addAppBtn.addEventListener('click', () => {
  externalAppsList.appendChild(createAppEntryRow());
  const lastRow = externalAppsList.lastElementChild;
  lastRow.querySelector('.app-name-input').focus();
});

const projectAutoStartSelect = document.getElementById('project-autostart-claude');

projectSettingsBtn.addEventListener('click', async () => {
  if (!activeProject) return;
  const settings = await window.api.getProjectSettings(activeProject);
  projectAutoStartSelect.value = settings.autoStartClaude || 'global';
  loadAppsIntoModal(settings);
  settingsModal.classList.add('visible');
});

settingsCloseBtn.addEventListener('click', () => {
  settingsModal.classList.remove('visible');
});

settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) settingsModal.classList.remove('visible');
});

settingsSaveBtn.addEventListener('click', async () => {
  if (!activeProject) return;
  const settings = await window.api.getProjectSettings(activeProject);
  settings.autoStartClaude = projectAutoStartSelect.value;
  settings.externalApps = getAppsFromModal();
  delete settings.externalAppCommand; // clean up old format
  await window.api.saveProjectSettings(activeProject, settings);
  settingsModal.classList.remove('visible');
  updateLaunchAppButtons();
});

settingsModal.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') settingsModal.classList.remove('visible');
});

// Global settings modal
const globalAutoStartCheckbox = document.getElementById('global-autostart-claude');
const globalThemeSelect = document.getElementById('global-theme');

let themeBeforeModal = null;

globalThemeSelect.addEventListener('change', () => {
  applyTheme(globalThemeSelect.value);
});

function closeGlobalSettingsModal(revert) {
  if (revert && themeBeforeModal) {
    applyTheme(themeBeforeModal);
  }
  themeBeforeModal = null;
  globalSettingsModal.classList.remove('visible');
}

globalSettingsBtn.addEventListener('click', async () => {
  const settings = await window.api.getGlobalSettings();
  themeBeforeModal = settings.theme || 'dark';
  globalThemeSelect.value = themeBeforeModal;
  globalAutoStartCheckbox.checked = settings.autoStartClaude !== false;
  globalAppsList.innerHTML = '';
  const apps = settings.externalApps || [];
  for (const app of apps) {
    globalAppsList.appendChild(createAppEntryRow(app.name, app.command));
  }
  globalSettingsModal.classList.add('visible');
});

globalSettingsCloseBtn.addEventListener('click', () => {
  closeGlobalSettingsModal(true);
});

globalSettingsModal.addEventListener('click', (e) => {
  if (e.target === globalSettingsModal) closeGlobalSettingsModal(true);
});

globalSettingsModal.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeGlobalSettingsModal(true);
});

globalAddAppBtn.addEventListener('click', () => {
  globalAppsList.appendChild(createAppEntryRow());
  globalAppsList.lastElementChild.querySelector('.app-name-input').focus();
});

globalSettingsSaveBtn.addEventListener('click', async () => {
  const rows = globalAppsList.querySelectorAll('.app-entry');
  const apps = [];
  for (const row of rows) {
    const name = row.querySelector('.app-name-input').value.trim();
    const command = row.querySelector('.app-command-input').value.trim();
    if (name && command) apps.push({ name, command });
  }
  const theme = globalThemeSelect.value;
  await window.api.saveGlobalSettings({ theme, autoStartClaude: globalAutoStartCheckbox.checked, externalApps: apps });
  closeGlobalSettingsModal(false);
  updateLaunchAppButtons();
});

// Launch app buttons
async function updateLaunchAppButtons() {
  launchAppButtons.innerHTML = '';
  if (!activeProject) return;

  const globalSettings = await window.api.getGlobalSettings();
  const globalApps = globalSettings.externalApps || [];

  const settings = await window.api.getProjectSettings(activeProject);
  let projectApps = settings.externalApps || [];
  // Migrate old format on the fly
  if (projectApps.length === 0 && settings.externalAppCommand) {
    projectApps = [{ name: 'Launch App', command: settings.externalAppCommand }];
  }

  const apps = [...globalApps, ...projectApps];

  for (const app of apps) {
    const btn = document.createElement('button');
    btn.className = 'launch-app-btn';
    btn.textContent = app.name;
    btn.title = app.command;
    btn.addEventListener('click', async () => {
      await window.api.launchExternalApp(activeProject, app.command);
    });
    launchAppButtons.appendChild(btn);
  }
}

loadTheme();
renderProjects();
