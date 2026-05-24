# Story 14.4: Brand assets pipeline

Status: ready-for-dev

> Canonical ID: X7-S04 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/X7-S04.md

## Story

As a designer,
I want one place to drop logo + colours so every surface reflects the brand,
so that receipts, SMS bodies, and UI all draw from a single brand source.

## Acceptance Criteria

1. `packages/ui/brand/` holds logo SVGs and colour overrides.
2. Receipt PDFs (P1-E08) and SMS-stub bodies (P1-E09) consume the same brand strings.

## Tasks / Subtasks

- [ ] Task 1: Create the brand asset directory (AC: #1)
  - [ ] Add `packages/ui/brand/` holding logo SVG(s) and a colour-override module; export brand strings/assets from `@bm/ui` (e.g. `packages/ui/src/brand/index.ts`).
  - [ ] Colour overrides feed the X7-S01 token layer so brand changes propagate.
- [ ] Task 2: Wire downstream consumers to shared brand strings (AC: #2)
  - [ ] Receipt PDF generation (P1-E08) reads brand name/logo/colours from `@bm/ui` brand exports.
  - [ ] SMS-stub bodies (P1-E09, via `packages/sms`) read the same brand strings — no duplicated literals.
- [ ] Task 3: Tests (AC: all)
  - [ ] vitest: brand exports resolve (logo path, colour overrides, brand strings); a brand-string change is reflected by both receipt and SMS-stub consumers (shared-source assertion). Test-first.

## Dev Notes

- Anchor: `packages/ui` (import `@bm/ui`) — new `brand/` subdir. Colour overrides integrate with the X7-S01 preset tokens.
- Single brand source consumed by Receipt PDFs (Epic P1-E08) and SMS stub (`packages/sms`, Epic P1-E09) — verify shared consumption rather than re-implementing those features here.
- TS strict, vitest test-first.

### Project Structure Notes
- New `packages/ui/brand/` (assets) + brand export module in `packages/ui/src/`. Consumed by receipt-PDF code (E08) and `packages/sms` stub bodies (E09).
- Dependencies: X7-S01 (tokens/preset). Note: full receipt/SMS features are separate epics (E08/E09); this story provides and verifies the shared brand source they consume.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/X7-S04.md]
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
