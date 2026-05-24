# Story 8.3: Receipt PDF render

Status: ready-for-dev

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

- [ ] Task 1: Build server-side render module (AC: #1)
  - [ ] Add a receipt render util in `apps/api` (or `packages/payments/src/receipts/render/`) using Puppeteer or `react-pdf`
  - [ ] Implement the A4 template and the 80mm thermal template (thermal = plain text, fixed-width formatting)
- [ ] Task 2: Branding + shared layout (AC: #2)
  - [ ] Apply logo + brand colours from `packages/ui` / `packages/config` brand tokens
  - [ ] Use the `ReceiptPreview` compound so PDF and SMS plain-text variants stay consistent
- [ ] Task 3: Populate receipt content (AC: #3)
  - [ ] Render business details, sequence number (display as `BM-<year>-<seq>`), date, line items, totals, payment method, and masked customer phone (last 4)
  - [ ] Source data via the receipt record from Story 8.2's writer
- [ ] Task 4: Expose render route (AC: #1, #3)
  - [ ] Add a Fastify route under `apps/api/src/routes/` to fetch/stream a receipt PDF by id (format query: `a4` | `thermal`)
- [ ] Task 5: Tests (AC: all)
  - [ ] vitest, test-first: snapshot/structure tests asserting both templates contain required fields, phone is masked to last 4, and branding is applied; route returns the correct content type per format

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
