import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  readText as clipboardRead,
  writeText as clipboardWrite,
} from "@tauri-apps/plugin-clipboard-manager";
import "@xterm/xterm/css/xterm.css";
import * as api from "../api";

export interface TerminalHandle {
  clear: () => void;
  focus: () => void;
  fit: () => void;
  findNext: (q: string) => void;
  findPrevious: (q: string) => void;
  clearSearch: () => void;
}

interface TerminalProps {
  projectId: string;
  paneIndex: number;
  fontSize: number;
  scrollback: number;
  onExit?: () => void;
  onReady?: (paneId: string) => void;
  onFocus?: () => void;
}

const THEME = {
  background: "#0d1117",
  foreground: "#c9d1d9",
  cursor: "#58a6ff",
  selectionBackground: "#264f78",
  black: "#484f58",
  red: "#ff7b72",
  green: "#3fb950",
  yellow: "#d29922",
  blue: "#58a6ff",
  magenta: "#bc8cff",
  cyan: "#39c5cf",
  white: "#b1bac4",
  brightBlack: "#6e7681",
  brightRed: "#ffa198",
  brightGreen: "#56d364",
  brightYellow: "#e3b341",
  brightBlue: "#79c0ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#56d4dd",
  brightWhite: "#f0f6fc",
};

// --- base64 <-> bytes helpers (UTF-8 safe) ---
function bytesToWrite(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
function encodeInput(data: string): string {
  const bytes = new TextEncoder().encode(data);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export const Terminal = forwardRef<TerminalHandle, TerminalProps>(
  (
    { projectId, paneIndex, fontSize, scrollback, onExit, onReady, onFocus },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<XTerm | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const searchRef = useRef<SearchAddon | null>(null);
    const paneIdRef = useRef<string | null>(null);
    const onFocusRef = useRef(onFocus);
    onFocusRef.current = onFocus;

    useImperativeHandle(ref, () => ({
      clear: () => termRef.current?.clear(),
      focus: () => termRef.current?.focus(),
      fit: () => fitRef.current?.fit(),
      findNext: (q: string) => searchRef.current?.findNext(q),
      findPrevious: (q: string) => searchRef.current?.findPrevious(q),
      clearSearch: () => searchRef.current?.clearDecorations(),
    }));

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const term = new XTerm({
        fontSize,
        fontFamily:
          '"Fira Code", "JetBrains Mono", "Cascadia Code", Menlo, monospace',
        theme: THEME,
        cursorBlink: true,
        scrollback,
        allowProposedApi: true,
        macOptionIsMeta: true,
        // Right-click never opens a native menu; we handle paste ourselves.
        rightClickSelectsWord: false,
      });
      const fit = new FitAddon();
      const search = new SearchAddon();
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon());
      term.loadAddon(search);
      term.open(el);
      termRef.current = term;
      fitRef.current = fit;
      searchRef.current = search;

      // Copy/paste: Ctrl+Shift+C copies selection, Ctrl+Shift+V pastes.
      // Plain Ctrl+C is intentionally NOT intercepted — it must reach the PTY.
      term.attachCustomKeyEventHandler((e) => {
        if (e.type !== "keydown") return true;
        if (e.ctrlKey && e.shiftKey && (e.key === "C" || e.key === "c")) {
          const sel = term.getSelection();
          if (sel) clipboardWrite(sel).catch(() => {});
          return false;
        }
        if (e.ctrlKey && e.shiftKey && (e.key === "V" || e.key === "v")) {
          clipboardRead()
            .then((txt) => {
              if (txt && paneIdRef.current) {
                api.writeTerminal(paneIdRef.current, encodeInput(txt)).catch(
                  () => {},
                );
              }
            })
            .catch(() => {});
          return false;
        }
        // Let Ctrl+Shift+F (fullscreen) and Ctrl+Shift+S (search) bubble to the
        // window handler instead of being sent as bytes to the shell.
        if (
          e.ctrlKey &&
          e.shiftKey &&
          ["F", "f", "S", "s", "T", "t", "W", "w"].includes(e.key)
        ) {
          return false;
        }
        return true;
      });

      // Right-click pastes the clipboard (natural on Linux terminals).
      const onContext = (ev: MouseEvent) => {
        ev.preventDefault();
        clipboardRead()
          .then((txt) => {
            if (txt && paneIdRef.current) {
              api.writeTerminal(paneIdRef.current, encodeInput(txt)).catch(
                () => {},
              );
            }
          })
          .catch(() => {});
      };
      el.addEventListener("contextmenu", onContext);

      // Report focus so the workspace can mark the active pane.
      const onFocusIn = () => onFocusRef.current?.();
      el.addEventListener("focusin", onFocusIn);
      el.addEventListener("mousedown", onFocusIn);

      let unlistenOut: UnlistenFn | null = null;
      let unlistenExit: UnlistenFn | null = null;
      let disposed = false;

      const boot = async () => {
        try {
          fit.fit();
        } catch {
          /* not measured yet */
        }
        const cols = term.cols || 80;
        const rows = term.rows || 24;

        let paneId: string;
        try {
          paneId = await api.connectTerminal(projectId, paneIndex, cols, rows);
        } catch (e) {
          term.writeln(`\x1b[31m[dwm] failed to connect terminal: ${e}\x1b[0m`);
          return;
        }
        if (disposed) {
          api.disconnectTerminal(paneId).catch(() => {});
          return;
        }
        paneIdRef.current = paneId;
        onReady?.(paneId);

        unlistenOut = await listen<string>(`pty://output/${paneId}`, (ev) => {
          term.write(bytesToWrite(ev.payload));
        });
        unlistenExit = await listen(`pty://exit/${paneId}`, () => {
          term.writeln("\r\n\x1b[90m[dwm] session detached]\x1b[0m");
          onExit?.();
        });

        term.onData((data) => {
          if (paneIdRef.current) {
            api
              .writeTerminal(paneIdRef.current, encodeInput(data))
              .catch(() => {});
          }
        });

        api.resizeTerminal(paneId, cols, rows).catch(() => {});
      };

      boot();

      const ro = new ResizeObserver(() => {
        if (!termRef.current || !fitRef.current) return;
        try {
          fitRef.current.fit();
        } catch {
          return;
        }
        const pid = paneIdRef.current;
        if (pid) api.resizeTerminal(pid, term.cols, term.rows).catch(() => {});
      });
      ro.observe(el);

      return () => {
        disposed = true;
        ro.disconnect();
        el.removeEventListener("contextmenu", onContext);
        el.removeEventListener("focusin", onFocusIn);
        el.removeEventListener("mousedown", onFocusIn);
        unlistenOut?.();
        unlistenExit?.();
        if (paneIdRef.current) {
          api.disconnectTerminal(paneIdRef.current).catch(() => {});
        }
        term.dispose();
        termRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, paneIndex]);

    useEffect(() => {
      if (termRef.current) {
        termRef.current.options.fontSize = fontSize;
        try {
          fitRef.current?.fit();
        } catch {
          /* noop */
        }
      }
    }, [fontSize]);

    return <div className="terminal-host" ref={containerRef} />;
  },
);

Terminal.displayName = "Terminal";
