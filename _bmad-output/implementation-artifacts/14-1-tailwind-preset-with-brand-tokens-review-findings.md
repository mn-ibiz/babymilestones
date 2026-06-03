# Review findings — X7-S01 (Tailwind preset with brand tokens)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `7c78d3c7`.
Tokens are single-source-of-truth in `tokens.cjs`, consumed by both the `.cjs` preset and the TS
entrypoint; the real Next build confirms `primary-*` classes flow into compiled CSS. AC1–AC3 met.

## Patched this review
- **[Patch][MED] Phantom dependency.** All three apps `require('@bm/config/tailwind.preset.cjs')` in
  their `tailwind.config.cjs` but none declared `@bm/config` — it resolved only via pnpm hoisting
  (`require.resolve` from each app dir failed `MODULE_NOT_FOUND`). Added `"@bm/config": "workspace:*"`
  to `apps/{platform,pos,admin}` dependencies + `pnpm install`; `@bm/config` now resolves directly.
  config(4) tests green.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][LOW] `brand`/`ink`/`surface` aliases are hardcoded duplicates** of `primary.500`/
  `neutral.900` (not references), so direct token consumers (receipt/packing-slip docs) don't re-skin
  on a palette swap — AC3 holds for Tailwind utilities but not these aliases. Choose: derive aliases
  from the palette, or accept decoupling (X7-S04 brand-override is the real re-skin) + document.

## Deferred / tracked
- **[Defer] `apps/admin` has no `globals.css`** so the preset emits no styles there (downstream
  scaffolding scope; add when admin gets its first styled surface).

## Dismissed
cjs/ESM interop; postcss relative config path; importing outside rootDir typechecks clean.
