//! tmux control layer.
//!
//! Model:
//! * One **master** session per project: `devws_<id>`, with one *window* per
//!   configured terminal. Startup commands run here, exactly once, at window
//!   creation. This is what persists across GUI restarts.
//! * One **grouped view** session per visible pane: `devws_<id>__v<idx>`, created
//!   with `new-session -t <master>`. Grouped sessions share the window list but
//!   keep their own active window and their own size, so each xterm pane can show
//!   a different window at its own dimensions. Killing a view never touches the
//!   master or its running processes.
//!
//! All tmux invocations use argument arrays (never a shell string), so project
//! names cannot inject shell commands. The only place a user command reaches a
//! shell is `send-keys`, which literally types it into the target window's shell
//! — exactly as if the user typed it — and cannot escape into our process.

use crate::models::{Project, TerminalDef};
use log::{debug, warn};
use std::io::Write as StdWrite;
use std::process::{Command, Output, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};

/// Sanitize an arbitrary id into a tmux-safe token: `[a-z0-9_-]`.
/// tmux session/window names must not contain `.`, `:` or whitespace.
pub fn sanitize(input: &str) -> String {
    let s: String = input
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = s.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "x".to_string()
    } else {
        trimmed
    }
}

pub fn master_name(project_id: &str) -> String {
    format!("devws_{}", sanitize(project_id))
}

pub fn view_name(project_id: &str, pane_index: usize) -> String {
    format!("devws_{}__v{}", sanitize(project_id), pane_index)
}

fn window_name(term: &TerminalDef) -> String {
    sanitize(&term.id)
}

/// Build a log-safe representation of tmux args. Redacts anything that could
/// carry a secret: user command bodies (`send-keys ... -- <cmd>`) and env values
/// (`-e KEY=VALUE`). We never want passwords / tokens in debug logs.
fn redact_args(args: &[&str]) -> String {
    let mut out: Vec<String> = Vec::with_capacity(args.len());
    let mut i = 0;
    let is_send_keys = args.first().map(|a| *a == "send-keys").unwrap_or(false);
    while i < args.len() {
        let a = args[i];
        if a == "-e" && i + 1 < args.len() {
            // Keep the KEY, drop the VALUE.
            let kv = args[i + 1];
            let key = kv.split('=').next().unwrap_or("");
            out.push("-e".into());
            out.push(format!("{key}=<redacted>"));
            i += 2;
            continue;
        }
        if is_send_keys && a == "--" {
            out.push("-- <redacted user command>".into());
            break;
        }
        out.push(a.to_string());
        i += 1;
    }
    out.join(" ")
}

/// Run tmux with the given args, returning the raw Output. Logs a redacted form.
fn tmux(args: &[&str]) -> std::io::Result<Output> {
    debug!("[tmux] {}", redact_args(args));
    Command::new("tmux").args(args).output()
}

/// Run tmux and return Ok(stdout) on success, Err(stderr) on failure.
fn tmux_checked(args: &[&str]) -> Result<String, String> {
    let out = tmux(args).map_err(|e| format!("failed to spawn tmux: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        Err(err)
    }
}

pub fn is_installed() -> bool {
    Command::new("tmux")
        .arg("-V")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn session_exists(name: &str) -> bool {
    tmux(&["has-session", "-t", &format!("={}", name)])
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Number of windows in the master session, or 0 if it does not exist.
pub fn window_count(project_id: &str) -> usize {
    let master = master_name(project_id);
    if !session_exists(&master) {
        return 0;
    }
    tmux(&["list-windows", "-t", &format!("={}", master), "-F", "#{window_id}"])
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).lines().count())
        .unwrap_or(0)
}

/// Create the master session if it does not exist. Idempotent: if the session
/// already exists this is a no-op and NO startup commands run again.
/// Returns true if it created the session (i.e. commands were started).
pub fn ensure_master(project: &Project) -> Result<bool, String> {
    let master = master_name(&project.id);
    let session_up = session_exists(&master);
    if session_up {
        debug!("master {master} already exists — syncing missing windows");
    } else {
        if project.terminals.is_empty() {
            return Err("project has no terminals defined".into());
        }
        debug!("creating master session {master} with {} windows", project.terminals.len());
    }

    let mut created_any = false;

    // Helper to check if a window exists
    let window_exists = |wname: &str| -> bool {
        let out = tmux_checked(&["list-windows", "-t", &format!("={master}"), "-F", "#{window_name}"]);
        if let Ok(list) = out {
            list.lines().any(|l| l == wname)
        } else {
            false
        }
    };

    for (i, term) in project.terminals.iter().enumerate() {
        let wname = window_name(term);
        
        if session_up && window_exists(&wname) {
            continue;
        }

        let cwd = term
            .cwd
            .clone()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| project.directory.clone());

        // Build args. Collect owned strings first so &str borrows stay valid.
        let mut env_args: Vec<String> = Vec::new();
        for ev in &term.env {
            if ev.key.trim().is_empty() {
                continue;
            }
            env_args.push("-e".into());
            env_args.push(format!("{}={}", ev.key, ev.value));
        }

        if !session_up && i == 0 {
            let mut args: Vec<&str> = vec![
                "new-session", "-d", "-s", &master, "-n", &wname, "-c", &cwd, "-x", "200",
                "-y", "50",
            ];
            for a in &env_args {
                args.push(a);
            }
            tmux_checked(&args)
                .map_err(|e| format!("tmux new-session failed: {e}"))?;
            created_any = true;
        } else {
            let mut args: Vec<&str> =
                vec!["new-window", "-d", "-t", &master, "-n", &wname, "-c", &cwd];
            for a in &env_args {
                args.push(a);
            }
            tmux_checked(&args)
                .map_err(|e| format!("tmux new-window failed: {e}"))?;
            created_any = true;
        }

        // Run the startup command, if configured, by typing it into the window.
        if term.run_automatically && !term.command.trim().is_empty() {
            let target = format!("={}:={}", master, wname);
            debug!("[terminal] auto-start command in window '{wname}' (body redacted)");
            tmux_checked(&["send-keys", "-t", &target, "--", &term.command, "Enter"])
                .map_err(|e| format!("tmux send-keys failed: {e}"))?;
        }
    }

    Ok(created_any)
}

/// Ensure a grouped view session bound to the master exists, and lock it to the
/// window for `pane_index`. Returns the view session name to attach a PTY to.
pub fn ensure_view(project: &Project, pane_index: usize) -> Result<String, String> {
    let master = master_name(&project.id);
    if !session_exists(&master) {
        return Err(format!("master session {master} does not exist"));
    }
    let term = project
        .terminals
        .get(pane_index)
        .ok_or_else(|| format!("no terminal at index {pane_index}"))?;
    let wname = window_name(term);
    let view = view_name(&project.id, pane_index);

    if !session_exists(&view) {
        // Grouped session: shares windows with master, independent active window/size.
        tmux_checked(&["new-session", "-d", "-s", &view, "-t", &master])
            .map_err(|e| format!("failed to create grouped view {view}: {e}"))?;
        // Hide tmux's own status bar in this view — the app renders its own pane
        // header, so the green tmux bar would just be clutter. This is a per-view
        // (client) option and does not affect the master or other panes.
        let _ = tmux(&["set-option", "-t", &view, "status", "off"]);
        // Keep tmux out of the way of interactive apps: don't intercept the mouse
        // (let xterm.js own selection + wheel scrollback).
        let _ = tmux(&["set-option", "-t", &view, "mouse", "off"]);
    }
    // Lock this view to its window (exact-name match avoids base-index surprises).
    let target = format!("={}:={}", view, wname);
    if let Err(e) = tmux_checked(&["select-window", "-t", &target]) {
        warn!("select-window {target} failed: {e}");
    }
    Ok(view)
}

/// Kill only the grouped view sessions for a project (leaves master + processes).
pub fn kill_views(project_id: &str, max_panes: usize) {
    for i in 0..max_panes {
        let v = view_name(project_id, i);
        if session_exists(&v) {
            let _ = tmux(&["kill-session", "-t", &format!("={}", v)]);
        }
    }
}

/// Kill the entire workspace: master + all views. This DOES terminate processes.
pub fn kill_master(project_id: &str, max_panes: usize) -> Result<(), String> {
    kill_views(project_id, max_panes.max(16));
    let master = master_name(project_id);
    if session_exists(&master) {
        tmux_checked(&["kill-session", "-t", &format!("={}", master)])
            .map_err(|e| format!("failed to kill master {master}: {e}"))?;
    }
    Ok(())
}

/// Monotonic counter used to give each paste operation a unique tmux buffer
/// name, so two panes pasting concurrently never clobber each other's buffer.
static PASTE_BUF_SEQ: AtomicU64 = AtomicU64::new(0);

/// Paste `text` into the tmux pane for `pane_index` using tmux's own
/// paste-buffer mechanism. Unlike writing raw bytes to the PTY, this lets tmux
/// wrap the content in bracketed-paste markers when the inner application has
/// requested them (e.g. Antigravity). Without this, xterm.js does not know
/// that the inner app wants bracketed paste (tmux intercepts \x1b[?2004h and
/// never passes it to the outer terminal), so term.paste() would send raw \r
/// for every newline, submitting each line as a separate prompt.
pub fn paste_text(project_id: &str, pane_index: usize, text: &str) -> Result<(), String> {
    let view = view_name(project_id, pane_index);
    if !session_exists(&view) {
        return Err(format!("view session {view} does not exist"));
    }
    // Unique per-paste buffer name: pid + a process-wide sequence number. A
    // single global name would race if two panes pasted at the same time.
    let seq = PASTE_BUF_SEQ.fetch_add(1, Ordering::Relaxed);
    let buf = format!("dwm-paste-{}-{}", std::process::id(), seq);

    // Load text from stdin into a named tmux buffer.
    let mut child = Command::new("tmux")
        .args(["load-buffer", "-b", &buf, "-"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("tmux load-buffer spawn failed: {e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(text.as_bytes())
            .map_err(|e| format!("tmux load-buffer write failed: {e}"))?;
    }
    let st = child.wait().map_err(|e| format!("tmux load-buffer wait failed: {e}"))?;
    if !st.success() {
        return Err("tmux load-buffer failed".into());
    }

    // Paste into the view session.
    //   -p  wrap the buffer in bracketed-paste control codes when the inner
    //       application requested bracketed paste mode. Without this the app
    //       receives ordinary line-separated input and submits each line as its
    //       own prompt (the Antigravity multiline regression).
    //   -r  do no LF->CR replacement, so real newlines survive inside the
    //       bracketed-paste block instead of becoming Enter keypresses.
    //   -d  delete the buffer once pasted (unique name, so nothing else needs it).
    let target = format!("={view}");
    tmux_checked(&["paste-buffer", "-p", "-r", "-d", "-b", &buf, "-t", &target])
        .map_err(|e| format!("tmux paste-buffer failed: {e}"))?;

    Ok(())
}

/// Kill a single window (one terminal) within the master session.
/// Idempotent: if the window or session no longer exists, returns Ok.
pub fn kill_window(project: &Project, pane_index: usize) -> Result<(), String> {
    let master = master_name(&project.id);
    if !session_exists(&master) {
        return Ok(());
    }
    if let Some(term) = project.terminals.get(pane_index) {
        let target = format!("={}:={}", master, window_name(term));
        // Ignore "no such window" — it's already gone, which is the desired state.
        let _ = tmux(&["kill-window", "-t", &target]);
    }
    Ok(())
}

/// Restart a terminal: kill any running process in its window and re-run command.
/// Implemented by respawning the window's pane (keeps the window/index stable).
pub fn restart_window(project: &Project, pane_index: usize) -> Result<(), String> {
    let master = master_name(&project.id);
    let term = project
        .terminals
        .get(pane_index)
        .ok_or_else(|| format!("no terminal at index {pane_index}"))?;
    let wname = window_name(term);
    let target = format!("={}:={}", master, wname);
    let cwd = term
        .cwd
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| project.directory.clone());

    // respawn-pane -k restarts the pane's process with a fresh shell.
    tmux_checked(&["respawn-pane", "-k", "-t", &target, "-c", &cwd])
        .map_err(|e| format!("failed to respawn pane: {e}"))?;

    if term.run_automatically && !term.command.trim().is_empty() {
        tmux_checked(&["send-keys", "-t", &target, "--", &term.command, "Enter"])
            .map_err(|e| format!("failed to re-run command: {e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_unsafe() {
        assert_eq!(sanitize("Celebrate Festival"), "celebrate-festival");
        assert_eq!(sanitize("feat/ads.v2"), "feat-ads-v2");
        assert_eq!(sanitize("  "), "x");
        // underscores are valid tmux name chars, so they are preserved
        assert_eq!(sanitize("__weird__"), "__weird__");
        assert_eq!(sanitize("a.b:c d"), "a-b-c-d");
    }

    #[test]
    fn names_are_stable() {
        assert_eq!(master_name("celebrate-festival"), "devws_celebrate-festival");
        assert_eq!(view_name("celebrate-festival", 2), "devws_celebrate-festival__v2");
    }

    #[test]
    fn redacts_secrets_in_logs() {
        // User command bodies must never appear in logs.
        let sk = redact_args(&["send-keys", "-t", "=s:=w", "--", "mysql -psecret", "Enter"]);
        assert!(sk.contains("<redacted user command>"));
        assert!(!sk.contains("secret"));
        // Env values must be redacted, keys kept for debuggability.
        let nw = redact_args(&["new-window", "-t", "s", "-e", "TOKEN=abc123", "-n", "w"]);
        assert!(nw.contains("TOKEN=<redacted>"));
        assert!(!nw.contains("abc123"));
        // Non-sensitive args are untouched.
        assert_eq!(redact_args(&["has-session", "-t", "=x"]), "has-session -t =x");
    }
}
