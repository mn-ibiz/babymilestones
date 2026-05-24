# Story 2.5: Data export for a parent's record

Status: ready-for-dev

> Canonical ID: P1-E02-S05 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E02-S05.md

## Story

As a parent,
I want to download everything you have on me and my children,
so that I can exercise my rights under Kenya's Data Protection Act.

## Acceptance Criteria

1. "Export my data" button on parent profile → ZIP with JSON for parent, children, bookings, wallet ledger, receipts.
2. Generation is async (>5s); SMS-stub sends a download link, valid 7 days, single-use.
3. Audit logged.

## Tasks / Subtasks

- [ ] Task 1: Export-request API (AC: #1, #2, #3)
  - [ ] Add route under `apps/api/src/routes/` to enqueue a data-export job for the authed parent and return an accepted/queued response
  - [ ] Write the export-requested event to `audit_outbox`
- [ ] Task 2: Async export job (AC: #1, #2)
  - [ ] Register a job in `apps/jobs/src/registry.ts` that gathers JSON for parent, children, bookings, wallet ledger (`packages/wallet`), and receipts; bundle into a ZIP
  - [ ] Store ZIP at a signed-URL S3-equivalent
  - [ ] Generate a single-use download link valid 7 days
- [ ] Task 3: Notify via SMS stub (AC: #2)
  - [ ] On completion, use `packages/sms` stub to send the download link
- [ ] Task 4: Single-use download endpoint (AC: #2)
  - [ ] Add route under `apps/api/src/routes/` that serves/redirects to the signed URL, enforcing 7-day expiry and single-use semantics
- [ ] Task 5: Export button UI (AC: #1)
  - [ ] In `apps/platform/app/`, add "Export my data" button on the parent profile
- [ ] Task 6: Tests (AC: all)
  - [ ] Write vitest unit/integration tests (test-first): ZIP contents cover all five data sets, async enqueue, link expiry + single-use enforcement, SMS-stub dispatch, and audit_outbox write

## Dev Notes

- Generation is async (jobs run in `apps/jobs`); the request endpoint enqueues and returns immediately.
- ZIP stored at a signed-URL S3-equivalent; download link is valid 7 days and single-use.
- ZIP must contain JSON for: parent, children, bookings, wallet ledger, receipts.
- Driven by Kenya's Data Protection Act; audit the export (DoD #4 / `audit_outbox`).
- Paths to touch: `apps/api/src/routes/`, `apps/jobs/src/registry.ts` (+ job impl), `packages/sms` (stub link), `packages/wallet` (ledger read), `apps/platform/app/`.
- Testing standards: vitest, `pnpm test` per workspace, TS strict, test-first. Cover each AC; no regression in `e2e/`.

### Project Structure Notes
- Registry story → anchors to `apps/api/src/routes/` and `apps/platform`, with the heavy lifting in `apps/jobs`.
- Depends on P1-E03 (wallet ledger) and P1-E09 (SMS stub).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E02-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E02].

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
