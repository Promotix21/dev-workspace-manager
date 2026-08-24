import { useCallback, useEffect, useRef, useState } from "react";
import "./styles.css";
import type { Dependencies, Project, ProjectStatus, Settings } from "./types";
import * as api from "./api";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { Workspace } from "./components/Workspace";
import { MultiView } from "./components/MultiView";
import { ProjectForm } from "./components/ProjectForm";
import { SettingsModal } from "./components/SettingsModal";
import { NewTerminalDialog } from "./components/NewTerminalDialog";
import { ServersModal } from "./components/ServersModal";
import { ContextMenu, type MenuItem } from "./components/ContextMenu";
import { DragDropManager } from "./lib/DragDropManager";

type Modal =
  | null
  | { kind: "add" }
  | { kind: "edit"; project: Project }
  | { kind: "settings" }
  | { kind: "servers" }
  | { kind: "new-terminal"; project: Project };

interface Ctx {
  project: Project;
  x: number;
  y: number;
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ProjectStatus>>({});
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [multiView, setMultiView] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [deps, setDeps] = useState<Dependencies | null>(null);
  const [depsDismissed, setDepsDismissed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const autoStarted = useRef(false);
  const widthTimer = useRef<number | null>(null);
  const settingsRef = useRef<Settings | null>(null);
  settingsRef.current = settings;

  const loadProjects = useCallback(async () => {
    const list = await api.listProjects();
    setProjects(list);
    return list;
  }, []);

  const refreshStatuses = useCallback(async () => {
    try {
      const list = await api.projectStatuses();
      const map: Record<string, ProjectStatus> = {};
      for (const s of list) map[s.id] = s;
      setStatuses(map);
    } catch (e) {
      console.error("status refresh failed", e);
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    const currentSettings = settingsRef.current;
    if (!currentSettings) return;
    const nextSettings = {
      ...currentSettings,
      sidebar_collapsed: !currentSettings.sidebar_collapsed
    };
    setSettings(nextSettings);
    api
      .saveSettings(nextSettings)
      .catch((e) => console.error("failed to save sidebar state", e));
  }, []);

  // Initial load.
  useEffect(() => {
    (async () => {
      try {
        setDeps(await api.checkDependencies());
      } catch (e) {
        console.error(e);
      }
      const st = await api.getSettings();
      setSettings(st);
      setSidebarWidth(st.sidebar_width || 240);
      const list = await loadProjects();
      await refreshStatuses();

      if (
        st.restore_last_project &&
        st.last_project_id &&
        list.find((p) => p.id === st.last_project_id)
      ) {
        setSelectedId(st.last_project_id);
      }
      if (!autoStarted.current) {
        autoStarted.current = true;
        for (const p of list) {
          if (p.start_with_app) {
            api
              .startWorkspace(p.id)
              .catch((e) => console.error(`autostart ${p.id} failed`, e));
          }
        }
        setTimeout(refreshStatuses, 800);
      }
    })();
  }, [loadProjects, refreshStatuses]);

  // Refresh on window focus + a gentle safety poll (not aggressive).
  useEffect(() => {
    const onFocus = () => refreshStatuses();
    window.addEventListener("focus", onFocus);
    const t = setInterval(refreshStatuses, 15000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(t);
    };
  }, [refreshStatuses]);

  // Persist last selected project.
  useEffect(() => {
    const s = settingsRef.current;
    if (s && selectedId) {
      api.saveSettings({ ...s, last_project_id: selectedId }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const persistSidebarWidth = useCallback((w: number) => {
    setSidebarWidth(w);
    if (widthTimer.current) window.clearTimeout(widthTimer.current);
    widthTimer.current = window.setTimeout(() => {
      const s = settingsRef.current;
      if (s) api.saveSettings({ ...s, sidebar_width: w }).catch(() => {});
    }, 400);
  }, []);

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && e.key >= "1" && e.key <= "9") {
        const idx = Number(e.key) - 1;
        if (projects[idx]) {
          e.preventDefault();
          setSelectedId(projects[idx].id);
        }
      } else if (e.ctrlKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.ctrlKey && e.shiftKey && (e.key === "T" || e.key === "t")) {
        e.preventDefault();
        const p = projects.find((x) => x.id === selectedId);
        if (p) setModal({ kind: "new-terminal", project: p });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [projects, selectedId]);

  const createTerminal = async (
    project: Project,
    name: string,
    command: string,
    cwd: string,
  ) => {
    const next: Project = {
      ...project,
      terminals: [
        ...project.terminals,
        {
          id: `term-${Math.random().toString(36).slice(2, 8)}`,
          name,
          command,
          run_automatically: command.trim().length > 0,
          cwd: cwd === project.directory ? null : cwd,
          env: [],
        },
      ],
    };
    await api.saveProject(next);
    setModal(null);
    await loadProjects();
    setSelectedId(project.id);
  };

  const onSaveProject = async (project: Project) => {
    await api.saveProject(project);
    setModal(null);
    await loadProjects();
    await refreshStatuses();
    setSelectedId(project.id);
  };

  const onDeleteProject = async (project: Project) => {
    const running = statuses[project.id]?.running;
    let killSession = false;
    if (running) {
      killSession = confirm(
        `Project "${project.name}" has a running tmux session.\n\nOK = also KILL the session (stops all processes).\nCancel = keep the session running, only remove the config.`,
      );
    }
    if (
      !confirm(`Delete project "${project.name}"? This removes its configuration.`)
    )
      return;
    await api.deleteProject(project.id, killSession);
    if (selectedId === project.id) setSelectedId(null);
    await loadProjects();
    await refreshStatuses();
  };

  const onSaveSettings = async (s: Settings) => {
    await api.saveSettings(s);
    if (s.start_at_login !== settings?.start_at_login) {
      api.setAutostart(s.start_at_login).catch((e) =>
        console.error("autostart toggle failed", e),
      );
    }
    setSettings(s);
    setSidebarWidth(s.sidebar_width || sidebarWidth);
    setModal(null);
  };

  const runAndRefresh = async (fn: () => Promise<unknown>, label: string) => {
    try {
      await fn();
    } catch (e) {
      alert(`${label} failed: ${e}`);
    }
    refreshStatuses();
  };

  const buildContextItems = (p: Project): (MenuItem | "sep")[] => {
    const running = statuses[p.id]?.running;
    const items: (MenuItem | "sep")[] = [
      { label: "Open Workspace", onClick: () => setSelectedId(p.id) },
    ];
    if (running) {
      items.push({
        label: "Restart Workspace",
        onClick: () =>
          runAndRefresh(() => api.restartWorkspace(p.id), "Restart"),
      });
      items.push({
        label: "Stop Workspace",
        danger: true,
        onClick: () => {
          if (
            settings?.confirm_kill &&
            !confirm(`Stop workspace "${p.name}"? Kills the tmux session.`)
          )
            return;
          runAndRefresh(() => api.stopWorkspace(p.id), "Stop");
        },
      });
    } else {
      items.push({
        label: "Start Workspace",
        onClick: () => runAndRefresh(() => api.startWorkspace(p.id), "Start"),
      });
    }
    items.push("sep");
    items.push({
      label: "Open Folder",
      onClick: () => api.openFolder(p.directory).catch(alert),
    });
    items.push({
      label: "Open in VS Code",
      disabled: deps ? !deps.code : false,
      onClick: () => api.openInVscode(p.directory).catch(alert),
    });
    items.push({
      label: "Open System Terminal",
      onClick: () => api.openSystemTerminal(p.directory).catch(alert),
    });
    items.push("sep");
    items.push({
      label: "Edit Project",
      onClick: () => setModal({ kind: "edit", project: p }),
    });
    items.push({
      label: "Delete Project",
      danger: true,
      onClick: () => onDeleteProject(p),
    });
    return items;
  };

  const selected = projects.find((p) => p.id === selectedId) ?? null;

  if (!settings) return <div className="loading">Loading…</div>;

  return (
    <div className="app">
      {deps && !deps.tmux && !depsDismissed && (
        <div className="depbar">
          <span>⚠ tmux is not installed — sessions cannot start. </span>
          <code>sudo apt install tmux</code>
          <button onClick={() => setDepsDismissed(true)}>dismiss</button>
        </div>
      )}
      <DragDropManager />
      <div className="main">
        <Sidebar
          projects={projects}
          statuses={statuses}
          selectedId={multiView ? null : selectedId}
          width={sidebarWidth}
          collapsed={settings?.sidebar_collapsed ?? false}
          multiView={multiView}
          onSelect={(id) => { setMultiView(false); setSelectedId(id); }}
          onMultiView={() => setMultiView((v) => !v)}
          onToggleCollapse={toggleSidebar}
          onAdd={() => setModal({ kind: "add" })}
          onOpenSettings={() => setModal({ kind: "settings" })}
          onOpenServers={() => setModal({ kind: "servers" })}
          onHome={() => { setMultiView(false); setSelectedId(null); }}
          onResizeWidth={persistSidebarWidth}
          onContextProject={(project, x, y) => setCtx({ project, x, y })}
          searchRef={searchRef}
        />
        <div className="content">
          {multiView ? (
            <MultiView
              projects={projects}
              statuses={statuses}
              settings={settings}
              onProjectsChanged={loadProjects}
            />
          ) : selected ? (
            <Workspace
              key={selected.id}
              project={selected}
              status={statuses[selected.id]}
              settings={settings}
              deps={deps}
              onEdit={() => setModal({ kind: "edit", project: selected })}
              onDelete={() => onDeleteProject(selected)}
              onProjectChanged={loadProjects}
              refreshStatus={refreshStatuses}
            />
          ) : (
            <Dashboard
              projects={projects}
              statuses={statuses}
              onOpen={(id) => { setMultiView(false); setSelectedId(id); }}
              onAdd={() => setModal({ kind: "add" })}
            />
          )}
        </div>
      </div>

      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          items={buildContextItems(ctx.project)}
          onClose={() => setCtx(null)}
        />
      )}

      {modal?.kind === "add" && (
        <ProjectForm
          existingIds={projects.map((p) => p.id)}
          defaultDir={settings.default_project_dir}
          onCancel={() => setModal(null)}
          onSave={onSaveProject}
        />
      )}
      {modal?.kind === "edit" && (
        <ProjectForm
          initial={modal.project}
          existingIds={projects.map((p) => p.id)}
          defaultDir={settings.default_project_dir}
          onCancel={() => setModal(null)}
          onSave={onSaveProject}
        />
      )}
      {modal?.kind === "settings" && (
        <SettingsModal
          settings={settings}
          onCancel={() => setModal(null)}
          onSave={onSaveSettings}
        />
      )}
      {modal?.kind === "servers" && (
        <ServersModal onCancel={() => setModal(null)} />
      )}
      {modal?.kind === "new-terminal" && (
        <NewTerminalDialog
          projectName={modal.project.name}
          defaultCwd={modal.project.directory}
          onCancel={() => setModal(null)}
          onCreate={(name, command, cwd) =>
            createTerminal(modal.project, name, command, cwd)
          }
        />
      )}
    </div>
  );
}
