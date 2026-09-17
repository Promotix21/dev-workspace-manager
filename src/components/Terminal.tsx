import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
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

import type { InteractionProfile } from "../types";

export interface TerminalHandle {
  clear: () => void;
  focus: () => void;
  fit: () => void;
  findNext: (q: string) => void;
  findPrevious: (q: string) => void;
  clearSearch: () => void;
  copySelection: () => void;
  pasteClipboard: () => void;
  selectAll: () => void;
}

interface TerminalProps {
  projectId: string;
  paneIndex: number;
  fontSize: number;
  scrollback: number;
  interactionProfile?: InteractionProfile | null;
  onExit?: () => void;
  onReady?: (paneId: string) => void;
  onFocus?: () => void;
  onContextMenu?: (e: MouseEvent, hasSelection: boolean) => void;
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
    { projectId, paneIndex, fontSize, scrollback, interactionProfile, onExit, onReady, onFocus, onContextMenu },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<XTerm | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const searchRef = useRef<SearchAddon | null>(null);
    const [paneId, setPaneId] = useState<string | null>(null);
    const paneIdRef = useRef<string | null>(null);
    const onFocusRef = useRef(onFocus);
    onFocusRef.current = onFocus;
    const onContextRef = useRef(onContextMenu);
    onContextRef.current = onContextMenu;

    useImperativeHandle(ref, () => ({
      clear: () => termRef.current?.clear(),
      focus: () => termRef.current?.focus(),
      fit: () => fitRef.current?.fit(),
      findNext: (q: string) => searchRef.current?.findNext(q),
      findPrevious: (q: string) => searchRef.current?.findPrevious(q),
      clearSearch: () => searchRef.current?.clearDecorations(),
      copySelection: () => {
        const sel = termRef.current?.getSelection();
        if (sel) clipboardWrite(sel).catch(() => {});
      },
      pasteClipboard: () => {
        clipboardRead()
          .then((txt) => {
            if (txt && termRef.current) {
              termRef.current.paste(txt);
            }
          })
          .catch(() => {});
      },
      selectAll: () => termRef.current?.selectAll(),
    }));

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      // Track whether the user has scrolled up away from the bottom.
      // When true, incoming output will NOT force-scroll the viewport down.
      const userScrolledUp = { current: false };

      const term = new XTerm({
        fontSize,
        fontFamily:
          '"Fira Code", "JetBrains Mono", "Cascadia Code", Menlo, monospace',
        theme: THEME,
        cursorBlink: true,
        scrollback,
        allowProposedApi: true,
        macOptionIsMeta: true,
        // Prevent xterm from jumping to the bottom when the user types while
        // scrolled up — the PTY output already drives the viewport naturally.
        scrollOnUserInput: false,
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

      // Intercept wheel events and scroll the xterm viewport directly.
      // By default xterm converts scroll wheel into ↑/↓ arrow key sequences
      // sent to the PTY — which in agy, codex, claude, and gemini causes the
      // current prompt to rotate through command history instead of scrolling
      // the viewport. Taking over the wheel event fixes this for all profiles.
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        // deltaY > 0 = scroll down, < 0 = scroll up.
        // Normalise pixel/line/page delta modes into a line count.
        let lines: number;
        if (e.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
          lines = Math.round(e.deltaY / 20);
        } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
          lines = e.deltaY > 0 ? term.rows : -term.rows;
        } else {
          // DOM_DELTA_LINE — most common
          lines = Math.round(e.deltaY) || (e.deltaY > 0 ? 3 : -3);
        }
        if (lines === 0) return;
        term.scrollLines(lines);
        // Keep userScrolledUp in sync after a manual wheel scroll.
        const buf = term.buffer.active;
        userScrolledUp.current = buf.viewportY < buf.baseY - 2;
      };
      el.addEventListener("wheel", onWheel, { passive: false });

      // Detect scroll position changes from other sources (keyboard, scrollbar).
      // viewportY == 0 means top of buffer; viewportY == baseY means at the bottom.
      // We consider the user "at the bottom" if they're within 2 lines of baseY.
      term.onScroll(() => {
        const buf = term.buffer.active;
        userScrolledUp.current = buf.viewportY < buf.baseY - 2;
      });

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
              if (txt && termRef.current) {
                termRef.current.paste(txt);
              }
            })
            .catch(() => {});
          e.preventDefault();
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

      const onContext = (ev: MouseEvent) => {
        ev.preventDefault();
        const hasSel = term.hasSelection();
        const sel = term.getSelection();

        if (interactionProfile === "claude") {
          if (hasSel && sel) {
             clipboardWrite(sel).catch(() => {});
             return;
          }
          // if no selection, fallback to context menu
          onContextRef.current?.(ev, hasSel);
        } else {
          // gemini, shell, codex, custom
          onContextRef.current?.(ev, hasSel);
        }
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
        setPaneId(paneId);
        onReady?.(paneId);

        unlistenOut = await listen<string>(`pty://output/${paneId}`, (ev) => {
          if (userScrolledUp.current) {
            // User is reading history — preserve their scroll position.
            const savedViewportY = term.buffer.active.viewportY;
            term.write(bytesToWrite(ev.payload), () => {
              term.scrollToLine(savedViewportY);
            });
          } else {
            // User is at (or near) the bottom — follow output normally.
            term.write(bytesToWrite(ev.payload));
          }
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
        el.removeEventListener("wheel", onWheel);
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

    return <div className="terminal-host" data-pane-id={paneId || ""} ref={containerRef} />;
  },
);

Terminal.displayName = "Terminal";
