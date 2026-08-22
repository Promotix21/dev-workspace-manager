import { useState } from "react";
import type { Settings } from "../types";

interface Props {
  settings: Settings;
  onCancel: () => void;
  onSave: (s: Settings) => void;
}

export function SettingsModal({ settings, onCancel, onSave }: Props) {
  const [s, setS] = useState<Settings>(settings);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setS((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal modal-sm" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Default shell</label>
            <input
              value={s.default_shell}
              onChange={(e) => set("default_shell", e.target.value)}
            />
          </div>
          <div className="row">
            <div className="field grow">
              <label>Terminal font size</label>
              <input
                type="number"
                min={8}
                max={32}
                value={s.font_size}
                onChange={(e) => set("font_size", Number(e.target.value))}
              />
            </div>
            <div className="field grow">
              <label>Scrollback lines</label>
              <input
                type="number"
                min={1000}
                max={200000}
                step={1000}
                value={s.scrollback}
                onChange={(e) => set("scrollback", Number(e.target.value))}
              />
            </div>
          </div>
          <div className="field">
            <label>Default project directory</label>
            <input
              value={s.default_project_dir ?? ""}
              onChange={(e) => set("default_project_dir", e.target.value)}
              placeholder="/home/user/projects"
            />
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={s.confirm_kill}
              onChange={(e) => set("confirm_kill", e.target.checked)}
            />
            Confirm before killing a workspace
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={s.restore_last_project}
              onChange={(e) => set("restore_last_project", e.target.checked)}
            />
            Restore last project on startup
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={s.start_at_login}
              onChange={(e) => set("start_at_login", e.target.checked)}
            />
            Start application at login (writes autostart entry)
          </label>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => onSave(s)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
