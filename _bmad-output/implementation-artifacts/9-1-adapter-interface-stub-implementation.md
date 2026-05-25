# Story 9.1: Adapter interface + stub implementation

Status: done

> Canonical ID: P1-E09-S01 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E09-S01.md

## Story

As a developer,
I want to write code as if SMS already works,
so that the stub captures everything for later and the provider switch is trivial.

## Acceptance Criteria

1. `packages/sms/index.ts` exports `send({to, template, data})` → returns a queued ID.
2. The stub implementation writes a row to `sms_outbox` with the rendered body and does not call any external API.
3. All product code uses this interface; the provider switch in P5-E03 is a one-line config flag.

## Tasks / Subtasks

- [x] Task 1: Define the sender interface (AC: #1)
  - [x] Add `send({to, template, data}): Promise<{ id }>` to `packages/sms/src/index.ts`
  - [x] Define `SmsSender` interface and payload/result types (`SmsPayload`, `SmsResult`); template registry in `templates.ts`
- [x] Task 2: Add `sms_outbox` table (AC: #2)
  - [x] Reused canonical `sms_outbox` (from 0004); additive migration `0034` adds `data` (jsonb) + `status`; `id` is the queued id
- [x] Task 3: Implement stub adapter (AC: #2)
  - [x] `StubSmsSender.send` renders the body via `renderTemplate(template, data)` and inserts an `sms_outbox` row, returning `{ id }`; never calls an external API
- [x] Task 4: Provider selection seam (AC: #3)
  - [x] `createSmsSender(db, { provider })` binds the active sender behind `SmsSender`; `provider: "live"` is reserved for the one-line P5-E03 swap
- [x] Task 5: Tests (AC: all)
  - [x] vitest, test-first: `send(...)` returns a queued id + writes a rendered `sms_outbox` row (body/template/data/status) with no external call; `createSmsSender` flag selects the implementation

## Dev Notes

- Provider-agnostic by design — at launch only the stub exists; all product code calls `send(...)`, never a provider directly.
- The stub is the capture mechanism: rendered bodies land in `sms_outbox` for inspection until a real provider is wired in P5-E03.
- Concrete paths to touch:
  - `packages/sms/src/index.ts` (interface + `send`) and `packages/sms/src/stub-sender.ts`.
  - `packages/db` — `sms_outbox` table + additive migration.
- Package import name is `@bm/sms`.
- Testing standards: vitest, test-first; `pnpm test` in `packages/sms` / `packages/db`. Migrations additive-only per DoD.

### Project Structure Notes
- Lives in `packages/sms` (sender) and `packages/db` (`sms_outbox`).
- Foundational — no dependencies. Template resolution integrates with Story 9.3 (`sms_templates`); reference template keys but keep this story functional with inline/registered templates.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E09-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E09].

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- `pnpm --filter @bm/sms test` — 8 passed.
- Full gate green: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`. The api suite showed 8 "Hook timed out in 10000ms" failures on the first parallel run (unrelated tests: services/children/reconciliation/etc.); a re-run of `@bm/api` passed all 318 — confirmed flaky under load, not a regression.

### Completion Notes List

- Consolidated the canonical SMS seam into `@bm/sms`: the `SmsSender` interface is now `send({ to, template, data }): Promise<{ id }>` (AC1). The `StubSmsSender` renders the body via a template registry (`packages/sms/src/templates.ts`) and records it to `sms_outbox`, returning the row id as the queued id; it never calls an external API (AC2).
- `createSmsSender(db, { provider })` is the provider-selection seam (AC3): default/`"stub"` returns `StubSmsSender`; `"live"` throws a P5-E03 placeholder so the live swap is a single-flag change.
- Migrated every product caller off the old `{ phone, body, template }` shape to the canonical `{ to, template, data }`: OTP reset (1-5), reception/receipt SMS + reprint (5-6/8-4), cash/bank/reception top-ups, admin refund, mpesa-reconcile failure SMS, and the data-export-ready notice. Rendered bodies are byte-identical to before, so existing `sms_outbox` read assertions still pass.
- `sms_outbox` reused as the canonical table; additive migration `0034_sms_outbox_template_data.sql` adds `data` (jsonb, default `{}`) and `status` (default `queued`) — no changes to existing rows. `ConsentAwareSmsSender` now returns the `SmsResult | null` instead of a boolean (null = dropped by consent gate).

### File List

- packages/sms/src/index.ts (modified)
- packages/sms/src/templates.ts (new)
- packages/sms/src/index.test.ts (modified)
- packages/db/src/schema/sms.ts (modified)
- packages/db/migrations/0034_sms_outbox_template_data.sql (new)
- apps/api/src/routes/auth/reset-request.ts (modified)
- apps/api/src/routes/reception/receipt.ts (modified)
- apps/api/src/routes/receipts/reprint.ts (modified)
- apps/api/src/routes/payments/bank/topup.ts (modified)
- apps/api/src/routes/payments/cash/topup.ts (modified)
- apps/api/src/routes/reception/topup.ts (modified)
- apps/api/src/routes/admin/refund.ts (modified)
- apps/jobs/src/jobs/mpesa-reconcile.ts (modified)
- packages/export/src/run.ts (modified)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | SMS adapter interface + stub implemented; canonical `send({to,template,data})`, template registry, `createSmsSender` seam, `sms_outbox` extended; all callers migrated | claude-opus-4-7 |
