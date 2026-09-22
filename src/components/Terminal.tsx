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
import { decideWheelRoute } from "../lib/wheelRoute";

import type { InteractionProfile } from "../types";

// Temporary scroll diagnostics — dev builds only, never noisy in production.
const DEBUG_SCROLL = import.meta.env.DEV;
function logScroll(fields: Record<string, unknown>): void {
  if (DEBUG_SCROLL) {
    // eslint-disable-next-line no-console
    console.debug("[terminal-scroll]", fields);
  }
}

// Paste the clipboard into a pane: text when present, otherwise fall back to an
// image (readText resolves empty or rejects when the clipboard holds a picture,
// which the Rust side saves to a temp PNG and pastes by path). A clipboard with
// neither is a silent no-op.
function pasteClipboardInto(projectId: string, paneIndex: number): void {
  clipboardRead()
    .then((txt) => {
      if (txt) {
        api.pasteToTerminal(projectId, paneIndex, txt).catch(() => {});
      } else {
        api.pasteImageToTerminal(projectId, paneIndex).catch(() => {});
      }
    })
    .catch(() => {
      api.pasteImageToTerminal(projectId, paneIndex).catch(() => {});
    });
}

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
        // Route through tmux paste-buffer so bracketed-paste mode is honoured
        // for inner apps (e.g. Antigravity). tmux intercepts \x1b[?2004h and
        // never passes it to xterm.js, so term.modes.bracketedPasteMode is
        // always false here and term.paste() would send raw \r for every
        // newline. Falls back to an image paste when no text is present.
        pasteClipboardInto(projectId, paneIndex);
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

      // Wheel handling depends on which screen buffer the running program uses:
      //
      //  • NORMAL buffer (shell, Claude, Codex — they print their transcript to
      //    the main screen). Their output lands in xterm's scrollback, so the
      //    wheel should scroll the viewport. That is xterm's default behaviour
      //    for the normal buffer, so we let it through.
      //
      //  • ALTERNATE buffer (full-screen TUIs such as Antigravity). The alt
      //    screen has NO scrollback of its own — content that leaves the top is
      //    gone, and only the application can scroll it back. Two cases:
      //      - the app enabled mouse reporting → let xterm forward the wheel as
      //        mouse events so the app scrolls its own content;
      //      - the app did NOT (e.g. Antigravity) → xterm's fallback is to send
      //        ↑/↓ arrow keys, which those apps interpret as menu navigation,
      //        not scrolling. We suppress that so the wheel stops hijacking
      //        their navigation. (The terminal genuinely cannot scroll an
      //        alt-screen app that doesn't cooperate — use the app's own keys.)
      //
      // attachCustomWheelEventHandler runs before xterm's own wheel logic;
      // returning true lets xterm process the event, false cancels it. The
      // routing decision itself is a pure function of xterm state (see
      // ../lib/wheelRoute) so it stays testable and app-agnostic.
      term.attachCustomWheelEventHandler((e) => {
        const buf = term.buffer.active;
        const mouseTracking = term.modes.mouseTrackingMode;
        const route = decideWheelRoute(buf.type, mouseTracking);
        logScroll({
          event: "wheel",
          buffer: buf.type,
          mouseTracking,
          baseY: buf.baseY,
          viewportY: buf.viewportY,
          userScrolledUp: userScrolledUp.current,
          route,
        });
        switch (route) {
          case "native-scrollback":
          case "app-mouse":
            return true; // hand back to xterm (scrollback viewport / app mouse)
          case "suppress-alt-arrow-fallback":
            // Nothing the terminal can scroll here; don't let the wheel become
            // ↑/↓ cursor keys that would drive the app's own navigation.
            e.preventDefault();
            return false;
        }
      });

      // Reset scrollback-follow state whenever the active buffer switches, so a
      // stale "scrolled up" from the normal buffer can't leak into the alternate
      // buffer (or vice-versa).
      term.buffer.onBufferChange(() => {
        userScrolledUp.current = false;
      });

      // Detect scroll position changes from other sources (keyboard, scrollbar).
      // `userScrolledUp` is a normal-scrollback concept only: on the alternate
      // buffer (which has no scrollback) it must never become true.
      // viewportY == 0 means top of buffer; viewportY == baseY means at the
      // bottom. We consider the user "at the bottom" within 2 lines of baseY.
      term.onScroll(() => {
        const buf = term.buffer.active;
        if (buf.type !== "normal") {
          userScrolledUp.current = false;
          return;
        }
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
          pasteClipboardInto(projectId, paneIndex);
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
          // xterm.js natively preserves the viewport when the user is scrolled
          // up on the normal buffer: new output is appended to scrollback
          // without moving the viewport. No manual scrollToLine is needed —
          // the previous distance-from-bottom formula incremented the target
          // on every incoming line, dragging the viewport downward while the
          // user was reading history.
          logScroll({
            event: "output",
            buffer: term.buffer.active.type,
            baseY: term.buffer.active.baseY,
            viewportY: term.buffer.active.viewportY,
            userScrolledUp: userScrolledUp.current,
          });
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

    return <div className="terminal-host" data-pane-id={paneId || ""} ref={containerRef} />;
  },
);

Terminal.displayName = "Terminal";
