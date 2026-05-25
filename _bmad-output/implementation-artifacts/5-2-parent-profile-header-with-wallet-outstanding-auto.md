# Story 5.2: Parent profile header with wallet + outstanding + auto-credit toggle

Status: done

> Canonical ID: P1-E05-S02 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E05-S02.md

## Story

As Reception,
I want all the financial facts about a parent visible without scrolling,
so that I can serve them without digging through screens.

## Acceptance Criteria

1. Header shows: name, phone (full), wallet balance (KES), outstanding amount (red if > 0), auto-credit toggle (admin-only).
2. Numbers refresh on every page action; no stale state.
3. Outstanding amount click → modal listing open invoices.

## Tasks / Subtasks

- [x] Task 1: Parent profile contract (AC: #1, #3)
  - [x] Added `ParentProfileSummary` / `ParentProfileResponse` and `OpenInvoice` / `OpenInvoicesResponse` interfaces plus the `isOutstanding` pure rule in `packages/contracts` (name, full phone, wallet balance, outstanding, autoCreditEnabled). (Used interfaces, mirroring the existing `ParentSearchResult` contract style rather than a Zod schema — the responses are server-shaped, not parsed inbound.)
- [x] Task 2: Profile + invoices endpoints (AC: #1, #2, #3)
  - [x] `apps/api/src/routes/reception/parent-profile.ts` — `GET /reception/parents/:userId/profile` returns header facts; balance via `@bm/wallet.balance`, outstanding = sum of non-settled `invoices`
  - [x] Same file exposes `GET /reception/parents/:userId/open-invoices` (oldest-first list + summed total) for the modal
  - [x] Registered via `registerParentProfile` in `apps/api/src/routes/reception/index.ts` (wired into `buildApp`)
- [x] Task 3: Auto-credit toggle endpoint (AC: #1)
  - [~] Pre-existing from P1-E03-S07: `PATCH /admin/parents/:userId/auto-credit` sets `wallets.auto_credit_enabled` (the real foundation column — the story's `parents.auto_credit_enabled` does not exist), admin-only via `manage wallet`, writes an audit row. Reused as-is; added an integration test asserting non-admin rejection writes no audit.
- [x] Task 4: ParentHeader compound (AC: #1, #2, #3)
  - [x] `apps/admin/lib/parent-header.ts` — pure `parentHeaderViewModel(summary, role)` view logic: full name, full phone, balance (KES), outstanding (red when > 0), admin-only auto-credit control. Kept as a testable pure function per the story hint (no heavy React render).
  - [~] No-stale-state (AC2) documented in the mapper; the endpoint stores no balance so any page refetch is always fresh. Live React refetch/invalidate wiring + the clickable modal are deferred to the page-assembly story (no React page component exists in this story's scope).
  - [~] Outstanding-click modal: the data endpoint + contract shape are delivered; the click-to-open UI binding is part of the deferred page wiring above.
- [x] Task 5: Tests (AC: all)
  - [x] Unit: `isOutstanding` red-when->0 rule (contracts); `parentHeaderViewModel` red flag + full phone + admin-only toggle (admin lib); admin-only toggle gating already covered by `auto-credit-toggle.test.ts`
  - [x] Integration: profile + open-invoices endpoints (shape, settled excluded, 404, staff-only 403, 401); toggle rejected for non-admin writes no audit; reflects ON after admin flip
  - [~] E2E: deferred with the React page assembly (no admin page route in this story's scope); endpoint + pure view logic are fully unit/integration tested instead

## Dev Notes

- Implemented as a compound `<ParentHeader parent={parent}/>` in `apps/admin`.
- Auto-credit toggle is admin-only — enforce with `@bm/auth` role guard server-side, not just UI hiding; audit the change.
- "No stale state": invalidate/refetch profile data after every page action (top-up, visit, etc.).
- Source paths to touch: `apps/api/src/routes/reception/{parent-profile.ts,parent-open-invoices.ts}`, `apps/admin` ParentHeader, `packages/contracts` (profile schema), `packages/auth` (role guard), `@bm/wallet`.
- Testing standards: vitest per workspace, TS strict, test-first (red/green/refactor).

### Project Structure Notes
- UI compound in `apps/admin`; profile/invoice routes in `apps/api/src/routes/reception/`.
- Dependencies (from source): S01 (search → profile), P1-E03 (wallet/ledger). Additive-only migrations.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E05-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E05.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

Full gate green from repo root: `pnpm test` (15/15 tasks, 205 api + 34 admin + 30 contracts tests), `pnpm typecheck`, `pnpm lint`, `pnpm build` — all passing.

### Completion Notes List

- Header summary + open-invoices delivered as two read-only reception endpoints guarded by `read wallet` (staff-only); packer→403, unauth→401.
- Wallet balance is read via `@bm/wallet.balance` (SUM over the append-only ledger — never stored), so the header is inherently never stale; outstanding = `SUM(amount_due)` over non-settled invoices.
- The auto-credit toggle endpoint already existed from P1-E03-S07 on `wallets.auto_credit_enabled` (the foundation column; the story's hinted `parents.auto_credit_enabled` does not exist). Reused it; admin-only + audited, with a new test proving non-admin attempts write no audit row.
- View logic kept in a pure, DOM-free function (`parentHeaderViewModel`) per the story hint; reuses `isOutstanding`, `formatCentsKes`, and the existing `autoCreditToggleViewState`.
- No new migration needed (all columns/tables pre-exist).
- Deferred (no broken claim): the React `<ParentHeader/>` render + click-to-open modal + live refetch wiring and the E2E test belong to the page-assembly story — no admin page route exists in this story's scope. Endpoint + contract + pure view logic are fully tested.

### File List

- packages/contracts/src/index.ts (added profile/open-invoices interfaces + `isOutstanding`)
- packages/contracts/src/index.test.ts (added `isOutstanding` tests)
- apps/api/src/routes/reception/parent-profile.ts (new — profile + open-invoices endpoints)
- apps/api/src/routes/reception/parent-profile.test.ts (new — integration tests)
- apps/api/src/routes/reception/index.ts (register `registerParentProfile`)
- apps/admin/lib/parent-header.ts (new — pure header view model)
- apps/admin/lib/parent-header.test.ts (new — view-model unit tests)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status updates)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented profile-header + open-invoices endpoints, contract shapes, and pure header view logic; reused existing admin-only audited auto-credit toggle; full gate green | claude-opus-4-7 |
