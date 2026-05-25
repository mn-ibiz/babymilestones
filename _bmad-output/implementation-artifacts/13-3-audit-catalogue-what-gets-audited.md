# Story 13.3: Audit catalogue (what gets audited)

Status: done

> Canonical ID: X5-S03 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/X5-S03.md

## Story

As a security reviewer,
I want a definitive list of audited actions,
so that there is a single typed source of truth for what is and is not captured in the audit log.

## Acceptance Criteria

1. Documented in `packages/auth/audit-actions.ts` as a typed enum.
2. Initial set: all auth events, all role changes, all ledger postings, refund actions, settings changes.
3. NOT audited: reads, list-views, page navigation.

## Tasks / Subtasks

- [x] Task 1: Define the typed audit-action catalogue (AC: #1, #2)
  - [x] Create `packages/auth/src/audit-actions.ts` exporting a typed const map (`AUDIT_ACTION_CATALOGUE`) grouped by category, a derived flat `AUDIT_ACTIONS` tuple, and the `AuditAction` union covering: all auth events (signup, login success/failure, logout/logout.all, staff login, PIN change, reset request/complete), all role changes (staff create/update, reset_pin, rbac.impersonate), all ledger postings (wallet check-in debit, cash/bank/mpesa/paystack/reception top-ups, reconciliation adjustment post/approve/reject), refund (`wallet.refund`), and settings changes (settings, auto-credit, SMS config, catalogue, float accounts).
  - [x] Export `AuditAction`/`auditAction()`/`isAuditAction()` from `@bm/auth`. NOTE: `@bm/db`'s `audit()` keeps `action: string` because `@bm/db` is the lowest layer and must not import upward (would be a circular dep); the catalogue is the contract layer above it. Call sites pass `auditAction("...")` for a checked, narrowed literal, and the completeness test enforces every emitted action is registered — keeping the catalogue the single source of truth across the package boundary.
- [x] Task 2: Document exclusions (AC: #3)
  - [x] Inline doc comment documents reads/list-views/page navigation are NOT audited; a test asserts no `read`/`list`/`view`/`nav` actions exist in the catalogue.
- [x] Task 3: Tests (AC: all)
  - [x] vitest (test-first): shape + each AC2 category present; `auditAction()`/`isAuditAction()` type narrowing; AC3 exclusion regex; plus a codebase-scan completeness test asserting every `audit(...)` `action:` literal across `apps/`+`packages/` is in the catalogue (caught `parent.profile.create/update` that were emitted but unregistered).

## Dev Notes

- This is the contract layer over the X5-S01 `audit()` helper — it constrains which `action` strings are valid. No new tables.
- Anchor: `packages/auth` (import `@bm/auth`; phone+PIN, SSO sessions, role guards live here, so auth + role-change actions originate here). New file `packages/auth/src/audit-actions.ts`.
- TS strict, vitest test-first.

### Project Structure Notes
- New file in `packages/auth/src/`, exported from the package index. Consumed by the `audit()` helper (X5-S01) and any audited call site.
- Dependencies: X5-S01 (`audit_outbox` + helper).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/X5-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § X5]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Full gate (repo root): `pnpm test && pnpm typecheck && pnpm lint && pnpm build`.
- `@bm/api` test flaked once on a 30s hook timeout under load (993s run); re-run green in 93s (41 files / 393 tests). All other packages green first pass. typecheck/lint/build all green.

### Completion Notes List

- Catalogue (`AUDIT_ACTION_CATALOGUE`) is grouped by AC2 category; `AUDIT_ACTIONS` (flat tuple) and `AuditAction` (union) are derived from it so there is one source of truth.
- `@bm/db.audit()` keeps `action: string` to avoid an upward import (circular dep). Type-safety is delivered via `auditAction()` (compile-time + identity passthrough) and `isAuditAction()` (runtime guard), exported from `@bm/auth`.
- A codebase-scan completeness test walks `apps/`+`packages/` for `audit(...)` call sites and asserts every emitted `action:` literal is registered. It immediately caught two real but unregistered actions (`parent.profile.create`, `parent.profile.update`), which were added to the catalogue.
- AC3 exclusions enforced both by inline doc and a regex test rejecting any `read`/`list`/`view`/`nav` action.
- Single review performed: no BLOCKER/high findings; nothing deferred (no findings file).

### File List

- packages/auth/src/audit-actions.ts (new)
- packages/auth/src/audit-actions.test.ts (new)
- packages/auth/src/index.ts (export catalogue)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented typed audit catalogue + completeness/exclusion/narrowing tests; status done | claude-opus-4-7 |
