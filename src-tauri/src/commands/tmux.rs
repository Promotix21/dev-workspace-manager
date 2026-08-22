//! Workspace lifecycle commands (start/stop/restart at the project level).

use crate::models::Project;
use crate::services::project_service::Store;
use crate::services::tmux_service;
use serde::Serialize;
use tauri::State;

#[derive(Serialize)]
pub struct WorkspaceStatus {
    pub running: bool,
    pub window_count: usize,
    pub created: bool,
}

#[tauri::command]
pub fn check_tmux() -> bool {
    tmux_service::is_installed()
}

/// Start (or reconnect to) a project's workspace. Idempotent: startup commands
/// run only when the master session is first created.
#[tauri::command]
pub fn start_workspace(store: State<Store>, project_id: String) -> Result<WorkspaceStatus, String> {
    if !tmux_service::is_installed() {
        return Err("tmux is not installed. Install it with: sudo apt install tmux".into());
    }
    let project: Project = store
        .get_project(&project_id)?
        .ok_or_else(|| format!("project {project_id} not found"))?;

    if !std::path::Path::new(&project.directory).is_dir() {
        return Err(format!(
            "Project directory no longer exists: {}",
            project.directory
        ));
    }

    let created = tmux_service::ensure_master(&project)?;
    Ok(WorkspaceStatus {
        running: true,
        window_count: tmux_service::window_count(&project_id),
        created,
    })
}

#[tauri::command]
pub fn stop_workspace(project_id: String) -> Result<(), String> {
    log::info!("stop_workspace {project_id} (explicit kill)");
    tmux_service::kill_master(&project_id, 16)
}

#[tauri::command]
pub fn restart_workspace(store: State<Store>, project_id: String) -> Result<WorkspaceStatus, String> {
    tmux_service::kill_master(&project_id, 16).ok();
    start_workspace(store, project_id)
}

#[tauri::command]
pub fn workspace_status(project_id: String) -> WorkspaceStatus {
    let wc = tmux_service::window_count(&project_id);
    WorkspaceStatus {
        running: wc > 0,
        window_count: wc,
        created: false,
    }
}
