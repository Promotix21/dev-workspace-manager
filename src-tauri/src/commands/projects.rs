//! Project & settings CRUD commands plus derived status.

use crate::commands::git;
use crate::models::{Project, ProjectStatus, Settings};
use crate::services::project_service::Store;
use crate::services::tmux_service;
use tauri::State;

#[tauri::command]
pub fn list_projects(store: State<Store>) -> Result<Vec<Project>, String> {
    store.list_projects()
}

#[tauri::command]
pub fn get_project(store: State<Store>, id: String) -> Result<Option<Project>, String> {
    store.get_project(&id)
}

#[tauri::command]
pub fn save_project(store: State<Store>, project: Project) -> Result<(), String> {
    log::info!("save_project {} ({})", project.name, project.id);
    store.upsert_project(&project)
}

/// Delete a project's configuration. The tmux session is only killed when the
/// caller explicitly asks (`kill_session = true`). We never silently kill.
#[tauri::command]
pub fn delete_project(
    store: State<Store>,
    id: String,
    kill_session: bool,
) -> Result<(), String> {
    if kill_session {
        log::info!("delete_project {id} + kill session (explicit)");
        tmux_service::kill_master(&id, 16).ok();
    } else {
        log::info!("delete_project {id} (config only, session left alone)");
    }
    store.delete_project(&id)
}

/// Live status for every project, derived from real tmux + git state.
#[tauri::command]
pub fn project_statuses(store: State<Store>) -> Result<Vec<ProjectStatus>, String> {
    let projects = store.list_projects()?;
    let mut out = Vec::new();
    for p in projects {
        let wc = tmux_service::window_count(&p.id);
        let g = git::info(&p.directory);
        out.push(ProjectStatus {
            id: p.id.clone(),
            running: wc > 0,
            window_count: wc,
            git_branch: g.branch,
            git_dirty: g.dirty,
        });
    }
    Ok(out)
}

#[tauri::command]
pub fn get_settings(store: State<Store>) -> Result<Settings, String> {
    store.get_settings()
}

#[tauri::command]
pub fn save_settings(store: State<Store>, settings: Settings) -> Result<(), String> {
    store.save_settings(&settings)
}
