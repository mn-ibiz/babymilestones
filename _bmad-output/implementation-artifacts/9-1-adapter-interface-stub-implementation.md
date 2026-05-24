# Story 9.1: Adapter interface + stub implementation

Status: ready-for-dev

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

- [ ] Task 1: Define the sender interface (AC: #1)
  - [ ] Add `send({to, template, data}): Promise<{ id }>` to `packages/sms/src/index.ts`
  - [ ] Define `SmsSender` interface and payload/result types (reuse `packages/contracts` Zod where useful)
- [ ] Task 2: Add `sms_outbox` table (AC: #2)
  - [ ] Add `sms_outbox` to `packages/db` (to, template key, rendered body, status, created_at, queued id) + additive migration
- [ ] Task 3: Implement stub adapter (AC: #2)
  - [ ] `StubSmsSender` renders the body (resolve template + data) and inserts an `sms_outbox` row, returning the queued id; never calls an external API
- [ ] Task 4: Provider selection seam (AC: #3)
  - [ ] Bind the active sender behind `send(...)` via a single config flag so P5-E03 can swap providers in one place
- [ ] Task 5: Tests (AC: all)
  - [ ] vitest, test-first: `send(...)` returns a queued id and writes a rendered `sms_outbox` row with no external call; provider flag selects the implementation

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
