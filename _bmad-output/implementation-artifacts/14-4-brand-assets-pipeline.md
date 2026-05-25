# Story 14.4: Brand assets pipeline

Status: done

> Canonical ID: X7-S04 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/X7-S04.md

## Story

As a designer,
I want one place to drop logo + colours so every surface reflects the brand,
so that receipts, SMS bodies, and UI all draw from a single brand source.

## Acceptance Criteria

1. `packages/ui/brand/` holds logo SVGs and colour overrides.
2. Receipt PDFs (P1-E08) and SMS-stub bodies (P1-E09) consume the same brand strings.

## Tasks / Subtasks

- [x] Task 1: Create the brand asset directory (AC: #1)
  - [x] Add `packages/ui/brand/` holding logo SVG(s) (`logo.svg`, `logo-mark.svg`) and a colour-override module (`colors.cjs` + `colors.d.cts`); export brand strings/assets from `@bm/ui` via `packages/ui/src/brand/index.ts` (`BRAND`, `brandAssets`, `resolveBrandAsset`).
  - [x] Colour overrides feed the X7-S01 token layer (`brandColors` / `brandTokens` merge over `@bm/config` tokens) so brand changes propagate.
- [x] Task 2: Wire downstream consumers to shared brand strings (AC: #2)
  - [x] Receipt code (P1-E08 `receipt-document.ts` + reception `receipt-preview.ts`) reads brand name/support phone from `@bm/ui` `BRAND` — no inline literal.
  - [x] SMS-stub bodies (P1-E09, `packages/sms/src/templates.ts`) read the same `BRAND.name` via the React-free `@bm/ui/brand` subpath export — no duplicated literals.
- [x] Task 3: Tests (AC: all)
  - [x] vitest (test-first): brand exports resolve (logo/favicon paths, colour overrides, brand strings, unknown-name guard); brand-name change reflected by both receipt (`brand/shared-source.test.ts`) and SMS-stub (`packages/sms/src/brand-source.test.ts`) consumers.

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

claude-opus-4-7

### Debug Log References

- `pnpm test` (root): 15 tasks pass; `@bm/ui` 90 tests, `@bm/sms` 36 tests, `@bm/api` 393 tests.
- `pnpm typecheck && pnpm lint && pnpm build`: all green.

### Completion Notes List

- Brand source lives in `@bm/ui`: assets under `packages/ui/brand/` (logo SVGs + `colors.cjs` override module), typed exports in `packages/ui/src/brand/index.ts`.
- `BRAND` strings (name, tagline, support phone), an asset manifest (`brandAssets` + `resolveBrandAsset(name)` with an unknown-name throw), and colour overrides (`brandColors`) merged over `@bm/config` X7-S01 tokens into `brandTokens`.
- Added a React-free `@bm/ui/brand` subpath export so `@bm/sms` consumes brand strings without pulling the component runtime; `@bm/sms` gains a `@bm/ui` workspace dep.
- Consumers de-duplicated: `receipt-document.ts`, `receipt-preview.ts`, and `sms/templates.ts` now source the brand name (and receipt support phone) from `BRAND` instead of inline literals.
- Shared-source assertions on both the receipt side and the SMS side prove AC2 (single source, not a frozen literal).
- Deferred items (app-chrome literals, dedicated favicon/OG variants, deep colour merge) logged in `14-4-brand-assets-pipeline-review-findings.md`.

### File List

- packages/ui/brand/logo.svg (new)
- packages/ui/brand/logo-mark.svg (new)
- packages/ui/brand/colors.cjs (new)
- packages/ui/brand/colors.d.cts (new)
- packages/ui/src/brand/index.ts (new)
- packages/ui/src/brand/index.test.ts (new)
- packages/ui/src/brand/shared-source.test.ts (new)
- packages/sms/src/brand-source.test.ts (new)
- packages/ui/src/index.ts (brand re-exports)
- packages/ui/src/receipt-document.ts (BRAND.name / BRAND.supportPhone)
- packages/ui/src/receipt-preview.ts (BRAND.name)
- packages/ui/package.json (`./brand` subpath export)
- packages/ui/tsconfig.json (rootDir `.`, include `brand`)
- packages/sms/src/templates.ts (BRAND.name)
- packages/sms/package.json (`@bm/ui` workspace dep)
- _bmad-output/implementation-artifacts/14-4-brand-assets-pipeline-review-findings.md (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Brand source implemented in `@bm/ui` (assets, manifest, colour overrides) + receipt/SMS consumers wired to single source; gate green | claude-opus-4-7 |
