# Story 18.3: Pickup handoff with free-text observations

Status: done

> Canonical ID: P2-E03-S03 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E03-S03.md

## Story

As the attendant, I want to record what happened today in 9 seconds and SMS the parent.

## Acceptance Criteria

1. Child card → "Hand over" → screen with: mood picker (5 emojis, default 😊), activity chips (configurable list), single optional free-text line.
2. Confirm → records `attendance.checked_out_at`, observation row, sends SMS-stub summary to parent.
3. Voice-to-text button available on tablet.
4. Receipt automatically generated for the visit.

## Tasks / Subtasks

- [x] Task 1: Implement Pickup handoff with free-text observations (AC: #1, #2, #3, #4)
  - [x] Satisfy AC#1: Child card → "Hand over" → screen with: mood picker (5 emojis, default 😊), activity chips (configurable list), single optional free-text line.
  - [x] Satisfy AC#2: Confirm → records `attendance.checked_out_at`, observation row, sends SMS-stub summary to parent.
  - [x] Satisfy AC#3: Voice-to-text button available on tablet.
  - [x] Satisfy AC#4: Receipt automatically generated for the visit.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

### Review Follow-ups (AI)

- [x] [AI-Review][High] Concurrent double hand-off now returns 409 (not 500): wrapped the tx and map the observations UNIQUE(booking_id) violation to a clean conflict. Deterministic race-fence test added.
- [x] [AI-Review][Med] Receipt line tax now derives from the service's VAT treatment (`inclusiveVatCents`) instead of a hardcoded 0; vat_inclusive test added.
- [x] [AI-Review][Med] Documented the zero-total subscription-visit receipt (intentional — documents the entitlement-covered visit).
- [x] [AI-Review][Low] Settings-backed activity chips clamped to the schema caps (no offer/accept asymmetry); activities-cap 400 test added.
- [x] [AI-Review][Low] Attendant fallback label is now generic "Attendant" rather than the staff phone (no PII leak to the parent feed).

### Code Review (2026-05-29 · 10-agent parallel review + full suite)

- [x] [Review][Patch] Narrowed the hand-off conflict matcher to the `observations_booking_id_uniq` fence, so a concurrent receipt sequence-number collision (a *different* 23505 on the shared `BM-<year>` series) surfaces as a retryable 500 instead of a misleading "Child has already been handed over" 409. [handoff.ts]
- [x] [Review][Verify] AC1–AC4 (mood/activities/note, atomic checkout+observation+receipt+SMS, voice-to-text, VAT-aware receipt) re-confirmed; the double-handoff race fence re-tested.

## Dev Notes

Compound: `PickupHandoffScreen`. Designed for ≤9 seconds typical hand-off.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S02 - P1-E08 - P1-E09
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E03-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E03.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story workflow)

### Debug Log References

- `pnpm vitest run src/routes/reception/handoff.test.ts` (apps/api) — 9/9 green.
- `pnpm turbo run test` — full regression 17/17 packages green (API 504).

### Completion Notes List

- New `observations` table (migration `0054`) — one row per hand-off, UNIQUE(booking_id); denormalised child_id/parent_id + note for the S05 anonymisation job; attendant_name_snapshot for the S04 feed.
- AC1: `GET /reception/attendance/observation-options` returns the fixed 5-emoji mood set (default 😊) + a configurable activity-chip list (settings key `observation_activities`, clamped to schema caps, default list otherwise). `handoffSchema` validates mood enum + activity/note caps.
- AC2: `POST /reception/attendance/handoff` records `attendance.checked_out_at`, inserts the observation, and SMS-stubs a one-line summary (`pickup.handoff`) to the parent (best-effort).
- AC3: voice-to-text button on the admin hand-off screen via the Web Speech API; pure support-detection helper unit-tested.
- AC4: a visit receipt is auto-generated through the `@bm/payments` writer seam inside the same transaction; line tax derives from the service VAT treatment.
- Checkout + observation + receipt + audit commit atomically; concurrent double hand-off is fenced to 409.
- ✅ Resolved review [High] 409-on-race, [Med×2] VAT-aware receipt + zero-total subscription receipt documented, [Low×2] settings clamp + attendant label.

### File List

- packages/db/migrations/0054_observations.sql (new)
- packages/db/src/schema/observations.ts (new)
- packages/db/src/schema/index.ts (modified — barrel export)
- packages/sms/src/templates.ts (modified — pickup.handoff template)
- packages/contracts/src/index.ts (modified — handoff schema/types, OBSERVATION_* consts, handoffSummary, inclusiveVatCents)
- apps/api/src/routes/reception/handoff.ts (new)
- apps/api/src/routes/reception/handoff.test.ts (new)
- apps/api/src/routes/reception/index.ts (modified — wired route)
- apps/admin/lib/handoff.ts (new)
- apps/admin/lib/handoff.test.ts (new)
- apps/admin/app/reception/handoff/page.tsx (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-29 | 1.0 | Implemented pickup hand-off (observations table, options + handoff endpoint, receipt + SMS, voice-to-text UI), TDD; code review + 5 fixes resolved; status → review | bmad-dev-story |
