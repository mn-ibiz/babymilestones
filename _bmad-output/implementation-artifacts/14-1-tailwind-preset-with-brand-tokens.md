# Story 14.1: Tailwind preset with brand tokens

Status: review

> Canonical ID: X7-S01 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/X7-S01.md

## Story

As a developer,
I want one preset that every app extends so colours and spacing don't drift,
so that a single token change re-skins the entire suite consistently.

## Acceptance Criteria

1. `packages/config/tailwind.preset.cjs` exports tokens: primary palette, neutrals, semantic (success/warn/danger), spacing scale, radii, type scale.
2. All apps' `tailwind.config.cjs` extends the preset.
3. Token swap re-skins the whole suite.

## Tasks / Subtasks

- [x] Task 1: Author the Tailwind preset + brand tokens (AC: #1, #3)
  - [x] Canonical tokens defined once in `packages/config/tokens.cjs`; `packages/config/tailwind.preset.cjs` exports the preset with primary palette (50–900), neutrals (50–900), semantic colours (success/warn/danger), spacing scale, radii (`borderRadius`), and type scale (`fontSize`). Back-compat aliases `brand`/`ink`/`surface` retained for `@bm/ui`.
  - [x] `makePreset(tokens)` factory means a single token swap cascades to all consumers; `@bm/config` TS entrypoint re-exports `tokens`/`tailwindPreset` from the `.cjs` source (one source of truth, no drift).
- [x] Task 2: Wire every app to extend the preset (AC: #2)
  - [x] `apps/platform`, `apps/pos`, `apps/admin` each have `tailwind.config.cjs` with `presets: [require('@bm/config/tailwind.preset.cjs')]` + content globs covering app + `packages/ui/src`; matching `postcss.config.cjs`; `tailwindcss`/`postcss`/`autoprefixer` added as devDeps.
- [x] Task 3: Tests (AC: all)
  - [x] vitest `packages/config/src/preset.test.ts`: asserts every token group is exported; asserts the preset resolves through `tailwindcss/resolveConfig` (apps inherit tokens); asserts a single token swap changes the resolved `primary.500`, proving re-skin. Written test-first (RED before implementation).

## Dev Notes

- `packages/config` already stubs `tokens` and `tailwindPreset` (see `packages/config/src/index.ts`) — build on those rather than starting fresh.
- Import name `@bm/config`. The preset is the single source of truth for colour/spacing tokens; apps extend, never redefine.
- TS strict, vitest test-first. (Preset file itself is `.cjs` per spec.)

### Project Structure Notes
- New/extended `packages/config/tailwind.preset.cjs` + tokens in `packages/config/src`. App-level `tailwind.config.cjs` in `apps/platform`, `apps/pos`, `apps/admin`.
- Dependencies: none. Foundational for X7-S02/S03 (primitives/compounds) and brand assets (X7-S04). First story in the landing order.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/X7-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § X7]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Claude Code, bmad-dev-story workflow)

### Debug Log References

- Initial `pnpm --filter @bm/config test` → RED (missing `tailwindcss` + preset).
- Post-implementation full gate green: `pnpm test` (14/14), `typecheck` (14/14), `lint` (14/14), `build` (5/5).
- Two follow-up fixes: tightened `tailwind.preset.d.cts` types for the test; eslint now ignores `**/next-env.d.ts` and `**/*.cjs`.

### Completion Notes List

- ✅ AC1: preset exports primary/neutral palettes, semantic colours, spacing, radii, type scale — verified by test.
- ✅ AC2: all three Next apps extend the preset via `tailwind.config.cjs`; preset resolves through `resolveConfig`.
- ✅ AC3: `makePreset` token swap re-skins resolved config (`primary.500` changes) — verified by test.
- Tokens are defined once (`tokens.cjs`) and consumed by both the `.cjs` preset and the TS entrypoint, so there is no token drift between Tailwind and TS consumers.

### File List

- `packages/config/tokens.cjs` (new) — canonical brand tokens
- `packages/config/tailwind.preset.cjs` (new) — preset + `makePreset` factory
- `packages/config/tailwind.preset.d.cts` (new) — types for the `.cjs` preset
- `packages/config/src/index.ts` (modified) — re-export tokens/preset from the `.cjs` source
- `packages/config/src/preset.test.ts` (new) — AC tests
- `packages/config/package.json` (modified) — `exports` subpaths + `tailwindcss` devDep
- `apps/{platform,pos,admin}/tailwind.config.cjs` (new)
- `apps/{platform,pos,admin}/postcss.config.cjs` (new)
- `apps/{platform,pos,admin}/package.json` (modified) — tailwindcss/postcss/autoprefixer devDeps
- `eslint.config.js` (modified) — ignore `next-env.d.ts` and `*.cjs`

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-24 | 1.0 | Implemented test-first; all ACs satisfied; full gate green; status → review | bmad-dev-story |
