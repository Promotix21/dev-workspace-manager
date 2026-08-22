# Dev Workspace Manager - COSMIC Panel Integration

This directory contains integration files for the Pop!_OS COSMIC desktop environment.

It uses `cosmic-panel-button` to render a panel applet that can launch and focus
the Dev Workspace Manager without creating multiple instances.

## Installation

Run the installation script to add the applet to your local user profile:

```bash
./install.sh
```

This script will:
1. Copy the applet's `.desktop` file to `~/.local/share/applications/`
2. Safely inject the applet ID into your COSMIC panel configuration
3. Restart `cosmic-panel` so the changes take effect immediately

No root privileges are required. It only modifies your user files.

## Uninstallation

Run the uninstallation script:

```bash
./uninstall.sh
```
