import { useEffect, useRef, useState } from "react";
import { Terminal, type TerminalHandle } from "./Terminal";
import type { Project, TerminalDef } from "../types";
import * as api from "../api";

interface Props {
  project: Project;
  terminal: TerminalDef;
  paneIndex: number;
  fontSize: number;
  scrollback: number;
  fullscreen: boolean;
  active: boolean;
  projectLabel?: string;
  onFocus: () => void;
  onToggleFullscreen: () => void;
  onDuplicate: () => void;
  onRename: (name: string) => void;
  onConfigChanged: () => void;
}

export function TerminalPane({
  project,
  terminal,
  paneIndex,
  fontSize,
  scrollback,
  fullscreen,
  active,
  projectLabel,
  onFocus,
  onToggleFullscreen,
  onDuplicate,
  onRename,
  onConfigChanged,
}: Props) {
  const termRef = useRef<TerminalHandle>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [search, setSearch] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Ctrl+Shift+S opens search in the *active* pane only.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "S" || e.key === "s")) {
        e.preventDefault();
        setSearch((s) => (s === null ? "" : s));
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  const restart = async () => {
    setMenuOpen(false);
    try {
      await api.restartTerminal(project.id, paneIndex);
      setReconnectKey((k) => k + 1);
    } catch (e) {
      alert(`Restart terminal failed: ${e}`);
    }
  };

  const kill = async () => {
    setMenuOpen(false);
    try {
      await api.killTerminal(project.id, paneIndex);
      onConfigChanged();
    } catch (e) {
      alert(`Kill failed: ${e}`);
    }
  };

  const rename = () => {
    setMenuOpen(false);
    const name = prompt("Rename terminal", terminal.name);
    // Persists the name only; the underlying tmux window/PTY is untouched.
    if (name && name.trim()) onRename(name.trim());
  };

  const openDir = async () => {
    setMenuOpen(false);
    try {
      await api.openFolder(terminal.cwd || project.directory);
    } catch (e) {
      alert(`${e}`);
    }
  };

  const closeSearch = () => {
    setSearch(null);
    termRef.current?.clearSearch();
    termRef.current?.focus();
  };

  return (
    <div className={`pane ${fullscreen ? "pane-fullscreen" : ""} ${active ? "pane-active" : ""}`}>
      <div
        className="pane-header"
        onDoubleClick={onToggleFullscreen}
        onMouseDown={onFocus}
        title="Double-click to toggle fullscreen"
      >
        {projectLabel && <span className="pane-project-label">{projectLabel}</span>}
        <span className="pane-name">{terminal.name}</span>
        <span className={`dot ${running ? "dot-run" : "dot-stop"}`} />
        <span className="pane-status">{running ? "Running" : "Stopped"}</span>
        <div className="pane-actions">
          <button className="icon-btn" title="Restart terminal" onClick={restart}>
            ⟳
          </button>
          <button
            className="icon-btn icon-btn-kill"
            title="Kill terminal"
            onClick={kill}
          >
            ✕
          </button>
          <button
            className="icon-btn"
            title="Clear screen"
            onClick={() => termRef.current?.clear()}
          >
            ⌫
          </button>
          <button
            className="icon-btn"
            title="Fullscreen (Ctrl+Shift+F)"
            onClick={onToggleFullscreen}
          >
            {fullscreen ? "❑" : "⛶"}
          </button>
          <div className="menu-wrap">
            <button
              className="icon-btn"
              title="Menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              ⋮
            </button>
            {menuOpen && (
              <>
                <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="menu">
                  <button onClick={restart}>Restart terminal</button>
                  <button onClick={kill}>Kill terminal</button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onDuplicate();
                    }}
                  >
                    Duplicate terminal
                  </button>
                  <button onClick={rename}>Rename terminal</button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setSearch("");
                      setTimeout(() => searchInputRef.current?.focus(), 0);
                    }}
                  >
                    Search output (Ctrl+Shift+S)
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onToggleFullscreen();
                    }}
                  >
                    {fullscreen ? "Exit fullscreen" : "Fullscreen pane"}
                  </button>
                  <button onClick={openDir}>Open current directory</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="pane-body">
        {search !== null && (
          <div className="search-overlay">
            <input
              ref={searchInputRef}
              placeholder="Find"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                termRef.current?.findNext(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (e.shiftKey) termRef.current?.findPrevious(search);
                  else termRef.current?.findNext(search);
                } else if (e.key === "Escape") {
                  closeSearch();
                }
              }}
            />
            <button
              className="icon-btn"
              title="Previous (Shift+Enter)"
              onClick={() => termRef.current?.findPrevious(search)}
            >
              ↑
            </button>
            <button
              className="icon-btn"
              title="Next (Enter)"
              onClick={() => termRef.current?.findNext(search)}
            >
              ↓
            </button>
            <button className="icon-btn" title="Close (Esc)" onClick={closeSearch}>
              ✕
            </button>
          </div>
        )}
        <Terminal
          key={reconnectKey}
          ref={termRef}
          projectId={project.id}
          paneIndex={paneIndex}
          fontSize={fontSize}
          scrollback={scrollback}
          onReady={() => setRunning(true)}
          onExit={() => setRunning(false)}
          onFocus={onFocus}
        />
      </div>
    </div>
  );
}
