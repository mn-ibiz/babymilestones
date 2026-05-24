import { describe, expect, it } from "vitest";
import resolveConfig from "tailwindcss/resolveConfig";
// The preset is the single source of truth (AC1); it is a .cjs file per spec.
import preset, { makePreset, tokens } from "../tailwind.preset.cjs";

describe("tailwind preset (X7-S01)", () => {
  it("exports every required token group (AC1)", () => {
    const c = preset.theme.extend.colors;
    expect(c.primary["500"]).toMatch(/^#/u); // primary palette
    expect(c.neutral["500"]).toMatch(/^#/u); // neutrals
    expect(c.success).toMatch(/^#/u); // semantic
    expect(c.warn).toMatch(/^#/u);
    expect(c.danger).toMatch(/^#/u);
    expect(Object.keys(preset.theme.extend.spacing).length).toBeGreaterThan(0); // spacing scale
    expect(Object.keys(preset.theme.extend.borderRadius).length).toBeGreaterThan(0); // radii
    expect(Object.keys(preset.theme.extend.fontSize).length).toBeGreaterThan(0); // type scale
  });

  const readPrimary500 = (cfg: ReturnType<typeof resolveConfig>): string => {
    const colors = cfg.theme.colors as unknown as Record<string, Record<string, string>>;
    return colors.primary!["500"]!;
  };

  it("resolves through tailwind so apps that extend it pick up tokens (AC2)", () => {
    const resolved = resolveConfig({ content: [], presets: [preset] });
    expect(readPrimary500(resolved)).toBe(tokens.color.primary["500"]);
  });

  it("a single token swap re-skins the resolved config (AC3)", () => {
    const swapped = makePreset({
      ...tokens,
      color: { ...tokens.color, primary: { ...tokens.color.primary, "500": "#000000" } },
    });
    const before = resolveConfig({ content: [], presets: [preset] });
    const after = resolveConfig({ content: [], presets: [swapped] });
    expect(readPrimary500(before)).not.toBe(readPrimary500(after));
    expect(readPrimary500(after)).toBe("#000000");
  });
});
