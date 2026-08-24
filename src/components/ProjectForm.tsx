import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { EnvVar, LayoutKey, Project, TerminalDef, ServerProfile } from "../types";
import { LAYOUTS } from "../lib/layouts";
import { COMMAND_PRESETS } from "../lib/commandPresets";
import * as api from "../api";

interface Props {
  initial?: Project | null;
  defaultDir?: string | null;
  existingIds: string[];
  onCancel: () => void;
  onSave: (project: Project) => void;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

function newTerminal(): TerminalDef {
  return {
    id: `term-${Math.random().toString(36).slice(2, 8)}`,
    name: "Shell",
    command: "",
    run_automatically: true,
    cwd: null,
    env: [],
    interaction_profile: "shell",
  };
}

export function ProjectForm({
  initial,
  defaultDir,
  existingIds,
  onCancel,
  onSave,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [directory, setDirectory] = useState(
    initial?.directory ?? defaultDir ?? "",
  );
  // Default new projects to the single-pane layout: it mounts exactly one xterm
  // (one scrollback buffer + one PTY attachment) instead of four, which is the
  // memory-light default. Users can switch to a grid at any time.
  const [layout, setLayout] = useState<LayoutKey>(initial?.layout ?? "one");
  const [startWithApp, setStartWithApp] = useState(
    initial?.start_with_app ?? false,
  );
  
  const [_allServers, setAllServers] = useState<ServerProfile[]>([]);
  const [_projectServers, _setProjectServers] = useState<string[]>(initial?.servers ?? []);
  
  useEffect(() => {
    api.getServers().then(setAllServers).catch(console.error);
  }, []);

  const [terminals, setTerminals] = useState<TerminalDef[]>(
    initial?.terminals?.length
      ? initial.terminals
      : [
          { ...newTerminal(), name: "Claude", command: "claude", interaction_profile: "claude" },
          { ...newTerminal(), name: "Dev Server", command: "npm run dev", interaction_profile: "shell" },
          { ...newTerminal(), name: "Shell", command: "", interaction_profile: "shell" },
        ],
  );

  const pickDir = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: directory || defaultDir || undefined,
    });
    if (typeof selected === "string") setDirectory(selected);
  };

  const updateTerminal = (i: number, patch: Partial<TerminalDef>) =>
    setTerminals((ts) => ts.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

  const addTerminal = () => setTerminals((ts) => [...ts, newTerminal()]);
  const removeTerminal = (i: number) =>
    setTerminals((ts) => ts.filter((_, idx) => idx !== i));

  const addEnv = (i: number) =>
    updateTerminal(i, { env: [...terminals[i].env, { key: "", value: "" }] });
  const updateEnv = (i: number, j: number, patch: Partial<EnvVar>) =>
    updateTerminal(i, {
      env: terminals[i].env.map((e, idx) => (idx === j ? { ...e, ...patch } : e)),
    });
  const removeEnv = (i: number, j: number) =>
    updateTerminal(i, { env: terminals[i].env.filter((_, idx) => idx !== j) });

  const save = () => {
    if (!name.trim()) return alert("Project name is required.");
    if (!directory.trim()) return alert("Project directory is required.");
    if (terminals.length === 0)
      return alert("Add at least one terminal.");

    let id = initial?.id;
    if (!id) {
      const base = slugify(name);
      id = base;
      let n = 2;
      while (existingIds.includes(id)) id = `${base}-${n++}`;
    }
    const project: Project = {
      id,
      name: name.trim(),
      directory: directory.trim(),
      layout,
      terminals: terminals.map((t) => ({
        ...t,
        name: t.name.trim() || "Terminal",
        cwd: t.cwd?.trim() ? t.cwd.trim() : null,
        env: t.env.filter((e) => e.key.trim()),
      })),
      start_with_app: startWithApp,
      layout_sizes: initial?.layout_sizes,
      sort_order: initial?.sort_order ?? Date.now(),
    };
    onSave(project);
  };

  const capacity = LAYOUTS[layout].capacity;

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{initial ? "Edit Project" : "Add Project"}</h2>
          <button className="icon-btn" onClick={onCancel}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label>Project Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Celebrate Festival"
            />
          </div>

          <div className="field">
            <label>Project Directory</label>
            <div className="row">
              <input
                value={directory}
                onChange={(e) => setDirectory(e.target.value)}
                placeholder="/home/user/projects/celebrate-festival"
              />
              <button className="btn" onClick={pickDir}>
                Browse…
              </button>
            </div>
          </div>

          <div className="row">
            <div className="field grow">
              <label>Workspace Layout</label>
              <select
                value={layout}
                onChange={(e) => setLayout(e.target.value as LayoutKey)}
              >
                {Object.values(LAYOUTS).map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label} (up to {l.capacity})
                  </option>
                ))}
              </select>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={startWithApp}
                onChange={(e) => setStartWithApp(e.target.checked)}
              />
              Start automatically with app
            </label>
          </div>

          <div className="terminals-head">
            <label>Terminals ({terminals.length})</label>
            {terminals.length > capacity && (
              <span className="warn">
                Layout shows {capacity}; extra terminals stay in tmux but aren't
                tiled.
              </span>
            )}
          </div>

          <div className="terminal-defs">
            {terminals.map((t, i) => (
              <div className="terminal-def" key={t.id}>
                <div className="row">
                  <div className="field grow">
                    <label>Name</label>
                    <input
                      value={t.name}
                      onChange={(e) =>
                        updateTerminal(i, { name: e.target.value })
                      }
                    />
                  </div>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={t.run_automatically}
                      onChange={(e) =>
                        updateTerminal(i, {
                          run_automatically: e.target.checked,
                        })
                      }
                    />
                    Run automatically
                  </label>
                  <button
                    className="icon-btn"
                    title="Remove terminal"
                    onClick={() => removeTerminal(i)}
                  >
                    🗑
                  </button>
                </div>
                <div className="field">
                  <label>Startup command</label>
                  <div className="row">
                    <input
                      value={t.command}
                      onChange={(e) =>
                        updateTerminal(i, { command: e.target.value })
                      }
                      placeholder="npm run dev   (empty = plain shell)"
                    />
                    <select
                      className="preset-select"
                      value=""
                      title="Insert a preset command"
                      onChange={(e) => {
                        if (e.target.value)
                          updateTerminal(i, { command: e.target.value });
                      }}
                    >
                      <option value="">Preset…</option>
                      {COMMAND_PRESETS.map((p) => (
                        <option key={p.command} value={p.command}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Working directory override (optional)</label>
                  <input
                    value={t.cwd ?? ""}
                    onChange={(e) =>
                      updateTerminal(i, { cwd: e.target.value })
                    }
                    placeholder="defaults to project directory"
                  />
                </div>
                <div className="env-block">
                  <div className="env-head">
                    <span>Environment variables</span>
                    <button className="mini-btn" onClick={() => addEnv(i)}>
                      + var
                    </button>
                  </div>
                  {t.env.map((e, j) => (
                    <div className="row" key={j}>
                      <input
                        className="env-key"
                        placeholder="KEY"
                        value={e.key}
                        onChange={(ev) =>
                          updateEnv(i, j, { key: ev.target.value })
                        }
                      />
                      <input
                        className="env-val"
                        placeholder="value"
                        value={e.value}
                        onChange={(ev) =>
                          updateEnv(i, j, { value: ev.target.value })
                        }
                      />
                      <button
                        className="icon-btn"
                        onClick={() => removeEnv(i, j)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button className="btn block" onClick={addTerminal}>
            + Add Terminal
          </button>
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            {initial ? "Save Changes" : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}
