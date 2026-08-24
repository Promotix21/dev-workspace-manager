import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Dependencies,
  LayoutSizes,
  Project,
  ProjectStatus,
  Settings,
  TerminalDef,
} from "../types";
import { LAYOUTS } from "../lib/layouts";
import { Split } from "./Split";
import { TerminalPane } from "./TerminalPane";
import * as api from "../api";

interface Props {
  project: Project;
  status?: ProjectStatus;
  settings: Settings;
  deps?: Dependencies | null;
  onEdit: () => void;
  onDelete: () => void;
  onProjectChanged: () => void;
  refreshStatus: () => void;
}

export function Workspace({
  project,
  status,
  settings,
  deps,
  onEdit,
  onDelete,
  onProjectChanged,
  refreshStatus,
}: Props) {
  const layout = LAYOUTS[project.layout] ?? LAYOUTS["grid-4"];
  const [fullscreenSlot, setFullscreenSlot] = useState<number | null>(null);
  const [activeSlot, setActiveSlot] = useState(0);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);

  // Local, immediately-responsive copy of the persisted layout sizes.
  const [sizes, setSizes] = useState<LayoutSizes>(project.layout_sizes ?? {});
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    setFullscreenSlot(null);
    setActiveSlot(0);
    setPage(0);
    setSizes(project.layout_sizes ?? {});
  }, [project.id, project.layout]);

  // Ctrl+Shift+F toggles fullscreen for the active pane.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "F" || e.key === "f")) {
        e.preventDefault();
        setFullscreenSlot((cur) => (cur === null ? activeSlot : null));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeSlot]);

  const persist = useCallback(
    async (next: Project) => {
      await api.saveProject(next);
      onProjectChanged();
    },
    [onProjectChanged],
  );

  // Debounced persistence of pane ratios — never writes on every mousemove.
  const onResize = useCallback(
    (path: string, next: number[]) => {
      setSizes((cur) => {
        const merged = { ...cur, [path]: next };
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
          api
            .saveProject({ ...project, layout_sizes: merged })
            .catch((e) => console.error("[layout] save sizes failed", e));
        }, 500);
        return merged;
      });
    },
    [project],
  );

  const setLayout = async (key: Project["layout"]) => {
    await persist({ ...project, layout: key });
  };

  const duplicateTerminal = async (index: number) => {
    const src = project.terminals[index];
    const copy: TerminalDef = {
      ...src,
      id: `${src.id}-copy-${Date.now().toString(36)}`,
      name: `${src.name} (copy)`,
    };
    const terminals = [...project.terminals];
    terminals.splice(index + 1, 0, copy);
    await persist({ ...project, terminals });
  };

  const renameTerminal = async (index: number, name: string) => {
    const terminals = project.terminals.map((t, i) =>
      i === index ? { ...t, name } : t,
    );
    await persist({ ...project, terminals });
  };

  // Permanently remove a terminal: kill its tmux window first (while its
  // pane_index is still valid), then drop it from the config so it does not get
  // recreated on the next reconnect.
  const killTerminal = async (index: number) => {
    const term = project.terminals[index];
    if (!term) return;
    if (
      settings.confirm_kill &&
      !confirm(
        `Remove terminal "${term.name}"? This kills its process and deletes it from the workspace.`,
      )
    )
      return;
    try {
      await api.killTerminal(project.id, index);
    } catch (e) {
      // The window may already be gone; removal from config should still proceed.
      console.error("[terminal] kill window failed (continuing to remove)", e);
    }
    if (fullscreenSlot === index) setFullscreenSlot(null);
    const terminals = project.terminals.filter((_, i) => i !== index);
    await persist({ ...project, terminals });
  };

  const doAction = async (fn: () => Promise<unknown>, label: string) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      alert(`${label} failed: ${e}`);
    } finally {
      setBusy(false);
      refreshStatus();
    }
  };

  const renderLeaf = (slot: number) => {
    const terminal = project.terminals[slot];
    if (!terminal) {
      return <div className="pane pane-empty">No terminal in slot {slot + 1}</div>;
    }
    return (
      <TerminalPane
        key={terminal.id}
        project={project}
        terminal={terminal}
        paneIndex={slot}
        fontSize={settings.font_size}
        scrollback={settings.scrollback}
        fullscreen={fullscreenSlot === slot}
        active={activeSlot === slot}
        onFocus={() => setActiveSlot(slot)}
        onToggleFullscreen={() =>
          setFullscreenSlot((cur) => (cur === slot ? null : slot))
        }
        onDuplicate={() => duplicateTerminal(slot)}
        onRename={(name) => renameTerminal(slot, name)}
        onKill={() => killTerminal(slot)}
      />
    );
  };

  const PER_PAGE = 4;
  const renderAllLayout = () => {
    const count = project.terminals.length;
    const totalPages = Math.max(1, Math.ceil(count / PER_PAGE));
    const clampedPage = Math.min(page, totalPages - 1);
    const start = clampedPage * PER_PAGE;
    return (
      <div className="all-layout">
        <div className="all-grid">
          {[0, 1, 2, 3].map((i) => {
            const slot = start + i;
            return (
              <div key={slot} className="all-cell">
                {slot < count
                  ? renderLeaf(slot)
                  : <div className="pane pane-empty" />}
              </div>
            );
          })}
        </div>
        {totalPages > 1 && (
          <div className="all-pagination">
            <button
              className="btn"
              disabled={clampedPage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ← Prev
            </button>
            <span className="all-page-info">
              Page {clampedPage + 1} / {totalPages}
              <span className="all-page-sub"> · {count} terminals</span>
            </span>
            <button
              className="btn"
              disabled={clampedPage === totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    );
  };

  const codeAvailable = deps?.code ?? true;

  return (
    <div className="workspace">
      <header className="ws-header">
        <div className="ws-title">
          <span className="ws-name">{project.name}</span>
          {status?.git_branch && (
            <span className="ws-branch">
              {status.git_branch}
              {status.git_dirty ? " *" : ""}
            </span>
          )}
          <span className={`badge ${status?.running ? "badge-run" : "badge-stop"}`}>
            {status?.running
              ? `running · ${status.window_count} terminals`
              : "stopped"}
          </span>
        </div>
        <div className="ws-tools">
          <select
            className="layout-select"
            value={project.layout}
            onChange={(e) => setLayout(e.target.value as Project["layout"])}
            title="Workspace layout"
          >
            {Object.values(LAYOUTS).map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
          <div className="divider-v" />
          <button
            className="btn"
            disabled={busy}
            title="Start / reconnect the whole workspace"
            onClick={() => doAction(() => api.startWorkspace(project.id), "Start")}
          >
            Start
          </button>
          <button
            className="btn"
            disabled={busy}
            title="Restart the ENTIRE workspace (all terminals)"
            onClick={() => {
              if (
                settings.confirm_kill &&
                !confirm(
                  `Restart the ENTIRE workspace "${project.name}"? This kills and recreates all terminals.`,
                )
              )
                return;
              doAction(() => api.restartWorkspace(project.id), "Restart workspace");
            }}
          >
            Restart Workspace
          </button>
          <button
            className="btn btn-danger"
            disabled={busy}
            title="Stop the whole workspace (kills the tmux session)"
            onClick={() => {
              if (
                settings.confirm_kill &&
                !confirm(
                  `Stop workspace "${project.name}"? This kills the tmux session and all running processes.`,
                )
              )
                return;
              doAction(() => api.stopWorkspace(project.id), "Stop");
            }}
          >
            Stop
          </button>
          <div className="divider-v" />
          <button
            className="btn"
            onClick={() => api.openFolder(project.directory).catch(alert)}
          >
            Folder
          </button>
          <button
            className="btn"
            disabled={!codeAvailable}
            title={
              codeAvailable
                ? "Open in VS Code"
                : "VS Code CLI (`code`) not found on PATH"
            }
            onClick={() => api.openInVscode(project.directory).catch(alert)}
          >
            VS Code
          </button>
          <button
            className="btn"
            onClick={() => api.openSystemTerminal(project.directory).catch(alert)}
          >
            Terminal
          </button>
          <div className="divider-v" />
          <button className="btn" onClick={onEdit}>
            Edit
          </button>
          <button className="btn btn-danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </header>

      <div className="ws-body">
        {fullscreenSlot !== null ? (
          renderLeaf(fullscreenSlot)
        ) : project.layout === "all" ? (
          renderAllLayout()
        ) : (
          <Split
            node={layout.tree}
            renderLeaf={renderLeaf}
            sizes={sizes}
            onResize={onResize}
          />
        )}
      </div>
    </div>
  );
}
