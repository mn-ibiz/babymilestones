# Story 29.3: Print packing slip

Status: backlog

> Canonical ID: P4-E04-S03 · Phase: P4 · Source: _bmad-output/planning-artifacts/stories/p4/P4-E04-S03.md

## Story

As packer,
I want to print a packing slip per WooCommerce order,
so that I can pack and dispatch it.

## Acceptance Criteria

1. "Print packing slip" button on order card.
2. Slip lists: Woo order number, customer name + phone, shipping address (from Woo), delivery method, line items + qty, customer note / special instructions.
3. Uses system default printer (Decision 13).
4. Slip is rendered from the local `wc_orders` mirror — no live Woo call required at print time.

## Tasks / Subtasks

- [ ] Task 1: Implement Print packing slip (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: "Print packing slip" button on order card.
  - [ ] Satisfy AC#2: Slip lists: Woo order number, customer name + phone, shipping address (from Woo), delivery method, line items + qty, customer note / special instructions.
  - [ ] Satisfy AC#3: Uses system default printer (Decision 13).
  - [ ] Satisfy AC#4: Slip is rendered from the local `wc_orders` mirror — no live Woo call required at print time.
- [ ] Task 2: Tests (AC: all)
  - Unit: template renders with required fields; missing address falls back to "Pickup in store" note.

## Dev Notes

- Reuses the receipt rendering pipeline from P1-E08 where possible; packing slip is a distinct template (no price totals required, but qty is mandatory).

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P1-E08 (receipt engine / PDF render)
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p4/P4-E04-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P4-E04.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
