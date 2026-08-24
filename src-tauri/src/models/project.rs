use super::terminal::TerminalDef;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub directory: String,
    /// Layout key: one, two-v, two-h, three, grid-4, grid-6.
    #[serde(default = "default_layout")]
    pub layout: String,
    #[serde(default)]
    pub terminals: Vec<TerminalDef>,
    /// Whether the workspace should auto-start when the app launches.
    #[serde(default)]
    pub start_with_app: bool,
    /// Optional per-project pane-size ratios for the layout (0.0..1.0).
    #[serde(default)]
    pub layout_sizes: Option<serde_json::Value>,
    #[serde(default)]
    pub sort_order: i64,
    #[serde(default)]
    pub servers: Option<Vec<String>>,
}

fn default_layout() -> String {
    "grid-4".to_string()
}

/// Runtime status of a project, derived from live tmux state (never trust the FE).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectStatus {
    pub id: String,
    pub running: bool,
    pub window_count: usize,
    pub git_branch: Option<String>,
    pub git_dirty: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default = "default_shell")]
    pub default_shell: String,
    #[serde(default = "default_font_size")]
    pub font_size: u16,
    #[serde(default = "default_scrollback")]
    pub scrollback: u32,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_true")]
    pub confirm_kill: bool,
    #[serde(default = "default_true")]
    pub restore_last_project: bool,
    #[serde(default)]
    pub start_at_login: bool,
    #[serde(default)]
    pub default_project_dir: Option<String>,
    #[serde(default)]
    pub last_project_id: Option<String>,
    #[serde(default = "default_sidebar_width")]
    pub sidebar_width: u16,
    #[serde(default)]
    pub sidebar_collapsed: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            default_shell: default_shell(),
            font_size: default_font_size(),
            scrollback: default_scrollback(),
            theme: default_theme(),
            confirm_kill: true,
            restore_last_project: true,
            start_at_login: false,
            default_project_dir: None,
            last_project_id: None,
            sidebar_width: default_sidebar_width(),
            sidebar_collapsed: false,
        }
    }
}

fn default_sidebar_width() -> u16 {
    240
}

fn default_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
}
fn default_font_size() -> u16 {
    13
}
fn default_scrollback() -> u32 {
    10000
}
fn default_theme() -> String {
    "dark".to_string()
}
fn default_true() -> bool {
    true
}
