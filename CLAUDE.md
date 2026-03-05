# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm install` — install dependencies (runs `electron-rebuild` as postinstall to compile native modules)
- `npm start` — run the app in development mode (launches Electron)
- `npm run dist:mac` / `dist:win` / `dist:linux` — build distributable packages to `dist/`

There are no tests or linting configured.

## Architecture

Claude Controller is an Electron app that manages multiple Claude CLI sessions, one per project directory. It uses node-pty to spawn shell processes and xterm.js to render terminals in the UI.

### Process model

- **Main process** (`main.js`): Manages the BrowserWindow, handles IPC, spawns pty sessions, and persists the project list to `projects.json` in the Electron userData directory.
- **Preload** (`preload.js`): Exposes a `window.api` bridge via `contextBridge` with methods for project and session management.
- **Renderer** (`renderer/`): Single-page UI with a sidebar project list and a terminal view area. `app.js` manages terminal instances (one xterm.js `Terminal` per project) and switches between them.

### Key flow

1. User adds a project folder via native directory picker dialog (triggered from main process).
2. Clicking a project spawns a pty shell (`node-pty`) in that directory, then sends `claude\n` after 500ms to auto-launch Claude CLI.
3. Terminal I/O is bridged: pty data → IPC → xterm.js (and reverse for user input).
4. Sessions are tracked in a `Map` keyed by project path. Terminals in the renderer are similarly tracked and shown/hidden when switching projects.

### Dependencies

- `node-pty` — native module, requires rebuild for Electron (handled by `electron-rebuild` postinstall). Must be unpacked from asar (`asarUnpack` in build config).
- `@xterm/xterm` + `@xterm/addon-fit` — loaded directly from `node_modules` via script tags in `index.html` (not bundled).
