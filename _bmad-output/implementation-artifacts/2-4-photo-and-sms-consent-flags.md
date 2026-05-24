# Story 2.4: Photo and SMS consent flags

Status: done

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

- [x] Task 1: Add consent columns (AC: #1)
  - [x] In `packages/db`, add `photo_consent BOOLEAN NOT NULL DEFAULT false` to `children` and `sms_marketing_opt_in BOOLEAN NOT NULL DEFAULT false` to `parents`
  - [x] Add additive-only Drizzle migration (`0009_consent_flags.sql`, `ADD COLUMN IF NOT EXISTS`)
- [x] Task 2: Consent update API (AC: #1, #2)
  - [x] Added `PUT /parents/me/consent/sms` and `PUT /parents/me/children/:id/consent/photo` (session-scoped, CSRF-guarded, ownership-scoped)
  - [x] Update `packages/contracts` Zod schemas (`smsConsentSchema`, `photoConsentSchema`) + `Child.photoConsent` / `ParentProfile.smsMarketingOptIn`
  - [x] Log each consent change with timestamp to `audit_outbox` (`parent.consent.sms` / `child.consent.photo`; row `created_at` + payload `at`)
- [x] Task 3: Marketing-gate in SMS sender (AC: #3)
  - [x] `packages/sms`: `isMarketingOptedIn(db, parentId)` + `ConsentAwareSmsSender` — `sendMarketing` gated by opt-in (fail-closed), `sendTransactional` always sends
- [x] Task 4: Consent UI (AC: #1, #2)
  - [x] `apps/platform`: per-child photo-consent checkbox on the children page; per-parent SMS marketing opt-in on the profile page (standalone toggle so it never bundles into the profile upsert)
- [x] Task 5: Tests (AC: all)
  - [x] vitest integration tests: defaults false, timestamped audit on edit, ownership/auth/CSRF, and marketing gated by opt-in while transactional is not

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

claude-opus-4-7

### Debug Log References

- Full gate green: `pnpm test` (76 api tests + sms/contracts/platform suites), `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- Typecheck fixes: existing `ParentProfile`/`Child` literals in `contracts`/`platform` test fixtures needed the new required fields (`smsMarketingOptIn`, `photoConsent`).

### Completion Notes List

- Consent columns are additive (`0009_consent_flags.sql`, `ADD COLUMN IF NOT EXISTS`), both default `false` (explicit opt-in — no record silently consented).
- Consent toggles live on dedicated endpoints, not the profile/child upsert, so a consent change never rewrites other fields. Profile/child PUT statements deliberately omit the consent columns, preserving their stored value.
- AC2 timestamping: every consent change writes an `audit_outbox` row (its own `created_at`) plus an explicit `at` ISO string + the new value in the payload.
- AC3 gate: `ConsentAwareSmsSender.sendMarketing` checks `sms_marketing_opt_in` (fail-closed for unknown parent); `sendTransactional` always sends. Consumed by the future X4 dispatcher.

### File List

- packages/db/src/schema/parents.ts (+ `smsMarketingOptIn`)
- packages/db/src/schema/children.ts (+ `photoConsent`)
- packages/db/migrations/0009_consent_flags.sql (new)
- packages/contracts/src/index.ts (`smsConsentSchema`, `photoConsentSchema`, interface fields)
- packages/contracts/src/index.test.ts (fixture field)
- packages/sms/src/index.ts (`isMarketingOptedIn`, `ConsentAwareSmsSender`)
- packages/sms/src/index.test.ts (gate tests)
- apps/api/src/routes/parents/profile.ts (`PUT /parents/me/consent/sms`)
- apps/api/src/routes/parents/profile.test.ts (consent tests)
- apps/api/src/routes/parents/children.ts (`PUT /parents/me/children/:id/consent/photo`)
- apps/api/src/routes/parents/children.test.ts (consent tests)
- apps/platform/lib/profile-api.ts (`setSmsConsent`)
- apps/platform/lib/profile.test.ts (fixture field)
- apps/platform/lib/children-api.ts (`setPhotoConsent`)
- apps/platform/lib/children.test.ts (fixture field)
- apps/platform/app/profile/page.tsx (SMS opt-in toggle)
- apps/platform/app/children/page.tsx (per-child photo-consent toggle)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented photo + SMS consent flags (schema, API, SMS gate, UI, tests) | claude-opus-4-7 |
