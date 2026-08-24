import { useEffect, useRef, useState } from "react";
import { Terminal, type TerminalHandle } from "./Terminal";
import { ContextMenu } from "./ContextMenu";
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
  onKill: () => void;
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
  onKill,
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

  // Permanently remove this terminal: the parent kills the tmux window AND
  // deletes it from the project config so it does not reappear on reconnect.
  const kill = () => {
    setMenuOpen(false);
    onKill();
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

  const [ctxMenu, setCtxMenu] = useState<{x: number, y: number, items: any[]}|null>(null);

  const handleContextMenu = (e: MouseEvent, hasSelection: boolean) => {
    const items: any[] = [
      {
        label: "Copy",
        disabled: !hasSelection,
        onClick: () => termRef.current?.copySelection()
      },
      {
        label: "Paste",
        onClick: () => termRef.current?.pasteClipboard()
      },
      "sep",
      {
        label: "Select All",
        onClick: () => termRef.current?.selectAll()
      }
    ];
    setCtxMenu({ x: e.clientX, y: e.clientY, items });
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
            title="Remove terminal (kills its process and deletes it)"
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
                  <button onClick={kill}>Remove terminal</button>
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
          interactionProfile={terminal.interaction_profile}
          onReady={() => setRunning(true)}
          onExit={() => setRunning(false)}
          onFocus={onFocus}
          onContextMenu={handleContextMenu}
        />
        {ctxMenu && (
           <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />
        )}
      </div>
    </div>
  );
}
