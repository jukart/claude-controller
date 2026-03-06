# Releases

## unreleased

- Add light theme with global settings toggle (Catppuccin Latte)
- Add auto-start Claude setting (global and per-project) to control whether Claude launches on first project click
- Custom About dialog with app icon, version, and GitHub link
- Fix external app launch buttons not responding to clicks
- Improve tab bar spacing and button alignment

## v1.3.0

- Replace auto-launch Claude with manual Claude button in tab bar
- Fix usage bars always empty by handling non-200 API responses
- Normalize API utilization values (0-1 fraction to percentage)

## v1.2.0

- Add global settings and project settings modals
- Add external app launcher with configurable buttons
- Add delete confirmation for project removal
- Add app icon and distributable DMG config
- Add usage percentage bars with reset times to sidebar
- Group projects by parent folder in sidebar

## v1.1.0

- Multi-terminal tabs per project

## v1.0.0

- Initial release
- Manage multiple Claude CLI sessions, one per project directory
- Terminal rendering with xterm.js and node-pty
- Sidebar project list with directory picker
