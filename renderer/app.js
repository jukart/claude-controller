/* global Terminal, FitAddon */

const projectList = document.getElementById('project-list');
const addProjectBtn = document.getElementById('add-project-btn');
const terminalContainer = document.getElementById('terminal-container');
const emptyState = document.getElementById('empty-state');

const terminals = new Map();
let activeProject = null;

async function renderProjects() {
  const projects = await window.api.getProjects();
  projectList.innerHTML = '';

  for (const projectPath of projects) {
    const li = document.createElement('li');
    const isActive = await window.api.sessionActive(projectPath);
    if (isActive) li.classList.add('running');
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
  activeProject = projectPath;

  const isActive = await window.api.sessionActive(projectPath);
  if (!isActive) {
    // Clean up old terminated terminal if any
    const oldEntry = terminals.get(projectPath);
    if (oldEntry) {
      oldEntry.terminal.dispose();
      oldEntry.wrapper.remove();
      terminals.delete(projectPath);
    }
    createTerminal(projectPath);
    await window.api.startSession(projectPath);
  }

  showTerminal(projectPath);
  await renderProjects();
}

function createTerminal(projectPath) {
  if (terminals.has(projectPath)) return;

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
    window.api.sessionWrite(projectPath, data);
  });

  terminal.onResize(({ cols, rows }) => {
    window.api.sessionResize(projectPath, cols, rows);
  });

  terminals.set(projectPath, { terminal, fitAddon, wrapper, opened: false });
}

function showTerminal(projectPath) {
  emptyState.style.display = 'none';
  terminalContainer.classList.add('visible');

  for (const [, { wrapper }] of terminals) {
    wrapper.classList.remove('active');
  }

  const entry = terminals.get(projectPath);
  if (entry) {
    entry.wrapper.classList.add('active');
    if (!entry.opened) {
      entry.terminal.open(entry.wrapper);
      entry.opened = true;
    }
    entry.fitAddon.fit();
    entry.terminal.focus();
  }
}

async function addProject() {
  const result = await window.api.addProject();
  if (result) await renderProjects();
}

async function removeProject(projectPath) {
  await window.api.removeProject(projectPath);

  const entry = terminals.get(projectPath);
  if (entry) {
    entry.terminal.dispose();
    entry.wrapper.remove();
    terminals.delete(projectPath);
  }

  if (activeProject === projectPath) {
    activeProject = null;
    terminalContainer.classList.remove('visible');
    emptyState.style.display = '';
  }

  await renderProjects();
}

window.api.onSessionData((projectPath, data) => {
  const entry = terminals.get(projectPath);
  if (entry) entry.terminal.write(data);
});

window.api.onSessionExit(async (projectPath, exitCode) => {
  const entry = terminals.get(projectPath);
  if (entry) {
    entry.terminal.writeln(`\r\n\x1b[33m--- Session ended (exit code: ${exitCode}) ---\x1b[0m`);
    entry.terminal.writeln(`\x1b[90mClick the project again to restart.\x1b[0m`);
  }
  await renderProjects();
});

window.addEventListener('resize', () => {
  for (const [, { fitAddon }] of terminals) {
    fitAddon.fit();
  }
});

addProjectBtn.addEventListener('click', addProject);

// Also update preload - addProject now takes no args (dialog is in main process)
renderProjects();
