# Story 2.4: Photo and SMS consent flags

Status: ready-for-dev

> Canonical ID: P1-E02-S04 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E02-S04.md

## Story

As a parent,
I want to control whether my child is photographed or my number is messaged for marketing,
so that my consent preferences are respected.

## Acceptance Criteria

1. Per-child: `photo_consent BOOLEAN`, defaults false; per-parent: `sms_marketing_opt_in BOOLEAN`, defaults false.
2. Editing consent is logged with timestamp.
3. SMS dispatcher (X4) reads `sms_marketing_opt_in` before sending non-transactional messages.

## Tasks / Subtasks

- [ ] Task 1: Add consent columns (AC: #1)
  - [ ] In `packages/db`, add `photo_consent BOOLEAN NOT NULL DEFAULT false` to `children` and `sms_marketing_opt_in BOOLEAN NOT NULL DEFAULT false` to `parents`
  - [ ] Add additive-only Drizzle migration
- [ ] Task 2: Consent update API (AC: #1, #2)
  - [ ] Extend parent/child routes under `apps/api/src/routes/` to toggle each consent flag
  - [ ] Update `packages/contracts` Zod schemas to include the consent fields
  - [ ] Log each consent change with timestamp to `audit_outbox`
- [ ] Task 3: Marketing-gate in SMS sender (AC: #3)
  - [ ] In `packages/sms`, ensure non-transactional (marketing) sends check `sms_marketing_opt_in`; transactional messages (booking confirms, OTP) always send regardless of opt-in
- [ ] Task 4: Consent UI (AC: #1, #2)
  - [ ] In `apps/platform/app/`, surface per-child photo-consent toggle and per-parent SMS marketing opt-in
- [ ] Task 5: Tests (AC: all)
  - [ ] Write vitest unit/integration tests (test-first): defaults false, timestamped audit on edit, and that marketing sends are gated by opt-in while transactional sends are not

## Dev Notes

- Transactional SMS (booking confirms, OTP) is always sent regardless of opt-in; only non-transactional/marketing is gated.
- Consent edits must be logged with a timestamp (DoD #4 / `audit_outbox`).
- Marketing gate lives in `packages/sms` (provider-agnostic sender; stub adapter at launch) and is consumed by the X4 dispatcher.
- Paths to touch: `packages/db` (column adds + additive migration), `apps/api/src/routes/`, `packages/contracts`, `packages/sms`, `apps/platform/app/`.
- Testing standards: vitest, `pnpm test` per workspace, TS strict, test-first. Cover each AC; no regression in `e2e/`.

### Project Structure Notes
- Registry story → anchors to `packages/db`, `apps/api/src/routes/`, `apps/platform` (plus `packages/sms` for the dispatch gate).
- Depends on P1-E02-S01 (parents) and P1-E02-S03 (children).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E02-S04.md]
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
