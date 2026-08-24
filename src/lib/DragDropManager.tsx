import { useEffect } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import * as api from "../api";

// encodeInput from Terminal.tsx
function encodeInput(data: string): string {
  const bytes = new TextEncoder().encode(data);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function DragDropManager() {
  useEffect(() => {
    let currentPane: HTMLElement | null = null;
    let originalOutline: string = "";

    const highlight = (el: HTMLElement | null) => {
      if (currentPane === el) return;
      if (currentPane) {
        currentPane.style.outline = originalOutline;
        currentPane.style.outlineOffset = "";
        currentPane.classList.remove("drag-hover");
      }
      currentPane = el;
      if (currentPane) {
        originalOutline = currentPane.style.outline;
        currentPane.style.outline = "2px solid var(--brightBlue, #79c0ff)";
        currentPane.style.outlineOffset = "-2px";
        currentPane.classList.add("drag-hover");
      }
    };

    const unlisten = getCurrentWebviewWindow().onDragDropEvent((ev) => {
      if (ev.payload.type === 'over' || ev.payload.type === 'enter') {
        const { x, y } = ev.payload.position;
        // Adjust for device pixel ratio since physical position is in physical pixels?
        // Wait, PhysicalPosition is physical pixels. We need LogicalPosition.
        // Let's get the scale factor.
        getCurrentWebviewWindow().scaleFactor().then(scale => {
           const logX = x / scale;
           const logY = y / scale;
           const el = document.elementFromPoint(logX, logY);
           const pane = el?.closest('.terminal-host') as HTMLElement | null;
           highlight(pane);
        });
      } else if (ev.payload.type === 'drop') {
        highlight(null);
        const { x, y } = ev.payload.position;
        getCurrentWebviewWindow().scaleFactor().then(scale => {
           const logX = x / scale;
           const logY = y / scale;
           const el = document.elementFromPoint(logX, logY);
           const pane = el?.closest('.terminal-host') as HTMLElement | null;
           if (pane) {
             const paneId = pane.getAttribute("data-pane-id");
             if (paneId && 'paths' in ev.payload) {
               const paths = ev.payload.paths.map((p: string) => p.includes(" ") ? `"${p}"` : p).join(" ") + " ";
               api.writeTerminal(paneId, encodeInput(paths)).catch(console.error);
             }
           }
        });
      } else if (ev.payload.type === 'leave') {
        highlight(null);
      }
    });

    return () => {
      unlisten.then(f => f());
      highlight(null);
    };
  }, []);

  return null;
}
