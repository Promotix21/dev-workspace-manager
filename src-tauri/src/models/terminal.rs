use serde::{Deserialize, Serialize};

/// A single terminal definition inside a project.
/// This is stored in configuration and used to create a tmux window.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalDef {
    /// Stable id, unique within a project. Also used as the tmux window name.
    pub id: String,
    pub name: String,
    /// Startup command. Empty string == plain shell (no auto command).
    #[serde(default)]
    pub command: String,
    /// Whether the startup command runs automatically when the window is created.
    #[serde(default = "default_true")]
    pub run_automatically: bool,
    /// Optional working-directory override (falls back to project.directory).
    #[serde(default)]
    pub cwd: Option<String>,
    /// Optional environment variables (KEY=VALUE) applied to the window.
    #[serde(default)]
    pub env: Vec<EnvVar>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}

fn default_true() -> bool {
    true
}
