import React, { useState } from "react";
import type { Project, ProjectStatus, Settings } from "../types";
import { TerminalPane } from "./TerminalPane";
import * as api from "../api";

interface TerminalSlot {
  project: Project;
  paneIndex: number;
}

interface Props {
  projects: Project[];
  statuses: Record<string, ProjectStatus>;
  settings: Settings;
  onProjectsChanged: () => void | Promise<unknown>;
}

const PER_PAGE = 4;

export function MultiView({
  projects,
  settings,
  onProjectsChanged,
}: Props) {
  const [page, setPage] = useState(0);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const slots: TerminalSlot[] = projects.flatMap((project) =>
    project.terminals.map((_, paneIndex) => ({ project, paneIndex })),
  );

  const totalPages = Math.max(1, Math.ceil(slots.length / PER_PAGE));
  const clampedPage = Math.min(page, totalPages - 1);
  const start = clampedPage * PER_PAGE;

  const projectCount = projects.filter((p) => p.terminals.length > 0).length;

  // Permanently remove a terminal from here too: kill the tmux window, drop it
  // from the project config, then reload projects so the slot leaves the grid.
  const killTerminal = async (project: Project, paneIndex: number) => {
    const term = project.terminals[paneIndex];
    if (!term) return;
    if (
      settings.confirm_kill &&
      !confirm(
        `Remove terminal "${term.name}" from "${project.name}"? This kills its process and deletes it.`,
      )
    )
      return;
    try {
      await api.killTerminal(project.id, paneIndex);
    } catch (e) {
      console.error("[terminal] kill window failed (continuing to remove)", e);
    }
    const terminals = project.terminals.filter((_, i) => i !== paneIndex);
    await api.saveProject({ ...project, terminals });
    await onProjectsChanged();
  };

  if (slots.length === 0) {
    return (
      <div className="multi-empty">
        <h2>No terminals configured</h2>
        <p className="muted">
          Add terminals to your projects and they will appear here.
        </p>
      </div>
    );
  }

  const pageSlots = slots.slice(start, start + PER_PAGE);
  const count = pageSlots.length;

  // Layout: 1→full, 2→side by side, 3→3 columns, 4→2×2
  const cols = count <= 3 ? count : 2;
  const gridStyle: React.CSSProperties = {
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gridTemplateRows: count === 4 ? "1fr 1fr" : "1fr",
  };

  return (
    <div className="multi-view">
      <div className="multi-header">
        <span className="multi-title">All Terminals</span>
        <span className="multi-meta">
          {slots.length} terminal{slots.length !== 1 ? "s" : ""} across{" "}
          {projectCount} project{projectCount !== 1 ? "s" : ""}
        </span>
        {totalPages > 1 && (
          <div className="multi-page-nav">
            <button
              className="btn"
              disabled={clampedPage === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Prev
            </button>
            <span className="multi-page-label">
              Page {clampedPage + 1} / {totalPages}
            </span>
            <button
              className="btn"
              disabled={clampedPage === totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      <div className="multi-grid" style={gridStyle}>
        {pageSlots.map((slot) => {
          const key = `${slot.project.id}-${slot.paneIndex}`;
          return (
            <div key={key} className="multi-cell">
              <TerminalPane
                project={slot.project}
                terminal={slot.project.terminals[slot.paneIndex]}
                paneIndex={slot.paneIndex}
                fontSize={settings.font_size}
                scrollback={settings.scrollback}
                fullscreen={false}
                active={activeKey === key}
                projectLabel={slot.project.name}
                onFocus={() => setActiveKey(key)}
                onToggleFullscreen={() => {}}
                onDuplicate={() => {}}
                onRename={() => {}}
                onKill={() => killTerminal(slot.project, slot.paneIndex)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
