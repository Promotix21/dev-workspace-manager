//! Desktop / OS integration: open folders, VS Code, system terminal, dependency
//! detection. All use argument arrays — no shell string interpolation.

use serde::Serialize;
use std::path::Path;
use std::process::Command;

fn which(bin: &str) -> bool {
    Command::new("sh")
        .arg("-c")
        .arg(format!("command -v {}", bin))
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[derive(Serialize)]
pub struct Dependencies {
    pub tmux: bool,
    pub git: bool,
    pub code: bool,
    pub messages: Vec<String>,
}

#[tauri::command]
pub fn check_dependencies() -> Dependencies {
    let tmux = which("tmux");
    let git = which("git");
    let code = which("code");
    let mut messages = Vec::new();
    if !tmux {
        messages.push("tmux is not installed. Install with: sudo apt install tmux".into());
    }
    if !git {
        messages.push("git not found — git status will be unavailable.".into());
    }
    if !code {
        messages.push("VS Code CLI (`code`) not found — 'Open in VS Code' disabled.".into());
    }
    Dependencies {
        tmux,
        git,
        code,
        messages,
    }
}

#[tauri::command]
pub fn open_folder(dir: String) -> Result<(), String> {
    if !Path::new(&dir).is_dir() {
        return Err(format!("Directory does not exist: {dir}"));
    }
    Command::new("xdg-open")
        .arg(&dir)
        .spawn()
        .map_err(|e| format!("failed to open file manager: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn open_in_vscode(dir: String) -> Result<(), String> {
    if !which("code") {
        return Err("VS Code CLI (`code`) is not installed.".into());
    }
    Command::new("code")
        .arg(&dir)
        .spawn()
        .map_err(|e| format!("failed to launch VS Code: {e}"))?;
    Ok(())
}

/// Enable/disable launching the app at login by writing a freedesktop autostart
/// entry. Returns the path written (or removed).
#[tauri::command]
pub fn set_autostart(enabled: bool) -> Result<String, String> {
    let mut dir = dirs::config_dir().ok_or("no config dir")?;
    dir.push("autostart");
    let file = dir.join("dev-workspace-manager.desktop");
    if !enabled {
        std::fs::remove_file(&file).ok();
        return Ok(format!("removed {}", file.display()));
    }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // Best-effort binary path: current exe.
    let exe = std::env::current_exe()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "dev-workspace-manager".into());
    let contents = format!(
        "[Desktop Entry]\nType=Application\nName=Dev Workspace Manager\nExec={exe}\nX-GNOME-Autostart-enabled=true\nTerminal=false\n"
    );
    std::fs::write(&file, contents).map_err(|e| e.to_string())?;
    Ok(format!("wrote {}", file.display()))
}

/// Open a native system terminal in the directory (best-effort across emulators).
#[tauri::command]
pub fn open_system_terminal(dir: String) -> Result<(), String> {
    if !Path::new(&dir).is_dir() {
        return Err(format!("Directory does not exist: {dir}"));
    }
    let candidates: [(&str, Vec<String>); 5] = [
        ("gnome-terminal", vec!["--working-directory".into(), dir.clone()]),
        ("kgx", vec!["--working-directory".into(), dir.clone()]),
        ("konsole", vec!["--workdir".into(), dir.clone()]),
        ("xterm", vec!["-e".into(), format!("cd '{}'; bash", dir)]),
        ("x-terminal-emulator", vec![]),
    ];
    for (bin, args) in candidates.iter() {
        if which(bin) {
            Command::new(bin)
                .args(args)
                .current_dir(&dir)
                .spawn()
                .map_err(|e| format!("failed to launch {bin}: {e}"))?;
            return Ok(());
        }
    }
    Err("No system terminal emulator found.".into())
}
