# Dev Workspace Manager

A persistent, multi-project **terminal workspace manager** for Linux. Define your
projects once, then open their saved terminal workspace instantly — Claude Code,
dev servers, shells, SSH/logs — all as real interactive terminals **inside one
application**, backed by tmux so nothing dies when you close the window.

> Not a terminal emulator. It's a workspace manager on top of tmux.

## Stack

- **Tauri v2** (Rust backend) — not Electron
- **React + TypeScript** frontend
- **xterm.js** terminal rendering (FitAddon, WebLinks, Search)
- **portable-pty** real PTYs
- **tmux** persistence layer
- **SQLite** (rusqlite, bundled) for configuration

## The persistence model (why it survives GUI close)

tmux normally forces every client of a session to show the *same* active window,
sized to the smallest client — which breaks showing 4 panes at once. This app uses
**grouped sessions**:

- **Master** session per project — `devws_<id>` — one *window* per configured
  terminal. Startup commands run here, exactly once, at window creation. This is
  what persists.
- **Grouped view** session per visible pane — `devws_<id>__v<n>` — created with
  `tmux new-session -t <master>`. Grouped sessions share the window list but keep
  their **own active window and own size**, so each xterm pane shows a different
  window at its own dimensions.

Each pane is a PTY running `tmux attach -t <view>`. Closing the GUI kills only the
lightweight view-clients; the master session and every running process (Claude,
dev servers, …) keep running. Reopening reattaches. Because startup commands only
run at *master creation*, reconnect never duplicates `npm run dev` or `claude`.

## Project layout

```
src-tauri/src/
  main.rs, lib.rs            # Tauri bootstrap + command registry
  models/  project.rs terminal.rs
  services/
    tmux_service.rs          # session naming, grouped sessions, windows (heart)
    pty_service.rs           # PTY spawn, output streaming, resize, teardown
    project_service.rs       # SQLite storage abstraction
  commands/
    projects.rs terminal.rs tmux.rs git.rs system.rs
src/                         # React frontend
  components/  Sidebar Dashboard Workspace TerminalPane Terminal Split
               ProjectForm SettingsModal
  lib/layouts.ts  api.ts  types.ts  styles.css
packaging/                   # .desktop launcher + installer
```

## Prerequisites

- Rust (stable), Node 18+, **tmux**, git. Optional: `code` (VS Code CLI).
- Linux WebKitGTK 4.1 (`webkit2gtk-4.1`, `libsoup-3.0`, gtk3, ayatana-appindicator).

The app detects a missing `tmux` and shows a setup banner instead of crashing.

## Run (development)

```bash
npm install
npm run tauri dev
```

## Build & install a launcher

```bash
npm run tauri build              # release binary + bundles
./packaging/install-desktop.sh   # installs a .desktop entry + icon (local user)
```

Config + DB live at `~/.local/share/dev-workspace-manager/dwm.sqlite`.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+1..9` | Switch project |
| `Ctrl+K` | Focus project search |
| `Ctrl+Shift+T` | Add a terminal to the current project |
| `Ctrl+Shift+F` | Toggle fullscreen of the active pane |
| Double-click pane header | Toggle fullscreen |

(Stored as constants in V1; the structure allows making them configurable later.)

## Layouts

`Single`, `2 · vertical`, `2 · horizontal`, `3 columns`, `4 · grid`, `6 · grid`,
with draggable separators. Layout is persisted per project; the split renderer is
tree-based so fully custom layouts can be added later without touching panes.

## Security notes

- Project/terminal names are **sanitized** before use in tmux ids (`[a-z0-9_-]`).
- All tmux/git/system calls use **argument arrays**, never a shell string, so
  names can't inject commands.
- User startup commands are intentionally arbitrary; they are only ever *typed
  into the target window's shell* via `send-keys` (as if you typed them) and only
  come from the app's own stored configuration — never auto-executed from files
  found in a directory.

## Verified behaviour

Tested end-to-end through the real app:

- ✅ Workspace creates a tmux master + windows; startup commands run once.
- ✅ Real interactive shells (`bash`), `echo`/arithmetic evaluated live.
- ✅ Closing the GUI leaves the tmux session **and** running processes alive.
- ✅ Reopening reconnects; scrollback preserved; **no duplicate commands**
  (startup process PID unchanged across restart).
- ✅ Multiple panes, each locked to its own window at independent sizes.
- ✅ Invalid project directory and missing tmux return clear errors (no crash).
