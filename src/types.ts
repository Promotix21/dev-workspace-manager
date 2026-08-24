export interface EnvVar {
  key: string;
  value: string;
}

export type InteractionProfile = "shell" | "claude" | "gemini" | "codex" | "custom";

export interface TerminalDef {
  id: string;
  name: string;
  command: string;
  run_automatically: boolean;
  cwd?: string | null;
  env: EnvVar[];
  interaction_profile?: InteractionProfile | null;
}

export type LayoutKey =
  | "one"
  | "two-v"
  | "two-h"
  | "three"
  | "grid-4"
  | "grid-6"
  | "all";

export interface Project {
  id: string;
  name: string;
  directory: string;
  layout: LayoutKey;
  terminals: TerminalDef[];
  start_with_app: boolean;
  layout_sizes?: LayoutSizes | null;
  sort_order: number;
  servers?: string[];
}

export interface ProjectStatus {
  id: string;
  running: boolean;
  window_count: number;
  git_branch?: string | null;
  git_dirty: boolean;
}

export interface Settings {
  default_shell: string;
  font_size: number;
  scrollback: number;
  theme: string;
  confirm_kill: boolean;
  restore_last_project: boolean;
  start_at_login: boolean;
  default_project_dir?: string | null;
  last_project_id?: string | null;
  sidebar_width: number;
  sidebar_collapsed: boolean;
}

/** Per-project persisted layout sizes: maps a split path key -> size percentages. */
export type LayoutSizes = Record<string, number[]>;

export interface WorkspaceStatus {
  running: boolean;
  window_count: number;
  created: boolean;
}

export interface Dependencies {
  tmux: boolean;
  git: boolean;
  code: boolean;
  messages: string[];
}

export interface GitInfo {
  is_repo: boolean;
  branch?: string | null;
  dirty: boolean;
}

export interface ServerProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: "password" | "key" | "none";
  remote_root: string;
  key_path?: string | null;
  notes?: string | null;
}
