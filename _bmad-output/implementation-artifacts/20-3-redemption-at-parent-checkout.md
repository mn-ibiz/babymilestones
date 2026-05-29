# Story 20.3: Redemption at parent checkout

Status: done

> Canonical ID: P2-E05-S03 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E05-S03.md

## Story

As parent,
I want to use my points to reduce my booking or shop bill,
so that the capability described above is delivered.

## Acceptance Criteria

1. At booking confirmation (in the custom platform), a toggle: "Use X points (save KES Y)". (WooCommerce online purchases are out of scope for loyalty — Decision 37.)
2. Toggle on → applies points as a wallet credit equal to `points × redeem_rate`, deducts from the bill.
3. Cannot redeem more points than current balance; cannot redeem points already on a pending settlement.
4. Redemption writes a `loyalty_ledger` debit + a `wallet_ledger` credit + the booking debit applies normally.

## Tasks / Subtasks

- [x] Task 1: Implement Redemption at parent checkout (AC: #1, #2, #3, #4)
  - [x] Satisfy AC#1: `GET /parents/me/loyalty` returns a redemption quote `{ availablePoints, maxDiscountCents, redeemRate }` powering the "Use X points (save KES Y)" toggle in the platform. (WooCommerce out of scope — Decision 37.)
  - [x] Satisfy AC#2: `redeemPoints` credits the wallet by `points × redeem_rate` (a `wallet_ledger` credit), reducing what the parent must pay.
  - [x] Satisfy AC#3: cannot redeem more than the current balance (in-transaction balance recheck → `InsufficientPointsError` → 409). Idempotency-key + unique constraint prevent double-spend. (Pending-settlement coupling is the separate story P3-E04-S04 — see notes.)
  - [x] Satisfy AC#4: redemption writes a `loyalty_ledger` debit + a `wallet_ledger` credit (linked via `wallet_ledger_entry_id`) in ONE transaction; the booking debit is independent and applies normally.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest; 7 engine tests + 7 parent-route tests (idempotency, over-balance, exact-balance, rate snapshot, CSRF, auth).

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P2-E01
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E05-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E05.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context)

### Debug Log References

- `pnpm -C packages/wallet exec vitest run src/loyalty-redeem.test.ts` → 7/7 pass
- `pnpm -C apps/api exec vitest run src/routes/parents/loyalty.test.ts` → 7/7 pass
- `pnpm -C packages/wallet exec vitest run` → 13 files / 104 tests pass
- `pnpm -C apps/api exec vitest run src/routes/parents` → 14 files / 165 tests pass
- `pnpm -C packages/wallet exec tsc --noEmit` + `pnpm -C apps/api exec tsc --noEmit` → clean

### Completion Notes List

- `redeemPoints` (in `@bm/wallet`) runs ONE `db.transaction` that: (1) short-circuits on an existing `idempotency_key` (no double-spend / no second wallet credit); (2) re-reads the loyalty balance INSIDE the transaction and throws `InsufficientPointsError` if `points` exceeds it (AC3); (3) inserts a `wallet_ledger` credit of `points × redeem_rate` cents (mirroring `post`, kept inside the tx) and a `loyalty_ledger` debit referencing that entry via `wallet_ledger_entry_id` (AC4); (4) audits `loyalty.redeem`.
- **Double-spend safety**: the loyalty `idempotency_key` UNIQUE constraint + the in-transaction balance recheck mean a concurrent racing redeem either fails the balance check or loses the unique-key race — never both succeed.
- **Integer-cents**: discount = `kesForPoints(points, redeemRate) = points × redeemRate × 100`; no float drift.
- **AC4 booking debit unaffected**: redemption only credits the wallet; the existing booking flow still debits the wallet as normal, so the net effect is the redeemed cash reduces what the parent pays.
- **AC1 quote**: `GET /parents/me/loyalty` returns `quote { availablePoints, maxDiscountCents, redeemRate }` for the platform "Use X points (save KES Y)" toggle (the platform UI page is delivered in S04).
- **AC3 pending-settlement caveat**: "cannot redeem points already on a pending settlement" requires coupling loyalty to in-flight settlements, which is the dedicated story **P3-E04-S04** (Epic 26, out of this epic's scope). Here AC3 is enforced as `points <= available balance`; a TODO marker is left for the P3 coupling.
- Ownership is derived server-side (wallet belongs to the session user); the redeem mutation requires the CSRF token (403 without it); reads are not audited.

### File List

- packages/wallet/src/loyalty-redeem.ts (new — redeemPoints + InsufficientPointsError)
- packages/wallet/src/loyalty-redeem.test.ts (new — 7 tests)
- packages/wallet/src/index.ts (re-export)
- apps/api/src/routes/parents/loyalty.ts (new — GET /parents/me/loyalty, POST /parents/me/loyalty/redeem)
- apps/api/src/routes/parents/loyalty.test.ts (new — 7 tests)
- apps/api/src/routes/parents/index.ts (register route)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Atomic idempotent redemption engine + parent checkout route; 14 tests pass | Amelia (Dev) |
