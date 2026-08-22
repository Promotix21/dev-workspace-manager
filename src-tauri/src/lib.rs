mod commands;
mod models;
mod services;

use services::project_service::Store;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialise logging (RUST_LOG overrides; default info for our crate).
    let _ = env_logger::Builder::from_env(
        env_logger::Env::default().default_filter_or("info,dwm_lib=debug"),
    )
    .try_init();

    let store = Store::open().expect("failed to open configuration store");

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(store)
        .invoke_handler(tauri::generate_handler![
            // projects & settings
            commands::projects::list_projects,
            commands::projects::get_project,
            commands::projects::save_project,
            commands::projects::delete_project,
            commands::projects::project_statuses,
            commands::projects::get_settings,
            commands::projects::save_settings,
            // workspace lifecycle
            commands::tmux::check_tmux,
            commands::tmux::start_workspace,
            commands::tmux::stop_workspace,
            commands::tmux::restart_workspace,
            commands::tmux::workspace_status,
            // terminals
            commands::terminal::connect_terminal,
            commands::terminal::write_terminal,
            commands::terminal::resize_terminal,
            commands::terminal::disconnect_terminal,
            commands::terminal::restart_terminal,
            commands::terminal::kill_terminal,
            // git
            commands::git::git_info,
            // system
            commands::system::check_dependencies,
            commands::system::open_folder,
            commands::system::open_in_vscode,
            commands::system::open_system_terminal,
            commands::system::set_autostart,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
