use crate::models::ServerProfile;
use crate::services::server_service::ServerStore;
use std::sync::Mutex;
use tauri::State;

#[tauri::command]
pub fn get_servers(store: State<'_, Mutex<ServerStore>>) -> Result<Vec<ServerProfile>, String> {
    store.lock().unwrap().list_servers()
}

#[tauri::command]
pub fn get_server(id: String, store: State<'_, Mutex<ServerStore>>) -> Result<Option<ServerProfile>, String> {
    store.lock().unwrap().get_server(&id)
}

#[tauri::command]
pub fn upsert_server(
    server: ServerProfile,
    secret: Option<String>,
    store: State<'_, Mutex<ServerStore>>,
) -> Result<(), String> {
    store.lock().unwrap().upsert_server(&server, secret.as_deref())
}

#[tauri::command]
pub fn delete_server(id: String, store: State<'_, Mutex<ServerStore>>) -> Result<(), String> {
    store.lock().unwrap().delete_server(&id)
}

#[tauri::command]
pub fn test_server_connection(id: String, store: State<'_, Mutex<ServerStore>>) -> Result<String, String> {
    let s = store.lock().unwrap();
    let server = s.get_server(&id)?.ok_or_else(|| "Server not found".to_string())?;
    let secret = s.get_secret(&id)?;
    // Dummy test for now: in a real app, you'd use ssh2 or std::process::Command to ssh
    // We just simulate success and show that we safely retrieved the secret
    log::info!("Testing connection to {}@{}", server.username, server.host);
    if server.auth_type == "password" && secret.is_none() {
        return Err("Password required but not stored".to_string());
    }
    
    // Simulate connection
    Ok("Connection successful".to_string())
}
