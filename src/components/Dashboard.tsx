import type { Project, ProjectStatus } from "../types";

interface Props {
  projects: Project[];
  statuses: Record<string, ProjectStatus>;
  onOpen: (id: string) => void;
  onAdd: () => void;
}

export function Dashboard({ projects, statuses, onOpen, onAdd }: Props) {
  return (
    <div className="dashboard">
      <header className="dash-header">
        <h1>Dev Workspaces</h1>
        <button className="btn btn-primary" onClick={onAdd}>
          + Add Project
        </button>
      </header>
      {projects.length === 0 ? (
        <div className="dash-empty">
          <h2>No projects yet</h2>
          <p className="muted">
            Add a project to create your first persistent terminal workspace.
          </p>
          <button className="btn btn-primary" onClick={onAdd}>
            + Add Project
          </button>
        </div>
      ) : (
        <div className="card-grid">
          {projects.map((p) => {
            const st = statuses[p.id];
            return (
              <button
                key={p.id}
                className="card"
                onClick={() => onOpen(p.id)}
              >
                <div className="card-title">
                  <span
                    className={`dot ${st?.running ? "dot-run" : "dot-stop"}`}
                  />
                  {p.name}
                </div>
                <div className="card-meta">
                  {st?.running ? "Running" : "Stopped"} · {p.terminals.length}{" "}
                  terminal{p.terminals.length === 1 ? "" : "s"}
                </div>
                {st?.git_branch && (
                  <div className="card-branch">
                    {st.git_branch}
                    {st.git_dirty ? " *" : ""}
                  </div>
                )}
                <div className="card-dir">{p.directory}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
