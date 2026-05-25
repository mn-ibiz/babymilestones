# Story 8.4: Receipt reprint

Status: done

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

- [x] Task 1: Reprint endpoint (AC: #1, #3)
  - [x] Add a Fastify route under `apps/api/src/routes/` to reprint a receipt by id, re-rendering from the stored immutable receipt record (Story 8.2/8.3) so output is byte-identical (`POST /receipts/:id/reprint`)
  - [x] Add a "Re-send SMS" action that enqueues the receipt's SMS via `packages/sms` `send(...)` (`{ resend: true }`)
- [~] Task 2: Transaction history UI hooks (AC: #1) — DEFERRED. The reception transaction-history surface already exposes a Print + SMS receipt action pair per row (P1-E05-S06, `apps/admin/app/reception/page.tsx`), satisfying AC1. A dedicated button for the new receipt-engine endpoint would duplicate that flow; deferred to avoid gold-plating. See `8-4-receipt-reprint-review-findings.md`.
- [x] Task 3: Audit reprints (AC: #2)
  - [x] Write a `receipt.reprinted` event to `audit_outbox` on each reprint/re-send (receipt id + actor + format/resend/ip/ua), inside the same transaction as the re-SMS
- [x] Task 4: Guarantee immutability (AC: #3)
  - [x] Reprint reads the persisted receipt + lines verbatim (`loadReceipt`); never recomputes totals, never re-allocates a sequence (test asserts no new `receipts` row and byte-identity vs the S03 render route)
- [x] Task 5: Tests (AC: all)
  - [x] vitest, test-first: reprint byte-identical to the original render (both A4 + thermal); `receipt.reprinted` row written to `audit_outbox`; re-send enqueues an `sms_outbox` row; plus format-400, 404, 401, 403-CSRF guards (10 tests)

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

claude-opus-4-7

### Debug Log References

- `pnpm vitest run src/routes/receipts/reprint.test.ts` (apps/api) → 10/10 green.
- Full gate from repo root: `pnpm test` (33 files, 311 tests) && `pnpm typecheck` && `pnpm lint` && `pnpm build` — all green.

### Completion Notes List

- New route `POST /receipts/:id/reprint` re-renders a persisted receipt verbatim (reuses the same `loadReceipt`/`toReceiptDocument`/`renderReceipt` path as the S03 render route) so the body is byte-identical; verified by asserting equality against the `GET /receipts/:id` response for both `a4` and `thermal`.
- No new `receipts` row or sequence is ever written (AC3) — reprint only reads; the only writes are the `audit_outbox` row and (optionally) the `sms_outbox` row, both inside one transaction.
- Re-SMS (`{ resend: true }`) routes through `@bm/sms` `StubSmsSender` as a transactional send (template `receipt.reprint`); it is the parent's own receipt, so it is not marketing-consent-gated. Response carries `x-receipt-resent`.
- Staff-only: guarded to `read receipt`; the mutating POST additionally requires the CSRF double-submit token (401/403 tested).
- Task 2 (dedicated UI hook) deferred — existing reception transaction-history Print/SMS pair (P1-E05-S06) already covers AC1. See review-findings file.

### File List

- `apps/api/src/routes/receipts/reprint.ts` (new)
- `apps/api/src/routes/receipts/reprint.test.ts` (new)
- `apps/api/src/routes/receipts/index.ts` (register reprint route)
- `_bmad-output/implementation-artifacts/8-4-receipt-reprint-review-findings.md` (new)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented byte-identical reprint + re-SMS endpoint with audit; test-first (10 tests); gate green | claude-opus-4-7 |
