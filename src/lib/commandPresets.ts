// Quick-pick commands offered in the "command" dropdown when creating a
// terminal or defining one on a project. Selecting a preset fills the free-text
// command field, so custom commands remain fully supported.
export interface CommandPreset {
  label: string;
  command: string;
}

export const COMMAND_PRESETS: CommandPreset[] = [
  { label: "claude", command: "claude" },
  { label: "claude-a", command: "claude-a" },
  { label: "claude-d", command: "claude-d" },
  { label: "codex", command: "codex" },
  {
    label: "agy (skip permissions)",
    command: "agy --dangerously-skip-permissions",
  },
];
