//! Terminal (pane) commands: connect a PTY to a tmux view, stream I/O, resize.

use crate::models::Project;
use crate::services::project_service::Store;
use crate::services::{pty_service, tmux_service};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use tauri::{AppHandle, State};

/// Deterministic pane id so reconnects map to the same PTY slot.
fn pane_id(project_id: &str, pane_index: usize) -> String {
    format!("{project_id}::{pane_index}")
}

/// Ensure the master + the grouped view for this pane exist, then attach a PTY.
/// Returns the pane_id the frontend must use for events / write / resize.
#[tauri::command]
pub fn connect_terminal(
    app: AppHandle,
    store: State<Store>,
    project_id: String,
    pane_index: usize,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let project: Project = store
        .get_project(&project_id)?
        .ok_or_else(|| format!("project {project_id} not found"))?;

    // Guard: tmux silently tolerates a missing -c directory, so check it here to
    // surface a clear error instead of starting the shell in the wrong place.
    if !std::path::Path::new(&project.directory).is_dir() {
        return Err(format!(
            "Project directory no longer exists: {}",
            project.directory
        ));
    }

    log::info!("[workspace] opening {} (pane {pane_index})", project_id);
    // Idempotent: creates master + runs startup commands only if not already up.
    let created = tmux_service::ensure_master(&project)?;
    log::info!(
        "[tmux] master {} {}",
        tmux_service::master_name(&project_id),
        if created { "created" } else { "already exists" }
    );
    let view = tmux_service::ensure_view(&project, pane_index)?;
    log::info!("[terminal] attaching pane {pane_index} -> {view}");

    let id = pane_id(&project_id, pane_index);
    pty_service::spawn_attach(app, id.clone(), view, cols.max(2), rows.max(2))?;
    Ok(id)
}

#[tauri::command]
pub fn write_terminal(pane_id: String, data: String) -> Result<(), String> {
    let bytes = B64
        .decode(data.as_bytes())
        .map_err(|e| format!("bad base64 input: {e}"))?;
    pty_service::write(&pane_id, &bytes)
}

#[tauri::command]
pub fn resize_terminal(pane_id: String, cols: u16, rows: u16) -> Result<(), String> {
    pty_service::resize(&pane_id, cols.max(2), rows.max(2))
}

/// Detach the PTY (tmux session and its process keep running).
#[tauri::command]
pub fn disconnect_terminal(pane_id: String) {
    pty_service::kill(&pane_id);
}

/// Restart the process inside a terminal's tmux window.
#[tauri::command]
pub fn restart_terminal(
    store: State<Store>,
    project_id: String,
    pane_index: usize,
) -> Result<(), String> {
    let project = store
        .get_project(&project_id)?
        .ok_or_else(|| format!("project {project_id} not found"))?;
    tmux_service::restart_window(&project, pane_index)
}

/// Paste clipboard text into a terminal using tmux's paste-buffer mechanism.
/// This correctly handles bracketed-paste mode for inner applications such as
/// Antigravity, which tmux tracks independently of the outer xterm.js session.
#[tauri::command]
pub fn paste_to_terminal(
    store: State<Store>,
    project_id: String,
    pane_index: usize,
    text: String,
) -> Result<(), String> {
    let _ = store
        .get_project(&project_id)?
        .ok_or_else(|| format!("project {project_id} not found"))?;
    tmux_service::paste_text(&project_id, pane_index, &text)
}

/// Paste an image from the system clipboard into a terminal. The image is saved
/// to a temp PNG and its path is pasted, since terminals accept image files by
/// path (Claude Code, Codex, ...). Returns the written path, or errors when the
/// clipboard holds no image so the frontend can ignore the attempt.
#[tauri::command]
pub fn paste_image_to_terminal(
    store: State<Store>,
    project_id: String,
    pane_index: usize,
) -> Result<String, String> {
    let _ = store
        .get_project(&project_id)?
        .ok_or_else(|| format!("project {project_id} not found"))?;
    tmux_service::paste_image(&project_id, pane_index)
}

/// Kill a single terminal's tmux window.
#[tauri::command]
pub fn kill_terminal(
    store: State<Store>,
    project_id: String,
    pane_index: usize,
) -> Result<(), String> {
    let project = store
        .get_project(&project_id)?
        .ok_or_else(|| format!("project {project_id} not found"))?;
    tmux_service::kill_window(&project, pane_index)
}
