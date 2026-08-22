#!/usr/bin/env bash
set -euo pipefail

APPS_DIR="$HOME/.local/share/applications"
APPLET_ID="dev-workspace-manager-applet"

echo "Uninstalling COSMIC panel applet: $APPLET_ID"

# 1. Remove the applet .desktop file
if [[ -f "$APPS_DIR/$APPLET_ID.desktop" ]]; then
    rm "$APPS_DIR/$APPLET_ID.desktop"
    update-desktop-database "$APPS_DIR" 2>/dev/null || true
    echo "Removed .desktop file."
fi

# 2. Remove from COSMIC panel config
PANEL_CONFIG_DIR="$HOME/.config/cosmic/com.system76.CosmicPanel.Panel/v1"
WINGS_FILE="$PANEL_CONFIG_DIR/plugins_wings"

if [[ -f "$WINGS_FILE" ]]; then
    if grep -q "\"$APPLET_ID\"" "$WINGS_FILE"; then
        echo "Removing applet from panel configuration..."
        cp "$WINGS_FILE" "${WINGS_FILE}.bak"
        # Remove the exact string and optional trailing comma/whitespace
        sed -i "s/^[[:space:]]*\"$APPLET_ID\",*//g" "$WINGS_FILE"
        sed -i "s/\"$APPLET_ID\",*[[:space:]]*//g" "$WINGS_FILE"
        echo "Configuration updated. Restarting cosmic-panel..."
        killall cosmic-panel || true
    fi
fi

echo "Done!"
