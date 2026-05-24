// The Tailwind preset (tailwind.preset.cjs) is the single source of truth for brand
// tokens (X7-S01). The TS entrypoint re-exports them for typed consumers (@bm/ui, apps).
import preset, { tokens } from "../tailwind.preset.cjs";
import type { Tokens } from "../tailwind.preset.cjs";

export { tokens };
export type { Tokens };
export const tailwindPreset = preset;
