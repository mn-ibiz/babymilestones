# Story 8.4: Receipt reprint

Status: ready-for-dev

> Canonical ID: P1-E08-S04 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E08-S04.md

## Story

As Reception,
I want to reprint or re-SMS a receipt at any time,
so that a parent who lost or never received their receipt can get an exact copy.

## Acceptance Criteria

1. From transaction history, Reception can trigger "Reprint" or "Re-send SMS".
2. Reprints are audited (`receipt.reprinted`).
3. Receipt content is immutable — a reprint is byte-identical to the original.

## Tasks / Subtasks

- [ ] Task 1: Reprint endpoint (AC: #1, #3)
  - [ ] Add a Fastify route under `apps/api/src/routes/` to reprint a receipt by id, re-rendering from the stored immutable receipt record (Story 8.2/8.3) so output is byte-identical
  - [ ] Add a "Re-send SMS" action that enqueues the receipt's SMS via `packages/sms` `send(...)`
- [ ] Task 2: Transaction history UI hooks (AC: #1)
  - [ ] Add "Reprint" and "Re-send SMS" actions to the transaction history view (POS/Reception surface)
- [ ] Task 3: Audit reprints (AC: #2)
  - [ ] Write a `receipt.reprinted` event to `audit_outbox` on each reprint/re-send (include receipt id, actor)
- [ ] Task 4: Guarantee immutability (AC: #3)
  - [ ] Ensure reprint reads the persisted receipt + lines verbatim and never recomputes totals or re-allocates sequence
- [ ] Task 5: Tests (AC: all)
  - [ ] vitest, test-first: reprint produces byte-identical output to the original render; `receipt.reprinted` row written to `audit_outbox`; re-send SMS enqueues an `sms_outbox` row

## Dev Notes

- Reprint must NOT mutate or regenerate the receipt — it re-renders the stored immutable record (mirrors the wallet reversing-entry principle: append/read, never edit history).
- Re-send SMS routes through the provider-agnostic `packages/sms` sender (stub writes to `sms_outbox`).
- Concrete paths to touch:
  - `apps/api/src/routes/receipts.ts` — reprint + re-send actions.
  - Transaction history UI in `apps/pos` (and/or `apps/admin` Reception surface).
  - `audit_outbox` (via `packages/db`); `packages/sms` for re-send.
- Testing standards: vitest, test-first; `pnpm test` in touched workspaces. Audited actions must write to `audit_outbox` per DoD.

### Project Structure Notes
- Spans `apps/api` (routes), `apps/pos`/`apps/admin` (UI), `packages/sms`, and `packages/db` (`audit_outbox`).
- Depends on Story 8.3 (render) and uses the receipt record from Story 8.2.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E08-S04.md]
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
