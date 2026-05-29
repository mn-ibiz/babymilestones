import { describe, expect, it } from "vitest";
import {
  MIN_TOUCH_TARGET_PX,
  TABLET_MIN_WIDTH,
  isLandscape,
  meetsTabletLayout,
  supportsPosLayout,
} from "./layout.js";

describe("POS tablet-first layout (P2-E04-S01 AC3)", () => {
  it("targets a tablet minimum width of 768px", () => {
    expect(TABLET_MIN_WIDTH).toBe(768);
  });

  it("uses a large (>=44px) touch target", () => {
    // WCAG 2.5.5 enhanced target size is 44px; we go a touch larger for gloved
    // / in-store use.
    expect(MIN_TOUCH_TARGET_PX).toBeGreaterThanOrEqual(44);
  });

  describe("meetsTabletLayout", () => {
    it("is satisfied at and above the tablet breakpoint", () => {
      expect(meetsTabletLayout(768)).toBe(true);
      expect(meetsTabletLayout(1024)).toBe(true);
    });

    it("is not satisfied below the tablet breakpoint", () => {
      expect(meetsTabletLayout(767)).toBe(false);
      expect(meetsTabletLayout(390)).toBe(false);
    });
  });

  describe("isLandscape", () => {
    it("is true when width exceeds height", () => {
      expect(isLandscape(1024, 768)).toBe(true);
    });

    it("is false in portrait", () => {
      expect(isLandscape(768, 1024)).toBe(false);
      expect(isLandscape(800, 800)).toBe(false);
    });
  });

  describe("supportsPosLayout (AC3 — landscape AND >= 768px)", () => {
    it("supports a landscape tablet at/above the breakpoint", () => {
      expect(supportsPosLayout(1024, 768)).toBe(true);
      expect(supportsPosLayout(768, 600)).toBe(true);
    });

    it("rejects a portrait tablet even when wide enough", () => {
      expect(supportsPosLayout(768, 1024)).toBe(false);
    });

    it("rejects a viewport below the tablet breakpoint", () => {
      expect(supportsPosLayout(640, 480)).toBe(false);
    });

    it("rejects a square viewport (not landscape)", () => {
      expect(supportsPosLayout(800, 800)).toBe(false);
    });
  });
});
