import { useMemo, useState } from "react";
import type { Project, ProjectStatus } from "../types";

interface Props {
  projects: Project[];
  statuses: Record<string, ProjectStatus>;
  selectedId: string | null;
  width: number;
  collapsed: boolean;
  multiView: boolean;
  onSelect: (id: string) => void;
  onMultiView: () => void;
  onToggleCollapse: () => void;
  onAdd: () => void;
  onOpenSettings: () => void;
  onHome: () => void;
  onResizeWidth: (w: number) => void;
  onContextProject: (project: Project, x: number, y: number) => void;
  searchRef?: React.RefObject<HTMLInputElement | null>;
}

export function Sidebar({
  projects,
  statuses,
  selectedId,
  width,
  collapsed,
  multiView,
  onSelect,
  onMultiView,
  onToggleCollapse,
  onAdd,
  onOpenSettings,
  onHome,
  onResizeWidth,
  onContextProject,
  searchRef,
}: Props) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.directory.toLowerCase().includes(q),
    );
  }, [projects, query]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(180, Math.min(420, startW + (ev.clientX - startX)));
      onResizeWidth(w);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const currentWidth = collapsed ? 44 : width;

  if (collapsed) {
    return (
      <aside className="sidebar sidebar-collapsed" style={{ width: currentWidth, minWidth: currentWidth, alignItems: "center" }}>
        <div
          className="sidebar-top"
          style={{ padding: "10px 0 6px" }}
         
        >
          <button className="icon-btn" style={{ fontSize: '16px' }} onClick={onToggleCollapse} title="Expand Sidebar (Ctrl+B)">
            »
          </button>
        </div>
        <div className="sidebar-views" style={{ padding: "10px 0" }}>
          <button className="icon-btn" style={{ fontSize: '16px', marginBottom: '8px' }} onClick={onHome} title="Dashboard">
            ▤
          </button>
          <button
            className={`icon-btn ${multiView ? "active" : ""}`}
            style={{ fontSize: '16px' }}
            onClick={onMultiView}
            title="All Terminals"
          >
            ⊞
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <div className="sidebar-bottom" style={{ padding: "10px 0", borderTop: "none" }}>
          <button className="icon-btn" style={{ fontSize: '16px' }} onClick={onOpenSettings} title="Settings">
            ⚙
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar" style={{ width: currentWidth, minWidth: currentWidth }}>
      <div
        className="sidebar-top"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
       
      >
        <button className="brand" onClick={onHome} title="Dashboard">
          <span className="brand-mark">▤</span> Dev Workspace
        </button>
        <button className="icon-btn" onClick={onToggleCollapse} title="Collapse Sidebar (Ctrl+B)">
          «
        </button>
      </div>
      <div className="sidebar-views">
        <button
          className={`icon-btn ${multiView ? "active" : ""}`}
          onClick={onMultiView}
          title="All Terminals"
        >
          ⊞ All Terminals
        </button>
      </div>
      <div className="sidebar-search">
        <input
          ref={searchRef}
          placeholder="Search projects  (Ctrl+K)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="sidebar-label">PROJECTS</div>
      <div className="project-list">
        {filtered.length === 0 && (
          <div className="empty-hint">No projects. Add one below.</div>
        )}
        {filtered.map((p, i) => {
          const st = statuses[p.id];
          const running = st?.running;
          return (
            <button
              key={p.id}
              className={`project-item ${selectedId === p.id ? "active" : ""}`}
              onClick={() => onSelect(p.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                onContextProject(p, e.clientX, e.clientY);
              }}
              title={`${p.name}\n${p.directory}${i < 9 ? `\n(Ctrl+${i + 1})` : ""}`}
            >
              <span className={`dot ${running ? "dot-run" : "dot-stop"}`} />
              <span className="project-name">{p.name}</span>
              {st?.git_branch && (
                <span className="project-branch">{st.git_branch}</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="sidebar-bottom">
        <button className="btn btn-primary block" onClick={onAdd}>
          + Add Project
        </button>
        <button className="btn block" onClick={onOpenSettings}>
          ⚙ Settings
        </button>
      </div>
      <div className="sidebar-resizer" onMouseDown={startResize} />
    </aside>
  );
}
