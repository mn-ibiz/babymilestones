# Story 3.6: Refund recording (admin-only) creates a reversing entry

Status: done

> Canonical ID: P1-E03-S06 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E03-S06.md

## Story

As an admin,
I want to record an offline refund as a reversing ledger entry,
so that the ledger matches what actually happened in the real world.

## Acceptance Criteria

1. Admin selects an original debit entry; enters reason code (required) + free-text note; specifies refund amount (≤ original).
2. A `wallet_ledger` row is inserted with `kind='refund'`, `reverses_entry_id` = original ID.
3. SMS-stub notification queued for the parent.
4. Refund cannot exceed remaining-refundable amount on the original (track partial refunds).
5. Only `admin` and `super_admin` roles can call this endpoint.

## Tasks / Subtasks

- [x] Task 1: Implement refund posting (AC: #1, #2, #4)
  - [x] Add a refund function to `packages/wallet` accepting `{ originalEntryId, amount, reasonCode, note, postedBy }`; validate `reasonCode` required and amount ≤ remaining-refundable on the original (sum prior refunds against the original to support partial refunds).
  - [x] Insert a `wallet_ledger` row with `kind='refund'`, `reverses_entry_id` = original ID, idempotent via `idempotencyKey`; flag `loyalty_clawback_pending=true` on the entry. (Posted directly inside the refund transaction rather than via the generic `post()` so the reversal sign, `reverses_entry_id` self-FK, and the clawback flag are set atomically.)
- [x] Task 2: Admin-only API endpoint (AC: #5)
  - [x] Add `POST /admin/refunds` under `apps/api/src/routes/admin/` guarded by `requirePermission("manage","refund")` (`@bm/auth`), which only `admin` and `super_admin` hold — treasury/accountant (`create`/`read refund`) are rejected.
- [x] Task 3: SMS-stub notification (AC: #3)
  - [x] Queue a transactional parent notification via `@bm/sms` `StubSmsSender` on successful (non-replay) refund.
- [x] Task 4: Audit (DoD)
  - [x] Write the `wallet.refund` action to `audit_outbox` inside the refund transaction.
- [x] Task 5: Tests (all)
  - [x] Tests-first: reversing entry + net effect (AC2); over-refund rejected, partial refunds tracked (AC4); reason code required (AC1); reception + treasury rejected, admin/super_admin allowed (AC5); SMS-stub queued (AC3); audit + idempotency.

## Dev Notes

- A refund is a NEW reversing `wallet_ledger` row (`kind='refund'`, `reverses_entry_id` set) — never a mutation of the original (ledger is append-only).
- Partial refunds: remaining-refundable = original amount minus the sum of prior refunds against it; enforce amount ≤ remaining.
- Loyalty proportional clawback is deferred to P3 (`P3-E04`); for now just set `loyalty_clawback_pending=true` on the entry.
- Lives in `packages/wallet` (refund logic), `apps/api/src/routes/` (admin-only route), `packages/auth` (role guard), `packages/sms` (stub notification).
- Testing standards: vitest, test-first; cover all five ACs plus role enforcement.

### Project Structure Notes
- `packages/wallet`: refund function. `apps/api/src/routes/`: admin-guarded refund endpoint. `packages/sms`: stub notify. Audit to `audit_outbox`.
- Depends on P1-E03-S01..S03 (ledger + idempotent posting) and P1-E10 (admin shell / roles).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E03-S06.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E03]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Full gate green: `pnpm test && pnpm typecheck && pnpm lint && pnpm build` (all 15 tasks pass; +10 wallet unit tests, +11 api integration tests).

### Completion Notes List

- `@bm/wallet` `refund()` posts a NEW reversing `wallet_ledger` row (`kind='refund'`, `reverses_entry_id`=original) signed opposite the original so the net effect is the refunded portion — the ledger is never mutated/deleted (append-only, S01).
- Remaining-refundable = `|original.amount|` − Σ(prior refund magnitudes against it); enforced ≤ remaining for partial-refund tracking (AC4). Reason code required (AC1).
- `loyalty_clawback_pending` added to `wallet_ledger` (migration 0015, additive) and set true on every refund — proportional clawback itself is deferred to P3 (P3-E04).
- Idempotent via `idempotencyKey` (server-derived `refund:<original>:<amount>` when absent); replay returns the existing entry, no second insert, no second SMS.
- Admin-only enforced at the route via `requirePermission("manage","refund")` — only `admin`/`super_admin` hold it (treasury/accountant have only `create`/`read refund` and are rejected). `postedBy` and the wallet are server-derived; no client-trusted money fields.
- SMS-stub queued transactionally on success; failure is best-effort (does not undo the committed refund). See review-findings L1–L3 for deferred low-severity notes.

### File List

- `packages/db/migrations/0015_refund_reversing_entry.sql` (new)
- `packages/db/src/schema/wallet-ledger.ts` (loyaltyClawbackPending column)
- `packages/wallet/src/refund.ts` (new)
- `packages/wallet/src/refund.test.ts` (new)
- `packages/wallet/src/index.ts` (export refund + errors/types)
- `packages/contracts/src/index.ts` (refundSchema)
- `apps/api/src/routes/admin/index.ts` (new)
- `apps/api/src/routes/admin/refund.ts` (new)
- `apps/api/src/routes/admin/refund.test.ts` (new)
- `apps/api/src/app.ts` (register admin routes)
- `_bmad-output/implementation-artifacts/3-6-refund-recording-admin-only-creates-a-reversing-review-findings.md` (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented admin refund reversing entry: `@bm/wallet` refund() primitive, admin-only `POST /admin/refunds`, SMS-stub + audit, migration 0015; tests + gate green | claude-opus-4-7 |
