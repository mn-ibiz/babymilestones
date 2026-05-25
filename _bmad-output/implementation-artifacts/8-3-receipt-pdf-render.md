# Story 8.3: Receipt PDF render

Status: done

> Canonical ID: P1-E08-S03 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E08-S03.md

## Story

As Reception,
I want to give a parent a clean printed receipt,
so that they leave with a professional, branded record of their transaction.

## Acceptance Criteria

1. A4 and 80mm thermal templates are rendered server-side.
2. Branded: logo + colours; uses the `ReceiptPreview` compound for consistency with the SMS plain-text variant.
3. Includes: business details, sequence number, date, items, totals, payment method, and customer phone (last 4 digits only).

## Tasks / Subtasks

- [x] Task 1: Build server-side render module (AC: #1)
  - [x] Add a receipt render util in `packages/ui/src/receipt-document.ts` — dependency-light pure-string renderer (Decision 13 = browser print), no heavy native PDF lib
  - [x] Implement the A4 template (branded HTML) and the 80mm thermal template (plain text, fixed-width 40-col formatting)
- [x] Task 2: Branding + shared layout (AC: #2)
  - [x] Apply logo (inline SVG mark) + brand colours from `@bm/config` brand tokens (re-exported via `@bm/ui`)
  - [~] Use the `ReceiptPreview` compound — deferred: the compound is an X7-S03 deliverable that does not exist yet. Built a sibling module in `@bm/ui` sharing conventions with `receipt-preview.ts` (same `formatReceiptCents`, business name, HTML-escaping); see review-findings.md item 1.
- [x] Task 3: Populate receipt content (AC: #3)
  - [x] Render business details, sequence number (display as `<series>-<seq>`, e.g. `BM-2026-000123`), date, line items, totals, payment method, and masked customer phone (last 4 only)
  - [x] Source data via the persisted receipt record (P1-E08-S01 schema written by Story 8.2's writer); `formatReceiptNumber` from `@bm/payments` for the display sequence
- [x] Task 4: Expose render route (AC: #1, #3)
  - [x] Added `GET /receipts/:id?format=a4|thermal` under `apps/api/src/routes/receipts/` — staff-only (`read wallet`), correct content type per format, 400 on bad format, 404 on unknown id
- [x] Task 5: Tests (AC: all)
  - [x] vitest, test-first: structure tests on both templates (required fields, masked phone, branding) in `packages/ui`; route integration tests via `app.inject` in `apps/api` (both formats, content types, masking, 400/404/401)

## Dev Notes

- Render is server-side only; thermal output is plain text with fixed-width columns (no HTML reliance).
- Phone must be masked to last 4 digits — never render the full number.
- Concrete paths to touch:
  - `apps/api/src/routes/receipts.ts` (or similar) — PDF/thermal render route.
  - `packages/payments/src/receipts/render/` (templates + renderer) or an `apps/api` util.
  - `packages/ui` — `ReceiptPreview` compound + brand tokens (primitives arrive in X7).
- Testing standards: vitest, test-first; `pnpm test` in the touched workspace.

### Project Structure Notes
- Spans `apps/api` (route + render) and `packages/ui` (`ReceiptPreview`, brand tokens).
- Depends on Story 8.2 (writer/receipt record) and X7 (UI primitives for `ReceiptPreview`).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E08-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E08].

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- `services_unit_check` constraint in the route test seed — service `unit` is
  CHECK-constrained to `('play','talent','salon','coaching','event')`; fixed seed
  to use `unit: "play"`.

### Completion Notes List

- Render is server-side, dependency-light, deterministic pure-string functions
  (Decision 13 = browser print) — no Puppeteer/native PDF lib pulled in.
- Two templates: A4 (branded, self-contained HTML with inline SVG logo + brand
  tokens, `@page { size: A4 }`) and 80mm thermal (plain text, fixed-width 40-col,
  no HTML). Both rendered from one masked render model (`toReceiptDocument`).
- Phone is masked to the last 4 digits in the render model so no template ever
  sees the full number; tests assert the full number is absent in both formats.
- A4 escapes all interpolated untrusted fields; thermal is `text/plain`.
- Route loads the persisted receipt + lines, resolves customer name/phone via
  the parent account, and uses `formatReceiptNumber` for the display sequence.

### File List

- `packages/ui/src/receipt-document.ts` (new)
- `packages/ui/src/receipt-document.test.ts` (new)
- `packages/ui/src/index.ts` (export render module)
- `apps/api/src/routes/receipts/index.ts` (new)
- `apps/api/src/routes/receipts/render.ts` (new)
- `apps/api/src/routes/receipts/render.test.ts` (new)
- `apps/api/src/app.ts` (register receipt routes)
- `_bmad-output/implementation-artifacts/8-3-receipt-pdf-render-review-findings.md` (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Receipt render implemented: A4 HTML + 80mm thermal templates, masked phone, staff-only render route, tests | claude-opus-4-7 |
