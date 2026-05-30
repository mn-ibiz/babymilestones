# Story 33.1: Live SMS adapter (provider-agnostic)

Status: done

> Canonical ID: P5-E03-S01 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E03-S01.md

## Story

As the system, I want to actually send SMS instead of logging stubs.

## Acceptance Criteria

1. New implementation `LiveSmsAdapter` reads provider config from `sms_config`.
2. Posts to the configured URL with auth as per provider.
3. Records send result + provider message ID in `sms_outbox`.
4. SSRF guard (P1-E09-S02) re-validated.
5. Decision refs: 19.

## Tasks / Subtasks

- [x] Task 1: Implement Live SMS adapter (provider-agnostic) (AC: #1, #2, #3, #4, #5)
  - [x] Satisfy AC#1: New implementation `LiveSmsAdapter` reads provider config from `sms_config` (active row).
  - [x] Satisfy AC#2: Posts to the configured URL with bearer auth from the resolved API key (provider-agnostic JSON `{to,from,message}`).
  - [x] Satisfy AC#3: Records send result + provider message ID + cost in `sms_outbox` (status sent/failed, never silently dropped).
  - [x] Satisfy AC#4: SSRF guard (`checkProviderUrlSafety`) re-validated at send time; no transport call when rejected.
  - [x] Satisfy AC#5: Decision refs: 19 — provider-agnostic transport injection (mirrors M-Pesa/Paystack adapters).
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`packages/sms/src/live.test.ts`, 8 tests, real PGlite + injected fake transport); covers each AC

## Dev Notes

Provider-agnostic shape — works with Africa's Talking, Twilio, or others per Decision 19.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-E09.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E03-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E03.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context)

### Debug Log References

- `pnpm -C packages/sms exec vitest run` → 81 passed (73 baseline + 8 new)
- `pnpm -C packages/sms exec tsc --noEmit` → clean
- `pnpm -C packages/db exec tsc --noEmit` → clean

### Completion Notes List

- `LiveSmsAdapter` implements the EXISTING `SmsSender` interface exactly — drop-in for the stub via `createSmsSender({ provider: "live", live: { transport, apiKey } })`. No call sites changed.
- Transport is injected (`SmsTransport`, mirrors payments `PaymentTransport`): tests pass a fake; production passes `globalThis.fetch`. Adapter never reaches the network from a default.
- API key is the resolved literal (from the env var named by `sms_config.api_key_ref`), passed by the caller — never read from the row, never logged.
- SSRF guard re-validated at send time (AC4): a private/loopback URL throws before any transport call.
- Outbox row is written queued first, then updated to `sent` (with provider message id + cost) or `failed` (with error text) — a provider error is recorded, never silently dropped (AC3).
- Migration 0074 adds additive columns to `sms_outbox` (`provider`, `provider_message_id`, `cost_cents`, `error`, `dispatched_at`, `deferred_until`) + supporting indexes; mirrored in the drizzle schema.

### File List

- packages/db/migrations/0074_sms_outbox_dispatch.sql (new)
- packages/db/src/schema/sms.ts (modified — outbox dispatch columns)
- packages/sms/src/live.ts (new — LiveSmsAdapter + SmsTransport)
- packages/sms/src/live.test.ts (new — 8 tests)
- packages/sms/src/index.ts (modified — export LiveSmsAdapter; wire `createSmsSender` live branch)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Live SMS adapter implemented (provider-agnostic, injected transport, SSRF re-validated, outbox dispatch columns) | Claude Opus 4.8 |
