/* global Terminal, FitAddon */

const projectList = document.getElementById('project-list');
const addProjectBtn = document.getElementById('add-project-btn');
const terminalContainer = document.getElementById('terminal-container');
const tabBar = document.getElementById('tab-bar');
const tabList = document.getElementById('tab-list');
const addTabBtn = document.getElementById('add-tab-btn');
const emptyState = document.getElementById('empty-state');

// projectTabs: projectPath -> [{ sessionId, terminal, fitAddon, wrapper, opened, label }]
const projectTabs = new Map();
// activeTabId: projectPath -> sessionId (which tab is active per project)
const activeTabId = new Map();
// sessionToProject: sessionId -> projectPath
const sessionToProject = new Map();

let activeProject = null;
let tabCounter = 0;

function generateSessionId(projectPath) {
  return projectPath + '::' + (tabCounter++);
}

async function renderProjects() {
  const projects = await window.api.getProjects();
  projectList.innerHTML = '';

  for (const projectPath of projects) {
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
        <div class="project-path">${escapeHtml(projectPath)}</div>
      </div>
      <button class="remove-btn" title="Remove project">&times;</button>
    `;

    li.addEventListener('click', (e) => {
      if (e.target.closest('.remove-btn')) return;
      selectProject(projectPath);
    });

    li.querySelector('.remove-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      await removeProject(projectPath);
    });

    projectList.appendChild(li);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function selectProject(projectPath) {
  const wasActive = activeProject === projectPath;
  activeProject = projectPath;

  const tabs = projectTabs.get(projectPath) || [];
  const hasClaudeTab = tabs.some(t => t.label === 'Claude');

  if (!hasClaudeTab && (tabs.length === 0 || wasActive)) {
    await addTerminalTab(projectPath, true);
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
    theme: {
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
      tabBar.classList.remove('visible');
      terminalContainer.classList.remove('visible');
      emptyState.style.display = '';
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
addTabBtn.addEventListener('click', async () => {
  if (!activeProject) return;
  await addTerminalTab(activeProject, false);
  showProject(activeProject);
  await renderProjects();
});

renderProjects();
