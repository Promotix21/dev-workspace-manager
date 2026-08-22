//! Persistence layer (SQLite). Projects and settings are stored as JSON blobs so
//! the nested terminal/layout structures evolve without migrations. This module
//! is the storage abstraction: swapping the backing store means reimplementing
//! only these methods.

use crate::models::{Project, Settings};
use log::info;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Store {
    conn: Mutex<Connection>,
}

fn db_path() -> PathBuf {
    let mut dir = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    dir.push("dev-workspace-manager");
    std::fs::create_dir_all(&dir).ok();
    dir.push("dwm.sqlite");
    dir
}

impl Store {
    pub fn open() -> Result<Self, String> {
        let path = db_path();
        info!("opening store at {}", path.display());
        let conn = Connection::open(&path).map_err(|e| format!("open db: {e}"))?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0
             );
             CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
             );",
        )
        .map_err(|e| format!("init schema: {e}"))?;
        Ok(Store {
            conn: Mutex::new(conn),
        })
    }

    pub fn list_projects(&self) -> Result<Vec<Project>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT data FROM projects ORDER BY sort_order, id")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let mut projects = Vec::new();
        for r in rows {
            let json = r.map_err(|e| e.to_string())?;
            match serde_json::from_str::<Project>(&json) {
                Ok(p) => projects.push(p),
                Err(e) => log::warn!("skipping malformed project row: {e}"),
            }
        }
        Ok(projects)
    }

    pub fn get_project(&self, id: &str) -> Result<Option<Project>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT data FROM projects WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query([id]).map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let json: String = row.get(0).map_err(|e| e.to_string())?;
            let p = serde_json::from_str::<Project>(&json).map_err(|e| e.to_string())?;
            Ok(Some(p))
        } else {
            Ok(None)
        }
    }

    pub fn upsert_project(&self, project: &Project) -> Result<(), String> {
        let json = serde_json::to_string(project).map_err(|e| e.to_string())?;
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO projects (id, data, sort_order) VALUES (?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET data = excluded.data, sort_order = excluded.sort_order",
            rusqlite::params![project.id, json, project.sort_order],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_project(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM projects WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_settings(&self) -> Result<Settings, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT value FROM settings WHERE key = 'app'")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let json: String = row.get(0).map_err(|e| e.to_string())?;
            Ok(serde_json::from_str::<Settings>(&json).unwrap_or_default())
        } else {
            Ok(Settings::default())
        }
    }

    pub fn save_settings(&self, settings: &Settings) -> Result<(), String> {
        let json = serde_json::to_string(settings).map_err(|e| e.to_string())?;
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('app', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [json],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}
