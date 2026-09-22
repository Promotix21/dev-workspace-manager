import { invoke } from "@tauri-apps/api/core";
import type {
  Dependencies,
  GitInfo,
  Project,
  ProjectStatus,
  Settings,
  WorkspaceStatus,
} from "./types";

// --- projects & settings ---
export const listProjects = () => invoke<Project[]>("list_projects");
export const getProject = (id: string) =>
  invoke<Project | null>("get_project", { id });
export const saveProject = (project: Project) =>
  invoke<void>("save_project", { project });
export const deleteProject = (id: string, killSession: boolean) =>
  invoke<void>("delete_project", { id, killSession });
export const projectStatuses = () =>
  invoke<ProjectStatus[]>("project_statuses");
export const getSettings = () => invoke<Settings>("get_settings");
export const saveSettings = (settings: Settings) =>
  invoke<void>("save_settings", { settings });

// --- workspace lifecycle ---
export const checkTmux = () => invoke<boolean>("check_tmux");
export const startWorkspace = (projectId: string) =>
  invoke<WorkspaceStatus>("start_workspace", { projectId });
export const stopWorkspace = (projectId: string) =>
  invoke<void>("stop_workspace", { projectId });
export const restartWorkspace = (projectId: string) =>
  invoke<WorkspaceStatus>("restart_workspace", { projectId });
export const workspaceStatus = (projectId: string) =>
  invoke<WorkspaceStatus>("workspace_status", { projectId });

// --- terminals ---
export const connectTerminal = (
  projectId: string,
  paneIndex: number,
  cols: number,
  rows: number,
) =>
  invoke<string>("connect_terminal", { projectId, paneIndex, cols, rows });
export const writeTerminal = (paneId: string, data: string) =>
  invoke<void>("write_terminal", { paneId, data });
export const resizeTerminal = (paneId: string, cols: number, rows: number) =>
  invoke<void>("resize_terminal", { paneId, cols, rows });
export const disconnectTerminal = (paneId: string) =>
  invoke<void>("disconnect_terminal", { paneId });
export const restartTerminal = (projectId: string, paneIndex: number) =>
  invoke<void>("restart_terminal", { projectId, paneIndex });
export const killTerminal = (projectId: string, paneIndex: number) =>
  invoke<void>("kill_terminal", { projectId, paneIndex });
export const pasteToTerminal = (
  projectId: string,
  paneIndex: number,
  text: string,
) => invoke<void>("paste_to_terminal", { projectId, paneIndex, text });
// Paste an image from the clipboard. Saves it to a temp PNG and pastes the
// path; resolves to that path, rejects when the clipboard holds no image.
export const pasteImageToTerminal = (projectId: string, paneIndex: number) =>
  invoke<string>("paste_image_to_terminal", { projectId, paneIndex });

// --- git & system ---
export const gitInfo = (dir: string) => invoke<GitInfo>("git_info", { dir });
export const checkDependencies = () =>
  invoke<Dependencies>("check_dependencies");
export const openFolder = (dir: string) =>
  invoke<void>("open_folder", { dir });
export const openInVscode = (dir: string) =>
  invoke<void>("open_in_vscode", { dir });
export const openSystemTerminal = (dir: string) =>
  invoke<void>("open_system_terminal", { dir });
export const setAutostart = (enabled: boolean) =>
  invoke<string>("set_autostart", { enabled });

// --- server vault ---
import type { ServerProfile } from "./types";
export const getServers = () => invoke<ServerProfile[]>("get_servers");
export const getServer = (id: string) =>
  invoke<ServerProfile | null>("get_server", { id });
export const upsertServer = (server: ServerProfile, secret: string | null = null) =>
  invoke<void>("upsert_server", { server, secret });
export const deleteServer = (id: string) =>
  invoke<void>("delete_server", { id });
export const testServerConnection = (id: string) =>
  invoke<string>("test_server_connection", { id });
