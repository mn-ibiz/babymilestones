# Story 9.3: Templates registered + versioned

Status: done

> Canonical ID: P1-E09-S03 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E09-S03.md

## Story

As an admin,
I want to see (and later edit) every SMS template in one place,
so that messaging is centralized, versioned, and never hard-coded.

## Acceptance Criteria

1. `sms_templates` table: key (e.g. `topup.success`), body (with `{placeholders}`), language (`en`), version, is_active.
2. Code references templates by key, never by inline string.
3. Admin view (read-only in P1; editable in P2).

## Tasks / Subtasks

- [x] Task 1: Add `sms_templates` table (AC: #1)
  - [x] Add to `packages/db`: key, body (with `{placeholders}`), language (`en`), version, is_active + additive migration (0036)
  - [x] Unique active template per (key, language); support multiple versions with one active (partial unique index)
- [x] Task 2: Key-based template lookup (AC: #2)
  - [x] Add a resolver in `packages/sms` (`template-store.ts`) that fetches the active template by key + interpolates `{placeholders}` from `data`
  - [x] Wire `send(...)` (Story 9.1) to resolve registered templates by key (DB-first, in-code passthrough fallback for `raw`/receipts)
- [x] Task 3: Seed initial templates (AC: #1, #2)
  - [x] Seed the launch template set (`topup.success`, `auth.reset.code`, `wallet.*`, `payment.mpesa.failed`, `parent.data.export.ready`) as registered, versioned rows in migration 0036
- [x] Task 4: Admin read-only view (AC: #3)
  - [x] Add a read-only SMS templates list in `apps/admin` (`/sms-templates`) + read-only API (`/admin/sms-templates`, `/admin/sms-templates/:key/versions`); editing deferred to P2
- [x] Task 5: Tests (AC: all)
  - [x] vitest, test-first: resolver returns the active template by key and renders placeholders; missing/inactive/unknown key fails clearly; send uses the registered template; versioning (one active, history retained); admin view lists templates read-only

## Dev Notes

- Templates are versioned and addressed by key — this is what lets `send({template})` stay provider- and copy-agnostic.
- Read-only in P1; the schema (version, is_active) is built now so P2 can add editing without migration.
- Concrete paths to touch:
  - `packages/db` — `sms_templates` table + additive migration + seed.
  - `packages/sms` — template resolver used by `send(...)`.
  - `apps/admin` — read-only templates view.
- Testing standards: vitest, test-first; migrations additive-only per DoD.

### Project Structure Notes
- Spans `packages/db`, `packages/sms`, and `apps/admin`.
- Depends on Story 9.1 (sender `send(...)` consumes the resolved template).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E09-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E09].

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Full gate green: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`.
- One flake in unrelated `parents-search.test.ts` (hook timeout); passed on re-run.

### Completion Notes List

- `sms_templates` table added (migration 0036, additive): key, language, version,
  body with `{placeholder}` tokens, is_active. Partial unique index enforces one
  active template per (key, language); a (key, language, version) is unique so
  version history is well-formed.
- `@bm/sms` `template-store.ts`: `resolveTemplate` / `getActiveTemplate` /
  `interpolateTemplate` / `listActiveTemplates` / `listTemplateVersions`.
  `interpolateTemplate` uses `String.replace` (no `RegExp.exec`) and throws on a
  missing or non-scalar placeholder.
- `send(...)` now resolves the registered DB template by key (DB-first), falling
  back to the in-code renderer only for passthrough keys (`raw`, receipts) not
  modelled as placeholder rows. Launch copy is fully DB-driven (AC2).
- Versioning: a copy change ships as a new row + active flip; prior versions
  retained. Unknown / inactive key throws clearly.
- Admin: read-only `/sms-templates` page + `/admin/sms-templates` (+ `/:key/versions`)
  API, gated on `manage config` (admin / super_admin). Editing deferred to P2.
- Low-severity follow-ups recorded in
  `9-3-templates-registered-versioned-review-findings.md`.

### File List

- packages/db/migrations/0036_sms_templates.sql (new)
- packages/db/src/schema/sms-templates.ts (new)
- packages/db/src/schema/index.ts (export)
- packages/sms/src/template-store.ts (new)
- packages/sms/src/template-store.test.ts (new)
- packages/sms/src/index.ts (send resolves registered templates)
- packages/sms/src/index.test.ts (send-uses-template tests)
- packages/contracts/src/index.ts (SmsTemplatePublic)
- apps/api/src/routes/admin/sms-templates.ts (new)
- apps/api/src/routes/admin/sms-templates.test.ts (new)
- apps/api/src/routes/admin/index.ts (register route)
- apps/admin/lib/sms-templates-view.ts (new)
- apps/admin/lib/sms-templates-view.test.ts (new)
- apps/admin/app/sms-templates/page.tsx (new)
- _bmad-output/implementation-artifacts/9-3-templates-registered-versioned-review-findings.md (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented sms_templates table + versioned resolver, send() resolves by key, admin read-only view | claude-opus-4-7 |
