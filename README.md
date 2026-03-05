# Claude Controller

A desktop app for managing multiple Claude CLI sessions across your projects. Each project gets its own terminal with a dedicated Claude session, all accessible from a single window.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- macOS, Windows, or Linux

## Setup

```bash
npm install
```

## Usage

### Run in development

```bash
npm start
```

### Managing projects

1. Click the **+** button in the sidebar to add a project folder.
2. Click a project in the sidebar to open a Claude session in that project's directory.
3. The status dot next to each project shows whether a session is running.
4. Click the **×** button on a project to remove it from the list (this also stops any active session).
5. If a session ends, click the project again to restart it.

### Terminal

Each project gets a full terminal (xterm.js) running Claude CLI. You can interact with Claude just as you would in a regular terminal. Switching between projects preserves each session's state.

## Building distributables

```bash
# macOS
npm run dist:mac

# Windows
npm run dist:win

# Linux
npm run dist:linux
```

Build output goes to the `dist/` directory.
