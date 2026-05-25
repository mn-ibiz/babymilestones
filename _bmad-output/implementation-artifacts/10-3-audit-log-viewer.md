# Story 10.3: Audit log viewer

Status: done

> Canonical ID: P1-E10-S03 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E10-S03.md

## Story

As an admin,
I want to search the audit log to investigate disputes,
so that I can trace who did what, when, and to which record.

## Acceptance Criteria

1. Searchable by actor (user), action, target ID, date range.
2. Pagination; CSV export.
3. Audit log itself is read-only — no edits, no deletes.

## Tasks / Subtasks

- [x] Task 1: Audit query API in `apps/api` (AC: #1, #2, #3)
  - [x] Add read-only route `apps/api/src/routes/admin/audit.ts` (registered via `apps/api/src/routes/admin/index.ts`)
  - [~] Query the `audit_log` projection table filtered by actor, action, target ID, date range — reads `audit_outbox` for now: X5-S02/13-2 (the async `audit_log` projection) is NOT landed yet, so the durable outbox is the source. Same column shape; a one-line `SOURCE` swap migrates it when 13-2 ships (noted in the route doc-comment).
  - [x] Paginated list endpoint + CSV export endpoint (serialize rows)
  - [x] Expose **no** create/update/delete endpoints — read-only by construction; guard with `@bm/auth` (`read audit` → admin/super_admin)
- [x] Task 2: Audit viewer UI in `apps/admin` (AC: #1, #2)
  - [x] Page `apps/admin/app/(console)/audit/page.tsx` with filter controls (actor, action, target ID, date range)
  - [x] Paginated results table; "Export CSV" download link; nav item gated on `read audit`
- [x] Task 3: Tests (AC: all)
  - [x] vitest, test-first: each filter narrows results; pagination boundaries; CSV export contents + headers; permission (403/401); explicit assertion that no write/delete route exists (POST/PUT/PATCH/DELETE → 404, rows untouched). E2E deferred — no Playwright harness in `e2e/` for admin yet; integration via `app.inject` covers all ACs.

## Dev Notes

- Reads from the `audit_log` projection table populated by X5 (per source Technical Notes — "Read from the projection table populated by X5"). This story is strictly read-only: no migrations that write to or mutate `audit_log`.
- API lives in `apps/api` (`apps/api/src/routes/admin/audit.ts`); UI in `apps/admin` (`apps/admin/app/(console)/audit/`). Filters defined in `@bm/contracts`.
- Read-only enforcement (AC3): expose only GET/list/export; no edit or delete routes for audit data.
- Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only (DoD #3).

### Project Structure Notes
- `apps/api/src/routes/admin/audit.ts`, `apps/admin/app/(console)/audit/`. Table `audit_log` is owned/populated by X5 — consume only.
- Depends on X5 (audit projection) per source Dependencies.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E10-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E10.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- `pnpm --filter @bm/contracts test` → 77 passed
- `pnpm --filter @bm/api test src/routes/admin/audit.test.ts` → 11 passed
- `pnpm --filter @bm/admin test` → 155 passed
- Full gate from repo root: `pnpm test` (360 api tests + all packages), `pnpm typecheck`, `pnpm lint`, `pnpm build` — all green.

### Completion Notes List

- Read-only audit viewer. API: `GET /admin/audit` (paginated/filterable list returning `{events,total}`) + `GET /admin/audit/export` (filtered CSV). No mutation route is registered against the audit log — verified by a test asserting POST/PUT/PATCH/DELETE on `/admin/audit[/...]` return 404 and the row count is unchanged (AC3).
- Source table: reads `audit_outbox` (X5-S01) because the `audit_log` projection (X5-S02 / 13-2) is not yet landed. The route doc-comment marks the single `SOURCE` swap needed when 13-2 ships; column shape is identical, so the viewer needs no other change.
- Filters (AC1): actor (uuid), action (exact), targetId (exact), date range (inclusive whole-day UTC via `gte` + next-day `lt`). Pagination (AC2) via `limit` (default 50, max 200) / `offset`. Validation lives in `@bm/contracts` (`auditLogQuerySchema`); CSV via `auditLogEventsToCsv` (RFC-4180, CRLF).
- Permission: `requirePermission("read","audit")` → admin + super_admin only (reception 403, anon 401). Admin nav gains an `/audit` item gated on `read audit`; accountant/treasury do not see it.
- Payload is never serialized to the viewer — only id/actor/action/target/time are exposed.
- One low-severity follow-up logged in `10-3-audit-log-viewer-review-findings.md` (no DB index on the outbox filter columns — additive perf optimisation, out of scope for a read-only story).

### File List

- `packages/contracts/src/index.ts` (added audit query schema, event type, CSV serializer, column/limit consts)
- `packages/contracts/src/index.test.ts` (audit contract tests)
- `apps/api/src/routes/admin/audit.ts` (new — read-only list + CSV export)
- `apps/api/src/routes/admin/audit.test.ts` (new — integration tests)
- `apps/api/src/routes/admin/index.ts` (register the audit route)
- `apps/admin/lib/audit-filters.ts` (new — pure query/pagination helpers)
- `apps/admin/lib/audit-filters.test.ts` (new)
- `apps/admin/lib/nav.ts` (added the `/audit` nav item)
- `apps/admin/lib/nav.test.ts` (audit nav-visibility assertions)
- `apps/admin/app/(console)/audit/page.tsx` (new — viewer UI)
- `_bmad-output/implementation-artifacts/10-3-audit-log-viewer-review-findings.md` (new — deferred finding)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented read-only audit log viewer (API list+CSV export, admin UI, contracts, tests); reads `audit_outbox` pending 13-2 | claude-opus-4-7 |
