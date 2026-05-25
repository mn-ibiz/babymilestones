# Story 9.2: Admin config table for sender ID + URL + key

Status: done

> Canonical ID: P1-E09-S02 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E09-S02.md

## Story

As an admin,
I want to store the SMS provider config once a sender ID is registered,
so that the provider can be activated without code changes and without exposing secrets.

## Acceptance Criteria

1. `sms_config` table: sender_id, api_url, api_key_ref (env var name, not the literal key), is_active.
2. Admin CRUD; the secret value is never returned in API responses.
3. Validation: `api_url` must be HTTPS and must not point to RFC1918 / localhost / cloud metadata IPs.
4. Only one row may have `is_active = true`.

## Tasks / Subtasks

- [x] Task 1: Add `sms_config` table (AC: #1)
  - [x] Add to `packages/db`: sender_id, api_url, api_key_ref (env var name only), is_active + additive migration (0035)
- [x] Task 2: Enforce single active row (AC: #4)
  - [x] Partial unique index `sms_config_single_active_idx` on `((true)) WHERE is_active = true`; application deactivates the prior active row in the same transaction
- [x] Task 3: SSRF-safe URL validation (AC: #3)
  - [x] `checkProviderUrlSafety` rejects non-HTTPS, localhost/loopback, RFC1918, link-local incl. 169.254.169.254 metadata, CGNAT, unique-local IPv6, and IPv4-mapped IPv6 of any of those
  - [x] Placed the validator in `packages/sms` (`url-safety.ts`); a light HTTPS shape check also lives in the `@bm/contracts` Zod schema
- [x] Task 4: Admin CRUD API with secret hygiene (AC: #1, #2)
  - [x] Admin-only Fastify routes `apps/api/src/routes/admin/sms-config.ts` (guarded by `manage config` via `@bm/auth`)
  - [x] Stores only `api_key_ref`; responses + audit payloads never include a secret value
- [x] Task 5: Admin config UI (AC: #1, #2, #4)
  - [x] `apps/admin/app/sms-config/page.tsx` + tested `lib/sms-config-form.ts`: manage rows, toggle active, never display a secret value
  - [x] Mutations audited to `audit_outbox`
- [x] Task 6: Tests (AC: all)
  - [x] vitest, test-first: single-active enforced; URL validation rejects RFC1918/localhost/metadata/non-HTTPS; responses + audit never include the secret; CRUD audited; `manage config` permission enforced

## Dev Notes

- SSRF allowlist is a confirmed security requirement (Winston's review) — block private, loopback, link-local, and metadata addresses; require HTTPS.
- Secrets are referenced by env var name (`api_key_ref`), never stored or echoed literally.
- Concrete paths to touch:
  - `packages/db` — `sms_config` table + partial unique index + additive migration.
  - `apps/api/src/routes/` — admin-only CRUD routes.
  - `apps/admin` — SMS config UI.
  - `packages/contracts` or `packages/sms` — URL/SSRF validator.
- Testing standards: vitest, test-first; migrations additive-only; audited actions write to `audit_outbox` per DoD.

### Project Structure Notes
- Spans `packages/db`, `apps/api`, `apps/admin`, and shared validation in `packages/contracts`/`packages/sms`.
- Depends on P1-E10 (admin/RBAC console + role guards).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E09-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E09].

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Full gate green: `pnpm test` (all packages), `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- API suite (326 tests) flaked twice under parallel PGlite load with "Hook timed out in 10000ms" on pre-existing beforeEach hooks; passed cleanly on isolated re-run (`pnpm --filter @bm/api test`) and on a second full `pnpm test`.

### Completion Notes List

- New `config` RBAC resource + `admin manage config` grant; mirrored in migration 0035, `packages/db` permissions drift test, `@bm/auth` matrix + regenerated snapshot.
- Secret hygiene is structural: the table has no key column at all — only `api_key_ref` (env-var NAME). Reads go through `toPublicSmsConfig`; audit payloads log the ref + URL only.
- SSRF validator (`@bm/sms` `checkProviderUrlSafety`) handles IPv4-mapped IPv6 (Node compresses `::ffff:169.254.169.254` to hex hextets) and is applied on both POST and PATCH.
- Single-active invariant enforced at two layers: partial unique index (DB) + transactional deactivate-others (application) so activating never trips the index.

### File List

- packages/db/src/schema/sms-config.ts (new)
- packages/db/src/schema/index.ts (barrel export)
- packages/db/migrations/0035_sms_config.sql (new)
- packages/db/src/permissions.test.ts (drift mirror updated)
- packages/auth/src/rbac.ts (config resource + admin manage config)
- packages/auth/src/__snapshots__/rbac.test.ts.snap (regenerated)
- packages/sms/src/url-safety.ts (new) + url-safety.test.ts (new)
- packages/sms/src/config.ts (new) + config.test.ts (new)
- packages/sms/src/index.ts (exports)
- packages/contracts/src/index.ts (sms config schemas + SmsConfigPublic)
- apps/api/src/routes/admin/sms-config.ts (new) + sms-config.test.ts (new)
- apps/api/src/routes/admin/index.ts (wire route)
- apps/admin/lib/sms-config-form.ts (new) + sms-config-form.test.ts (new)
- apps/admin/app/sms-config/page.tsx (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented sms_config table + single-active index, SSRF/HTTPS URL validator, admin CRUD API with secret hygiene, admin UI, `manage config` RBAC; test-first | claude-opus-4-7 |
