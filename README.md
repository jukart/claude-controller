# Claude Controller

A desktop app for managing multiple Claude CLI sessions across your projects. Each project gets its own terminal tabs — a dedicated Claude session plus additional shell terminals — all accessible from a single window.

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
3. The status dot next to each project shows whether any sessions are running.
4. Click the **×** button on a project to remove it from the list (this also stops all active sessions).
5. Click the active project again to restart its Claude session if it was closed.

### Terminals

Each project gets a tab bar above the terminal area. The first tab auto-launches Claude CLI. You can open additional plain shell terminals with the **+** button in the tab bar. Tabs close automatically when their session ends, or you can close them manually with the **×** on each tab. Switching between projects preserves each session's state.

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
