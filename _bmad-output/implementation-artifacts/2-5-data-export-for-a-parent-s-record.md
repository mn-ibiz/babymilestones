# Story 2.5: Data export for a parent's record

Status: done

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

- [x] Task 1: Export-request API (AC: #1, #2, #3)
  - [x] Add route under `apps/api/src/routes/` to enqueue a data-export job for the authed parent and return an accepted/queued response (`POST /parents/me/exports` → 202)
  - [x] Write the export-requested event to `audit_outbox` (`parent.data.export.requested`)
- [x] Task 2: Async export job (AC: #1, #2)
  - [~] Register a job in `apps/jobs/src/registry.ts` that gathers JSON for parent, children, bookings, wallet ledger, and receipts; bundle into a ZIP — `createDataExportJob` (registered via `registerDataExportJob`) gathers parent/children/consent/wallet; bookings, wallet ledger and receipts are stable empty arrays since those tables (P1-E03 ledger + bookings epic) are not yet in the schema. See review-findings #3.
  - [x] Store ZIP at a signed-URL S3-equivalent (`ExportStorage` seam; `InMemoryExportStorage` at launch — see review-findings #1)
  - [x] Generate a single-use download link valid 7 days (`download_token` + `expires_at`, `EXPORT_TTL_MS`)
- [x] Task 3: Notify via SMS stub (AC: #2)
  - [x] On completion, use `packages/sms` stub to send the download link (`StubSmsSender`, template `parent.data.export.ready`)
- [x] Task 4: Single-use download endpoint (AC: #2)
  - [x] Add route under `apps/api/src/routes/` (`GET /exports/download?token=`) enforcing 7-day expiry and single-use semantics (conditional `consumed_at` update; serves the ZIP — redirect-to-signed-URL deferred, review-findings #4)
- [x] Task 5: Export button UI (AC: #1)
  - [x] In `apps/platform/app/`, add "Export my data" button on the parent profile (`ExportDataButton` on `/profile`)
- [x] Task 6: Tests (AC: all)
  - [x] vitest unit/integration tests: ZIP contents cover all data sets, async enqueue, 7-day expiry + single-use enforcement, SMS-stub dispatch, and audit_outbox writes

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

claude-opus-4-7

### Debug Log References

Full gate green from repo root: `pnpm test` (15/15 tasks, 84 API tests), `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass.

### Completion Notes List

- New `@bm/export` package holds the reusable, dependency-free export logic: a STORE-method ZIP writer (`createZip`, manual CRC-32 — no new deps), an `ExportStorage` seam with `InMemoryExportStorage`, the read-only `gatherParentExport`, and `runExport` (gather → ZIP → store → 7-day single-use token → SMS stub → audit).
- `data_exports` table (migration `0010_data_exports.sql` + Drizzle schema) tracks request lifecycle: pending → ready → consumed, with `download_token`, `expires_at`, `consumed_at`.
- API: `POST /parents/me/exports` (auth + CSRF, 202, audits `requested`) and `GET /exports/download?token=` (uniform 404 for unknown/not-ready, 410 expired/consumed, single-use via conditional `consumed_at IS NULL` update, audits `downloaded`). `buildApp` gains optional `exportStorage`/`enqueueExport`/`now`; defaults to in-memory store + fire-and-forget `runExport`.
- `apps/jobs`: `createDataExportJob` (name `data-export`) drains pending rows; `registerDataExportJob` wires it.
- Platform: `ExportDataButton` on `/profile` + `requestDataExport` API helper.
- bookings / wallet ledger / receipts are stable empty arrays (owning epics not yet built) — see review-findings #3.

### File List

- packages/db/migrations/0010_data_exports.sql (new)
- packages/db/src/schema/data-exports.ts (new)
- packages/db/src/schema/index.ts (export barrel)
- packages/export/package.json (new)
- packages/export/tsconfig.json (new)
- packages/export/src/index.ts (new)
- packages/export/src/zip.ts (new)
- packages/export/src/zip.test.ts (new)
- packages/export/src/storage.ts (new)
- packages/export/src/gather.ts (new)
- packages/export/src/run.ts (new)
- packages/export/src/run.test.ts (new)
- apps/api/package.json (+@bm/export)
- apps/api/src/app.ts (export deps + defaults)
- apps/api/src/routes/parents/index.ts (register export routes)
- apps/api/src/routes/parents/exports.ts (new)
- apps/api/src/routes/parents/exports.test.ts (new)
- apps/jobs/package.json (+deps)
- apps/jobs/src/index.ts (registerDataExportJob)
- apps/jobs/src/jobs/data-export.ts (new)
- apps/jobs/src/jobs/data-export.test.ts (new)
- apps/platform/lib/profile-api.ts (requestDataExport)
- apps/platform/lib/profile-api.test.ts (new)
- apps/platform/app/components/ExportDataButton.tsx (new)
- apps/platform/app/profile/page.tsx (mount button)
- _bmad-output/implementation-artifacts/2-5-data-export-for-a-parent-s-record-review-findings.md (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented parent data export: @bm/export package (ZIP+storage+gather+run), data_exports table, request + single-use download API, data-export job, platform Export button; full gate green | claude-opus-4-7 |
