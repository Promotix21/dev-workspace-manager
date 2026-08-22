import { useMemo, useState } from "react";
import type { Project, ProjectStatus } from "../types";

interface Props {
  projects: Project[];
  statuses: Record<string, ProjectStatus>;
  selectedId: string | null;
  width: number;
  multiView: boolean;
  onSelect: (id: string) => void;
  onMultiView: () => void;
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
  multiView,
  onSelect,
  onMultiView,
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

  return (
    <aside className="sidebar" style={{ width, minWidth: width }}>
      <div className="sidebar-top">
        <button className="brand" onClick={onHome} title="Dashboard">
          <span className="brand-mark">▤</span> Dev Workspace
        </button>
      </div>
      <div className="sidebar-views">
        <button
          className={`sidebar-view-btn ${multiView ? "active" : ""}`}
          onClick={onMultiView}
          title="View all terminals from all projects in a grid"
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
