# Story 14.1: Tailwind preset with brand tokens

Status: ready-for-dev

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

- [ ] Task 1: Author the Tailwind preset + brand tokens (AC: #1, #3)
  - [ ] Build on the existing `tokens`/`tailwindPreset` stubs in `packages/config/src` and expose `packages/config/tailwind.preset.cjs` exporting: primary palette, neutrals, semantic colours (success/warn/danger), spacing scale, radii, type scale.
  - [ ] Define tokens once so swapping a token value cascades to all consumers.
- [ ] Task 2: Wire every app to extend the preset (AC: #2)
  - [ ] Each Next app — `apps/platform`, `apps/pos`, `apps/admin` — has `tailwind.config.cjs` that `presets: [require('@bm/config/tailwind.preset.cjs')]` (and any UI package content paths).
- [ ] Task 3: Tests (AC: all)
  - [ ] vitest in `packages/config`: assert preset exports each token group; assert a token swap changes resolved values (e.g. resolveConfig output) proving re-skin behaviour. Test-first.

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
