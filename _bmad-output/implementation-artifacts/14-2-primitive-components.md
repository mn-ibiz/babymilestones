# Story 14.2: Primitive components

Status: ready-for-dev

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

- [ ] Task 1: Implement primitive components in `packages/ui` (AC: #1)
  - [ ] Add React components under `packages/ui/src/` (one file per primitive): `Button`, `Input`, `MoneyInput`, `PhoneInput`, `OTPInput`, `BottomSheet`, `Toast`, `Spinner`, `Skeleton`, `ChipGroup`; export all from `packages/ui/src/index.ts`.
  - [ ] `MoneyInput`: KES display, integer cents internally (no float). `PhoneInput`: KE flag + Kenyan number formatting.
  - [ ] Style via the X7-S01 Tailwind preset tokens (no hard-coded colours).
- [ ] Task 2: Accessibility (AC: #2)
  - [ ] Full keyboard operability, visible focus ring, WCAG AA contrast for every primitive.
- [ ] Task 3: Storybook (AC: #3)
  - [ ] Add a Storybook entry/story per primitive in `packages/ui`.
- [ ] Task 4: Tests (AC: all)
  - [ ] vitest + testing-library: keyboard interaction + focus-visible per primitive; `MoneyInput` cents conversion; `PhoneInput` KE formatting. Test-first.

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
