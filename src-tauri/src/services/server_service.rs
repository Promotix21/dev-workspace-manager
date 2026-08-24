use crate::models::ServerProfile;
use keyring::Entry;
use log::{info, warn};
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct ServerStore {
    conn: Mutex<Connection>,
}

fn db_path() -> PathBuf {
    let mut dir = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    dir.push("dev-workspace-manager");
    std::fs::create_dir_all(&dir).ok();
    dir.push("dwm.sqlite");
    dir
}

impl ServerStore {
    pub fn open() -> Result<Self, String> {
        let path = db_path();
        info!("opening server store at {}", path.display());
        let conn = Connection::open(&path).map_err(|e| format!("open db: {e}"))?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS servers (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL
             );"
        ).map_err(|e| format!("init servers schema: {e}"))?;
        Ok(ServerStore {
            conn: Mutex::new(conn),
        })
    }

    pub fn list_servers(&self) -> Result<Vec<ServerProfile>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT data FROM servers ORDER BY id")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let mut servers = Vec::new();
        for r in rows {
            let json = r.map_err(|e| e.to_string())?;
            match serde_json::from_str::<ServerProfile>(&json) {
                Ok(s) => servers.push(s),
                Err(e) => warn!("skipping malformed server row: {e}"),
            }
        }
        Ok(servers)
    }

    pub fn get_server(&self, id: &str) -> Result<Option<ServerProfile>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT data FROM servers WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query([id]).map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let json: String = row.get(0).map_err(|e| e.to_string())?;
            let s = serde_json::from_str::<ServerProfile>(&json).map_err(|e| e.to_string())?;
            Ok(Some(s))
        } else {
            Ok(None)
        }
    }

    pub fn upsert_server(&self, server: &ServerProfile, secret: Option<&str>) -> Result<(), String> {
        let json = serde_json::to_string(server).map_err(|e| e.to_string())?;
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO servers (id, data) VALUES (?1, ?2)
             ON CONFLICT(id) DO UPDATE SET data = excluded.data",
            rusqlite::params![server.id, json],
        )
        .map_err(|e| e.to_string())?;

        // Update keyring if secret is provided
        if let Some(sec) = secret {
            let entry = Entry::new("dev-workspace-manager", &server.id).map_err(|e| e.to_string())?;
            entry.set_password(sec).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn delete_server(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM servers WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        
        // Remove from keyring
        let entry = Entry::new("dev-workspace-manager", id).map_err(|e| e.to_string())?;
        let _ = entry.delete_credential(); // ignore error if no secret was stored
        Ok(())
    }

    pub fn get_secret(&self, id: &str) -> Result<Option<String>, String> {
        let entry = Entry::new("dev-workspace-manager", id).map_err(|e| e.to_string())?;
        match entry.get_password() {
            Ok(pw) => Ok(Some(pw)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
}
