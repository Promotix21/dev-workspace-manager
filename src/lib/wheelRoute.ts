// Wheel-event routing for the terminal, decided purely from xterm state.
//
// There is deliberately NO application-specific logic here (no "if codex",
// "if claude", "if agy"). The only inputs are the active buffer type and the
// application's mouse-tracking mode, both read from xterm's public API. Any
// TUI (vim, less, htop, nano, Gemini, Codex, Antigravity, …) is handled by
// virtue of the buffer/mouse state it puts the terminal into.

/** xterm's `IBuffer.type`. */
export type BufferType = "normal" | "alternate";

/** xterm's `IModes.mouseTrackingMode`. */
export type MouseTrackingMode = "none" | "x10" | "vt200" | "drag" | "any";

/**
 * How a wheel event should be handled:
 *  - `native-scrollback`: let xterm scroll its own scrollback viewport
 *    (normal buffer — shells, and any tool that prints to the main screen).
 *  - `app-mouse`: let xterm encode/forward the wheel to the application as a
 *    mouse event (alternate buffer with mouse tracking enabled).
 *  - `suppress-alt-arrow-fallback`: cancel xterm's default, which would
 *    otherwise translate the wheel into ↑/↓ cursor keys. On the alternate
 *    buffer with no scrollback and no mouse tracking there is nothing the
 *    terminal can scroll, and the cursor keys would drive the app's own
 *    navigation instead. We do NOT fake scrollback that does not exist.
 */
export type WheelRoute =
  | "native-scrollback"
  | "app-mouse"
  | "suppress-alt-arrow-fallback";

export function decideWheelRoute(
  bufferType: BufferType,
  mouseTrackingMode: MouseTrackingMode,
): WheelRoute {
  if (bufferType !== "alternate") {
    // Normal buffer: return control to xterm so native scrollback works.
    return "native-scrollback";
  }
  if (mouseTrackingMode !== "none") {
    // Alternate buffer + app tracks the mouse: let xterm forward the wheel.
    return "app-mouse";
  }
  // Alternate buffer + no mouse tracking: prevent the cursor-key fallback.
  return "suppress-alt-arrow-fallback";
}
