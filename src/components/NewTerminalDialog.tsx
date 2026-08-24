import { useEffect, useRef, useState } from "react";
import { COMMAND_PRESETS } from "../lib/commandPresets";

interface Props {
  projectName: string;
  defaultCwd: string;
  onCancel: () => void;
  onCreate: (name: string, command: string, cwd: string) => void;
}

/** Lightweight dialog for Ctrl+Shift+T — name, optional command, working dir. */
export function NewTerminalDialog({
  projectName,
  defaultCwd,
  onCancel,
  onCreate,
}: Props) {
  const [name, setName] = useState("Shell");
  const [command, setCommand] = useState("");
  const [cwd, setCwd] = useState(defaultCwd);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  const submit = () => {
    if (!name.trim()) return;
    onCreate(name.trim(), command, cwd.trim() || defaultCwd);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className="modal modal-xs"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel();
        }}
      >
        <div className="modal-head">
          <h2>New terminal · {projectName}</h2>
          <button className="icon-btn" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Terminal name</label>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Shell"
            />
          </div>
          <div className="field">
            <label>Command (optional)</label>
            <div className="row">
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="claude   ·   npm run dev   ·   (empty = shell)"
              />
              <select
                className="preset-select"
                value=""
                title="Insert a preset command"
                onChange={(e) => {
                  if (e.target.value) setCommand(e.target.value);
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
            <label>Working directory</label>
            <input value={cwd} onChange={(e) => setCwd(e.target.value)} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit}>
            Create terminal
          </button>
        </div>
      </div>
    </div>
  );
}
