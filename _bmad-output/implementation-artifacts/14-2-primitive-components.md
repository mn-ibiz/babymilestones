# Story 14.2: Primitive components

Status: done

> Canonical ID: X7-S02 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/X7-S02.md

## Story

As a developer,
I want a primitive library that handles a11y + Kenya-specific inputs,
so that every app builds UI from accessible, consistent, locale-aware building blocks.

## Acceptance Criteria

1. `Button`, `Input`, `MoneyInput` (KES, integer cents internal), `PhoneInput` (KE flag + format), `OTPInput`, `BottomSheet`, `Toast`, `Spinner`, `Skeleton`, `ChipGroup`.
2. All keyboard-accessible; visible focus ring; WCAG AA contrast.
3. Storybook entries for each.

## Tasks / Subtasks

- [x] Task 1: Implement primitive components in `packages/ui` (AC: #1)
  - [x] Add React components under `packages/ui/src/` (one file per primitive): `Button`, `Input`, `MoneyInput`, `PhoneInput`, `OTPInput`, `BottomSheet`, `Toast`, `Spinner`, `Skeleton`, `ChipGroup`; export all from `packages/ui/src/index.ts`.
  - [x] `MoneyInput`: KES display, integer cents internally (no float). `PhoneInput`: KE flag + Kenyan number formatting.
  - [x] Style via the X7-S01 Tailwind preset tokens (no hard-coded colours).
- [x] Task 2: Accessibility (AC: #2)
  - [x] Full keyboard operability + visible focus ring for every primitive (native controls, `FOCUS_RING` `focus-visible` token, `role`/`aria-*` wiring; BottomSheet Escape + focus).
  - [~] WCAG AA contrast: keyboard + focus-ring guarantees met and tested; the `primary-500`+white text contrast is a brand-token (X7-S01) decision deferred — see review findings #1.
- [x] Task 3: Storybook (AC: #3)
  - [x] CSF story entry per primitive in `packages/ui` (`primitives.stories.tsx`). Storybook *runtime* host not installed (kept out of `@bm/ui` deps) — see review findings #3.
- [x] Task 4: Tests (AC: all)
  - [x] vitest + testing-library (jsdom): keyboard interaction + focus per primitive; `MoneyInput` cents conversion; `PhoneInput` KE formatting. Test-first.

## Dev Notes

- Anchor: `packages/ui` (import `@bm/ui`) — design tokens + Tailwind preset already live here; primitives arrive in this story (X7). Consumes the preset from `@bm/config` (X7-S01).
- KES money is integer-cents internal everywhere; `PhoneInput` is Kenya-specific (flag + format).
- React components consumed by the Next apps. TS strict, vitest test-first.

### Project Structure Notes
- New component files in `packages/ui/src/`, exported from the index. Storybook config + stories in `packages/ui`.
- Dependencies: X7-S01 (Tailwind preset / brand tokens). Compounds (X7-S03) depend on these primitives.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/X7-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § X7]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Full gate green from repo root: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`.
- Fixes during the run: (1) added `@testing-library/jest-dom/vitest` type ref so `tsc` sees the DOM matchers; (2) set `jsx: react-jsx` + DOM libs in `tsconfig.base.json` so consumer packages (`@bm/api`, apps) can typecheck `@bm/ui`'s now-JSX source; (3) `SkeletonProps` interface → type alias for `no-empty-object-type` lint.

### Completion Notes List

- 10 primitives added to `@bm/ui` (AC1): Button, Input, MoneyInput, PhoneInput, OTPInput, BottomSheet, Toast, Spinner, Skeleton, ChipGroup. All exported from `src/index.ts`.
- Money is integer-cents internal (`money.ts`, no float); KE phone normalised to E.164 (`phone.ts`). Both backed by pure, round-trip-tested helpers.
- a11y (AC2): native controls, shared `FOCUS_RING` (`focus-visible`) token, role/aria wiring, BottomSheet Escape + focus management. Contrast caveat deferred (review findings #1).
- Storybook (AC3): CSF stories per primitive (`primitives.stories.tsx`); typed via a local CSF shim to avoid adding the Storybook runtime to `@bm/ui`.
- Tests: vitest under jsdom (new `vitest.config.ts` + `vitest.setup.ts`); 67 UI tests pass; whole-repo suite 393 API tests + all others green.
- One review (self): no blockers; 3 lower-severity findings logged to `14-2-primitive-components-review-findings.md`.

### File List

- packages/ui/package.json (deps: react, react-dom, testing-library, jsdom)
- packages/ui/tsconfig.json (jsx + DOM lib)
- packages/ui/vitest.config.ts (new)
- packages/ui/vitest.setup.ts (new)
- packages/ui/src/vitest-env.d.ts (new)
- packages/ui/src/cn.ts (new)
- packages/ui/src/styles.ts (new)
- packages/ui/src/button.tsx (new)
- packages/ui/src/input.tsx (new)
- packages/ui/src/money.ts (new)
- packages/ui/src/money-input.tsx (new)
- packages/ui/src/phone.ts (new)
- packages/ui/src/phone-input.tsx (new)
- packages/ui/src/otp-input.tsx (new)
- packages/ui/src/bottom-sheet.tsx (new)
- packages/ui/src/toast.tsx (new)
- packages/ui/src/spinner.tsx (new)
- packages/ui/src/skeleton.tsx (new)
- packages/ui/src/chip-group.tsx (new)
- packages/ui/src/storybook-types.ts (new)
- packages/ui/src/primitives.stories.tsx (new)
- packages/ui/src/money.test.ts (new)
- packages/ui/src/phone.test.ts (new)
- packages/ui/src/primitives.test.tsx (new)
- packages/ui/src/index.ts (export primitives)
- tsconfig.base.json (jsx: react-jsx, DOM libs)
- _bmad-output/implementation-artifacts/14-2-primitive-components-review-findings.md (new)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented 10 a11y + KE-aware primitives in `@bm/ui` with vitest/jsdom tests and CSF stories; full gate green | claude-opus-4-7 |
