#!/usr/bin/env bash
# Install a local .desktop launcher + icon for Dev Workspace Manager.
# Works for a dev build (points at the debug binary) or an installed binary.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

# Resolve a binary: prefer an installed one on PATH, else the release/debug build.
BIN="$(command -v dev-workspace-manager || true)"
if [[ -z "$BIN" ]]; then
  for c in "$ROOT/src-tauri/target/release/dev-workspace-manager" \
           "$ROOT/src-tauri/target/debug/dev-workspace-manager"; do
    [[ -x "$c" ]] && BIN="$c" && break
  done
fi
if [[ -z "$BIN" ]]; then
  echo "No dev-workspace-manager binary found. Build it first: npm run tauri build" >&2
  exit 1
fi

APPS_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/128x128/apps"
mkdir -p "$APPS_DIR" "$ICON_DIR"

install -m644 "$ROOT/src-tauri/icons/128x128.png" "$ICON_DIR/dev-workspace-manager.png"

sed "s|^Exec=.*|Exec=$BIN|" "$HERE/dev-workspace-manager.desktop" \
  > "$APPS_DIR/dev-workspace-manager.desktop"
chmod +x "$APPS_DIR/dev-workspace-manager.desktop"

update-desktop-database "$APPS_DIR" 2>/dev/null || true
gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" 2>/dev/null || true

echo "Installed launcher -> $APPS_DIR/dev-workspace-manager.desktop"
echo "Using binary       -> $BIN"
