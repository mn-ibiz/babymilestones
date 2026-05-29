# Story 20.4: Loyalty balance and history in parent app

Status: done

> Canonical ID: P2-E05-S04 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E05-S04.md

## Story

As parent,
I want to see my points balance and how I earned them,
so that the capability described above is delivered.

## Acceptance Criteria

1. Parent dashboard shows points balance + lifetime earned + lifetime redeemed.
2. History view: earn/redeem entries with source link (booking, top-up, etc.).
3. Decision refs: 11.

## Tasks / Subtasks

- [x] Task 1: Implement Loyalty balance and history in parent app (AC: #1, #2, #3)
  - [x] Satisfy AC#1: read-only `GET /parents/me/loyalty` returns balance + lifetime earned + lifetime redeemed; platform `loyalty` page renders them.
  - [x] Satisfy AC#2: history view renders earn/redeem entries with a friendly source label (booking, top-up, in-store, redeemed-at-checkout).
  - [x] Satisfy AC#3: Decision ref 11 honoured (parent-visible loyalty).
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest; 10 pure view-model tests + the read endpoint covered by the parent route suite (GET returns balance/totals/history).

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - S03 - P1-E11. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E05-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E05.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context)

### Debug Log References

- `pnpm -C apps/platform exec vitest run lib/loyalty.test.ts` → 10/10 pass
- `pnpm -C apps/api exec vitest run src/routes/parents/loyalty.test.ts` → 7/7 (read endpoint AC1/AC2)
- `pnpm -C {contracts} exec tsc --noEmit` + `pnpm -C apps/api exec tsc --noEmit` + `pnpm -C apps/platform exec tsc --noEmit` → clean

### Completion Notes List

- The read API (`GET /parents/me/loyalty`) was implemented alongside the redemption story (20-3) — it returns `{ balance, lifetimeEarned, lifetimeRedeemed, history, quote }` (now typed as `LoyaltyAccountResponse` in `@bm/contracts`). This story adds the parent-app platform surface that consumes it.
- **AC1** — the platform `loyalty` page renders the points balance + lifetime earned + lifetime redeemed (plus the KES value of the balance at the current redeem rate).
- **AC2** — the history list renders each earn/redeem entry with a friendly source label (`sourceLabel`: top-up, booking, in-store purchase, redeemed at checkout, adjustment) and a signed points string (`+10 pts` / `-40 pts`).
- Read-only + ownership-scoped: the endpoint resolves the wallet from the session user (never a param), and reads are not audited (per the audit catalogue's read-exclusion rule).
- Pure view-model helpers (`formatKes`, `formatPoints`, `sourceLabel`, `toLoyaltyHistoryView`) live in `apps/platform/lib/loyalty.ts` and are unit-tested; the page (`apps/platform/app/(app)/loyalty/page.tsx`) is a declarative server component following the existing wallet-page template.

### File List

- packages/contracts/src/index.ts (added LoyaltyAccountResponse)
- apps/api/src/routes/parents/loyalty.ts (typed GET response as LoyaltyAccountResponse)
- apps/platform/lib/loyalty.ts (new — pure view-model helpers)
- apps/platform/lib/loyalty.test.ts (new — 10 tests)
- apps/platform/lib/loyalty-api.ts (new — fetchLoyaltyAccount)
- apps/platform/app/(app)/loyalty/page.tsx (new — balance + lifetime totals + history)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Parent loyalty balance + history platform page; 10 view-model tests pass | Amelia (Dev) |
