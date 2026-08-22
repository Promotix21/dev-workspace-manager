#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPS_DIR="$HOME/.local/share/applications"
APPLET_ID="dev-workspace-manager-applet"

echo "Installing COSMIC panel applet: $APPLET_ID"

# 1. Install the applet .desktop file
mkdir -p "$APPS_DIR"
cp "$HERE/$APPLET_ID.desktop" "$APPS_DIR/"
update-desktop-database "$APPS_DIR" 2>/dev/null || true

# 2. Add to COSMIC panel config if not present
PANEL_CONFIG_DIR="$HOME/.config/cosmic/com.system76.CosmicPanel.Panel/v1"
WINGS_FILE="$PANEL_CONFIG_DIR/plugins_wings"

if [[ -f "$WINGS_FILE" ]]; then
    # Simple check if already added
    if grep -q "\"$APPLET_ID\"" "$WINGS_FILE"; then
        echo "Applet is already in the panel configuration."
    else
        echo "Adding applet to panel left wing..."
        # Backup the config
        cp "$WINGS_FILE" "${WINGS_FILE}.bak"
        # We want to insert `"dev-workspace-manager-applet", ` after the first `[`
        # This is a bit fragile with sed, but works for the standard RON format
        sed -i "0,/\\[/s/\\[/\\[\n    \"$APPLET_ID\",/" "$WINGS_FILE"
        echo "Configuration updated. Restarting cosmic-panel..."
        killall cosmic-panel || true
    fi
else
    echo "Warning: COSMIC panel configuration not found at $WINGS_FILE"
    echo "You may need to manually add '$APPLET_ID' to your panel config."
fi

echo "Done!"
