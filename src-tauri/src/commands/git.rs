//! Git information. Uses the `git` CLI with argument arrays. Never blocks the app
//! if the directory is not a repository — returns `None`/clean instead.

use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
pub struct GitInfo {
    pub is_repo: bool,
    pub branch: Option<String>,
    pub dirty: bool,
}

fn git_in(dir: &str, args: &[&str]) -> Option<String> {
    if !Path::new(dir).is_dir() {
        return None;
    }
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .ok()?;
    if out.status.success() {
        Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        None
    }
}

pub fn info(dir: &str) -> GitInfo {
    // Is this inside a work tree?
    let is_repo = git_in(dir, &["rev-parse", "--is-inside-work-tree"])
        .map(|s| s == "true")
        .unwrap_or(false);
    if !is_repo {
        return GitInfo {
            is_repo: false,
            branch: None,
            dirty: false,
        };
    }
    let branch = git_in(dir, &["rev-parse", "--abbrev-ref", "HEAD"])
        .filter(|b| !b.is_empty());
    let dirty = git_in(dir, &["status", "--porcelain"])
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    GitInfo {
        is_repo: true,
        branch,
        dirty,
    }
}

#[tauri::command]
pub fn git_info(dir: String) -> GitInfo {
    info(&dir)
}
