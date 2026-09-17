import { describe, it, expect } from "vitest";
import {
  decideWheelRoute,
  type MouseTrackingMode,
} from "./wheelRoute";

const MOUSE_MODES: MouseTrackingMode[] = ["x10", "vt200", "drag", "any"];

describe("decideWheelRoute", () => {
  it("scrolls native scrollback on the normal buffer, regardless of mouse mode", () => {
    expect(decideWheelRoute("normal", "none")).toBe("native-scrollback");
    for (const mode of MOUSE_MODES) {
      // A program can enable mouse tracking on the normal buffer; scrollback
      // still exists there, so the wheel must keep scrolling it.
      expect(decideWheelRoute("normal", mode)).toBe("native-scrollback");
    }
  });

  it("forwards the wheel to the app on the alternate buffer when mouse tracking is on", () => {
    for (const mode of MOUSE_MODES) {
      expect(decideWheelRoute("alternate", mode)).toBe("app-mouse");
    }
  });

  it("suppresses the arrow-key fallback on the alternate buffer without mouse tracking", () => {
    // e.g. Antigravity: alt-screen, no mouse — wheel must not become ↑/↓.
    expect(decideWheelRoute("alternate", "none")).toBe(
      "suppress-alt-arrow-fallback",
    );
  });

  it("never returns app-mouse or suppress on the normal buffer", () => {
    const allModes: MouseTrackingMode[] = ["none", ...MOUSE_MODES];
    for (const mode of allModes) {
      expect(decideWheelRoute("normal", mode)).toBe("native-scrollback");
    }
  });
});
