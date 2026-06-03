# Decisions Needed — collected during the code review sweep

These are real findings where the correct fix requires a human/product decision (ambiguous intent).
They are NOT auto-fixed. Review and tell me how to resolve each.

## Epic 1 — Identity & SSO

1. **[HIGH · P1-E01-S05] Brute-force protection on `POST /auth/reset/verify`.**
   No attempt limiter on the OTP-verify endpoint; 6-digit code brute-forceable over the 10-min TTL →
   account takeover. (Not live yet — route unmounted in prod.) **Choose:** per-phone+IP limiter
   mirroring `login.ts`, or per-code `attempts` counter on `otp_codes`; and the threshold (e.g. 5).
   File: `apps/api/src/routes/auth/reset-verify.ts:21-49`.

2. **[MED · P1-E01-S05] Reset-token HMAC secret prod fallback.** Falls back to a per-process random
   value when `RESET_TOKEN_SECRET` is unset → tokens break across instances/restarts, masks misconfig.
   **Choose:** fail-fast at boot in prod (gate random fallback on `NODE_ENV !== 'production'`) and/or
   land Redis-backed secret + consumed-token store before multi-instance deploy. File: `apps/api/src/app.ts:284-288`.

3. **[MED · P1-E01-S06] RBAC drift gate doesn't couple code matrix ↔ DB seed.** Code-only matrix
   change + regenerated snapshot passes CI while DB goes stale. **Choose:** (A) derive db test
   expected rows from seed SQL + add a both-packages cross-check test, or (B) hoist canonical matrix
   into a shared package and generate the seed SQL from it. Files: `packages/auth/src/rbac.test.ts`,
   `packages/db/src/permissions.test.ts`.

## Epic 2 — Parent & Child Registry

4. **[HIGH · P1-E02-S02] Walk-in duplicate-resolution affordances are non-functional (AC2).**
   The create POST 404 is now fixed, but: "Open existing" navigates to `/reception/parents/:id`
   which does not exist anywhere in `apps/admin`, and the "Merge intent" checkbox sets state that is
   never sent, persisted, or audited. **Choose:** (a) the correct destination for "Open existing"
   (a dedicated parent-detail route, or the inline reception parent view), and (b) how "Merge intent"
   should be recorded (e.g. POST a merge-intent flag + audit event with the existing userId + staff
   actor) — or drop the checkbox until a merge workflow exists. File:
   `apps/admin/app/reception/walk-in/page.tsx:116-122`.
