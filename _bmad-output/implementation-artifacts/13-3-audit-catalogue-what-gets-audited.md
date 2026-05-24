# Story 13.3: Audit catalogue (what gets audited)

Status: ready-for-dev

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

- [ ] Task 1: Define the typed audit-action catalogue (AC: #1, #2)
  - [ ] Create `packages/auth/src/audit-actions.ts` exporting a typed enum/const of audited actions covering: all auth events (signup, login, logout, PIN change, SSO session create/revoke), all role changes, all ledger postings (debit/credit/hold/release), refund actions, settings changes.
  - [ ] Export the action type/union from `@bm/auth` so the `audit()` helper's `action` field is constrained to it.
- [ ] Task 2: Document exclusions (AC: #3)
  - [ ] Encode/document that reads, list-views, and page navigation are explicitly NOT audited (inline doc comment in the catalogue file).
- [ ] Task 3: Tests (AC: all)
  - [ ] vitest: enum contains each required category's actions; type narrows `audit()` action arg; assert excluded categories are absent. Test-first.

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
