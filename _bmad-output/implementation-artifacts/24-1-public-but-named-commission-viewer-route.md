# Story 24.1: Public-but-named commission viewer route

Status: backlog

> Canonical ID: P3-E02-S01 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E02-S01.md

## Story

As stylist,
I want to see this month's earnings from the reception PC without logging in,
so that the capability described above is delivered.

## Acceptance Criteria

1. Route `admin.babymilestones.co.ke/staff-earnings` accessible without login.
2. Dropdown of active stylists (display names only).
3. Pick name → confirm display: month-to-date earnings, last month's earnings, last payout amount + date.
4. No PII beyond display name; no parent or booking details.
5. Rate limit on the endpoint (anti-scrape).
6. Decision refs: 14.

## Tasks / Subtasks

- [ ] Task 1: Implement Public-but-named commission viewer route (AC: #1, #2, #3, #4, #5, #6)
  - [ ] Satisfy AC#1: Route `admin.babymilestones.co.ke/staff-earnings` accessible without login.
  - [ ] Satisfy AC#2: Dropdown of active stylists (display names only).
  - [ ] Satisfy AC#3: Pick name → confirm display: month-to-date earnings, last month's earnings, last payout amount + date.
  - [ ] Satisfy AC#4: No PII beyond display name; no parent or booking details.
  - [ ] Satisfy AC#5: Rate limit on the endpoint (anti-scrape).
  - [ ] Satisfy AC#6: Decision refs: 14.
  - [ ] Touch / create: `apps/admin/app/staff-earnings/page.tsx`
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Caching: 60s. `apps/admin/app/staff-earnings/page.tsx`.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P3-E01.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E02-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E02.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
