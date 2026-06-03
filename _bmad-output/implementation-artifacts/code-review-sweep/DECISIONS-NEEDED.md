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

## Epic 4 — Payments Adapter

10. **[HIGH · money · P1-E04-S05] No Paystack reconcile cron / recovery path.** Event-row insert and
    wallet credit are non-atomic; a crash between them, or an orphan `charge.success` (reference row
    not yet present), leaves a paid top-up permanently uncredited (re-delivery short-circuits on the
    event row). M-Pesa has a reconcile cron; Paystack doesn't. **Recommend:** add a Paystack reconcile
    cron mirroring `apps/jobs/src/jobs/mpesa-reconcile.ts` + a failure-audit row. (Error logging now
    added so failures are at least visible.) File: `apps/api/src/routes/payments/paystack/webhook.ts:139-205`.

11. **[MED · P1-E04-S05] Paystack replay dedup grain.** Keyed on `data.id` (transaction id) alone,
    not `(event, data.id)`, so a second event *type* with the same transaction id is silently dropped.
    Only `charge.success` credits today. **Choose:** composite `(event,id)` dedup vs document
    single-event-per-id. File: `packages/db/migrations/0021_paystack_event.sql:17`.

## Epic 3 — Wallet Ledger Core

5. **[HIGH · accuracy · P1-E03-S08] Statement CSV inclusive `to` date drops same-day transactions.**
   `to=YYYY-MM-DD` is treated as `00:00:00Z`, so postings later on the last day are excluded
   (Jan 1–Dec 31 misses all of Dec 31). Fix = normalise `to` to end-of-day; **timezone EAT vs UTC**
   changes the result (platform is Kenya/EAT) → your call. Files: `apps/api/src/routes/parents/statement.ts:36-43`,
   `packages/wallet/src/statement.ts:108`.

6. **[MED · security · P1-E03-S07] GET auto-credit IDOR.** `GET /admin/parents/:userId/auto-credit`
   only requires `read wallet` (held by `parent`) and resolves the wallet from the path param → a
   parent can read another parent's auto-credit boolean. Same shape in P1-E05-S02. **Choose:**
   staff-only guard / session-scoped lookup, and whether to add a blanket staff preHandler to
   `/admin/*`. File: `apps/api/src/routes/admin/auto-credit.ts:46-70`.

7. **[MED · P1-E03-S04] Top-up replay returns `settled:0, residual:0`** (not the original figures),
   surfaced onto cash/bank receipts → misleading. Decide the replay contract (recompute true figures
   vs document as undefined-on-replay). File: `packages/wallet/src/settle.ts:85-97`.

8. **[LOW · P1-E03-S03] `wallet.post()` lacks `amount` validation** (zero/non-integer) that sibling
   `refund()`/`loyalty()` have; `amount=0` is a silent no-op that burns an idempotency key. Add a
   guard or document caller-trust. File: `packages/wallet/src/index.ts:191-202`.

9. **[MED · security · cross-cutting] CSV formula-injection guard missing repo-wide.** `csvField`
   helpers do RFC-4180 quoting only (no `= + - @` prefix neutralisation). Not exploitable in the
   wallet statement (server-controlled fields) but other exporters emit user-controlled text. Worth a
   single shared numeric-aware guard. Files: `packages/wallet/src/statement.ts`,
   `packages/contracts/src/index.ts`, `packages/catalog/src/commission-run.ts`. (I will keep flagging
   per-export exposure as the sweep reaches those epics.)
