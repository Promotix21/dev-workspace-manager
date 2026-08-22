//! PTY layer. Each visible pane gets a real pseudo-terminal running
//! `tmux attach-session -t <view>`. Output is streamed to the frontend over
//! Tauri events; input and resize come back in through commands.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use log::{debug, error, info};
use once_cell::sync::Lazy;
use portable_pty::{Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

/// One live PTY session bound to a pane.
struct PtyHandle {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

static REGISTRY: Lazy<Mutex<HashMap<String, PtyHandle>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Spawn a PTY for `pane_id` that attaches to the tmux `view` session.
/// If a PTY already exists for this pane_id it is torn down first (reconnect).
pub fn spawn_attach(
    app: AppHandle,
    pane_id: String,
    view_session: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    // Reconnect semantics: drop any prior handle for this pane first.
    kill(&pane_id);

    let pty_system = portable_pty::native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("openpty failed: {e}"))?;

    let mut cmd = CommandBuilder::new("tmux");
    cmd.args(["attach-session", "-t", &format!("={}", view_session)]);
    cmd.env("TERM", "xterm-256color");

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("failed to spawn tmux attach: {e}"))?;

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("failed to clone reader: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("failed to take writer: {e}"))?;

    info!("PTY spawned for pane {pane_id} -> {view_session} ({cols}x{rows})");

    {
        let mut reg = REGISTRY.lock().unwrap();
        reg.insert(
            pane_id.clone(),
            PtyHandle {
                master: pair.master,
                writer,
                child,
            },
        );
    }

    // Reader thread: pump PTY output to the frontend as base64 chunks.
    let out_event = format!("pty://output/{pane_id}");
    let exit_event = format!("pty://exit/{pane_id}");
    let reader = Arc::new(Mutex::new(reader));
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut r = reader.lock().unwrap();
        loop {
            match r.read(&mut buf) {
                Ok(0) => {
                    debug!("PTY EOF for pane {pane_id}");
                    break;
                }
                Ok(n) => {
                    let encoded = B64.encode(&buf[..n]);
                    if let Err(e) = app.emit(&out_event, encoded) {
                        error!("emit output failed for {pane_id}: {e}");
                        break;
                    }
                }
                Err(e) => {
                    debug!("PTY read error for {pane_id}: {e}");
                    break;
                }
            }
        }
        let _ = app.emit(&exit_event, ());
        REGISTRY.lock().unwrap().remove(&pane_id);
        info!("PTY reader ended for pane {pane_id}");
    });

    Ok(())
}

/// Write raw bytes (already decoded) to the pane's PTY.
pub fn write(pane_id: &str, data: &[u8]) -> Result<(), String> {
    let mut reg = REGISTRY.lock().unwrap();
    let handle = reg
        .get_mut(pane_id)
        .ok_or_else(|| format!("no PTY for pane {pane_id}"))?;
    handle
        .writer
        .write_all(data)
        .map_err(|e| format!("write failed: {e}"))?;
    handle.writer.flush().ok();
    Ok(())
}

/// Resize the pane's PTY (which resizes the tmux client, hence the window).
pub fn resize(pane_id: &str, cols: u16, rows: u16) -> Result<(), String> {
    let reg = REGISTRY.lock().unwrap();
    let handle = reg
        .get(pane_id)
        .ok_or_else(|| format!("no PTY for pane {pane_id}"))?;
    handle
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("resize failed: {e}"))?;
    debug!("resized pane {pane_id} -> {cols}x{rows}");
    Ok(())
}

/// Tear down the PTY for a pane (detaches the tmux client; does NOT kill tmux).
pub fn kill(pane_id: &str) {
    if let Some(mut handle) = REGISTRY.lock().unwrap().remove(pane_id) {
        let _ = handle.child.kill();
        debug!("killed PTY for pane {pane_id}");
    }
}
