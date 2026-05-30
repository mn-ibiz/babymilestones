# Story 26.3: Admin manual loyalty adjustment

Status: done

> Canonical ID: P3-E04-S03 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E04-S03.md

## Story

As admin, I want to credit or debit a parent's points balance for goodwill or correction.

## Acceptance Criteria

1. Admin Reception → parent → loyalty → "Adjust" → amount + reason text.
2. Writes a `loyalty_ledger` row with `kind='adjustment'`, `posted_by=admin_user`.
3. Audit logged.
4. Permission: `admin`, `super_admin`.

## Tasks / Subtasks

- [x] Task 1: Implement Admin manual loyalty adjustment (AC: #1, #2, #3, #4)
  - [x] Satisfy AC#1: `POST /admin/parents/:parentId/loyalty/adjust { points, reason }` (with a companion `GET /admin/parents/:parentId/loyalty` for the Adjust UI to read the current balance). Input validated by the shared `loyaltyAdjustSchema` (signed non-zero bounded integer points + required trimmed reason).
  - [x] Satisfy AC#2: `adjustLoyaltyPoints` appends a NEW `loyalty_ledger` row `kind='adjustment'`, `points_delta=<signed points>`, `posted_by=<acting admin user id>` — append-only, never a mutation. A debit beyond the balance is permitted and flagged `negative_carry=true` (S02).
  - [x] Satisfy AC#3: The route writes a `loyalty.adjust` row to `audit_outbox` (existing `loyalty` audit category) recording parentId, signed points, reason, balanceAfter, negativeCarry.
  - [x] Satisfy AC#4: Reserved to `manage loyalty` (admin / super_admin) via `requirePermission("manage","loyalty")`; reception/cashier (read-only loyalty) → 403, anon → 401, missing CSRF → 403. The target must be a `parent` (never a staff login) → 404 otherwise.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest: 6 pure service tests (`packages/wallet/src/loyalty-adjust.test.ts`, real PGlite), 14 route integration tests (`apps/api/src/routes/admin/loyalty.test.ts`, app.inject + real sessions + CSRF), and the `loyaltyAdjustSchema` unit tests in `packages/contracts/src/loyalty.test.ts`.

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S01.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E04-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E04.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context)

### Debug Log References

- `pnpm -C packages/wallet exec vitest run` → 129/129 pass (incl. 6 in `loyalty-adjust.test.ts`).
- `pnpm -C apps/api exec vitest run` → 789/789 pass (incl. 14 in `admin/loyalty.test.ts`).
- `pnpm -C packages/contracts exec vitest run` → 319/319 pass (incl. the `loyaltyAdjustSchema` cases).
- `tsc --noEmit` green: contracts, auth, db, wallet, api.

### Completion Notes List

- Pure ledger service `adjustLoyaltyPoints` (in `@bm/wallet`) stays auth-free; permission gating + audit live at the API route (`apps/api/src/routes/admin/loyalty.ts`), wired into `registerAdminRoutes`.
- No new migration — reuses the append-only `loyalty_ledger` (`kind='adjustment'`) and existing `loyalty` audit category / `manage loyalty` RBAC grant.
- Repaired a pre-existing red contracts test: `loyaltyAdjustSchema` now makes `reason` field-level optional with an object-level refine enforcing a non-empty trimmed reason, so a *missing* reason is rejected without surfacing a `path:["reason"]` field message (matches the committed `rejects a missing reason` test). A `.transform` keeps `reason` non-optional in the inferred type for callers.

### File List

- packages/wallet/src/loyalty-adjust.ts (new — adjustLoyaltyPoints + LoyaltyAdjustmentError)
- packages/wallet/src/loyalty-adjust.test.ts (new — 6 service tests)
- packages/wallet/src/index.ts (re-export loyalty-adjust)
- apps/api/src/routes/admin/loyalty.ts (new — adjust route + balance read)
- apps/api/src/routes/admin/loyalty.test.ts (new — 14 route integration tests)
- apps/api/src/routes/admin/index.ts (register registerAdminLoyalty)
- packages/contracts/src/index.ts (loyaltyAdjustSchema — missing-reason handling fixed)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Admin manual loyalty adjustment route + service + audit + RBAC; contracts schema missing-reason fix. Green. | Claude Opus 4.8 |
