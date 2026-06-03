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

## Epic 28 — Jobs Runner  ⚠️ FRAMEWORK

70. **[HIGH · framework · P3-E06-S01] The jobs scheduler ignores `cron` and runs purely on `intervalMs`.**
    No cron parser in `apps/jobs`; `job.cron` is decorative (and shown in the admin UI). Calendar jobs
    drift: monthly commission run uses `intervalMs=30 days` (≠ a month, slides + resets on restart);
    daily backup/anonymise/reminders fire every 24h from boot at an arbitrary hour, not their declared
    time. **This is the root of the cron findings in Epics 15/18/22/23/27.** Wire a cron scheduler, or
    drop/relabel the cron field. `apps/jobs/src/runner.ts:145-164`.

71. **[HIGH · P3-E06-S01] Admin "run now" failures aren't sent to the error tracker** — the route
    re-implements the run lifecycle and only logs/records `job_runs`, never `captureException`. Thread the
    existing `errorTracker` in, or delegate to `runJob`. `apps/api/src/routes/admin/jobs.ts:179-193`.

72. **[NOTE · deploy] No job scheduler is invoked in any production boot path** — all ~20 workers are
    registered/exported but `startScheduler` is never called (`index.ts` only logs). The crons don't
    fire in production yet; owned by the deploy story. (+ MED: SMS-retry has no provider-side
    idempotency → a DB failure after a successful send re-sends; + onFailure not enforced; + no
    distributed lock for >1 replica.)

## Epic 27 — Operational Reporting

67. **[BLOCKER · correctness · P3-E05-S05] Peak-hours heatmap buckets hour/weekday in UTC, not EAT.**
    Every cell shifted 3h; edge-of-day on the wrong weekday. Hour-grain, so the whole report is wrong
    (UI axis even says "(UTC)"). The acute instance of the timezone decision (#17) — direction (EAT) is
    unambiguous; pick the mechanism (+3h shift / Intl zoned / centre setting). `peak-hours-heatmap.ts:90`.

68. **[MED · P3-E05-S01/S02] Reporting "revenue" is invoiced (`staffRateSnapshot`), not settled** — counts
    unsettled + subscription bookings; S01 doesn't net refunds while S02 does (the two disagree); S02
    refund-on-cancelled can go negative. Decide billed-vs-collected + label/reconcile consistently.

69. **[HIGH · P3-E05-S04] Wallet-aging includes `settled_on_credit`** — the cross-cutting double-count
    (#14/#52), worse here because it never clears and ages into 90+. Fix the `settled_on_credit`
    definition consistently across all outstanding sites.

## Epic 26 — Loyalty Clawback / Negative Carry  ⚠️ STRUCTURAL

64. **[BLOCKER · money · ARCHITECTURE] The loyalty ledger hosts two disjoint, unbridged engines.**
    P2-E05 rows are keyed `walletId`/`direction`/`points`; P3-E04 rows (clawback, negative carry,
    pending-settlement hold, admin adjustment) are keyed `parentId`/`points_delta`/`kind` with the other
    columns NULL. The ONLY live redeem path (`redeemPoints`) sums the P2 partition and never sees the P3
    partition — so **clawback, negative carry, AND pending-settlement holds are all invisible to
    redemption**, and a parent can redeem around all of them (P3-E04-S02 + S04 blockers; the P2-E05-S03
    #47 gap confirmed). `availableLoyaltyToRedeem` (the correct guard) is dead code and couldn't work
    without reconciling the owner key. **Decision:** unify the ledger on ONE owner+delta representation
    so every balance/redeem surface counts all rows. Not a mechanical patch.

65. **[HIGH · P3-E04] Is P3-E04 live or staged?** Neither `clawbackForRefund`, `earnPoints`, nor
    `availableLoyaltyToRedeem` has a production caller (refund only sets a `loyalty_clawback_pending`
    flag nothing consumes). When wired (alongside #64): write the `loyalty.clawback` audit row, add
    DB-level idempotency + a tx + a per-parent row lock to clawback/earn/adjust (all currently
    read-then-insert unlocked), claw against remaining-clawable points, and add the AC3 available-to-redeem
    UI field. (S03 admin-adjust IS live and was fixed: reason now persisted on the ledger row.)

66. **[MED · P3-E04-S03] Admin adjust ledger insert + audit not atomic** — wrap in one tx.

## Epic 25 — Kids-Only Salon Flow

60. **[BLOCKER → money · P3-E03-S04] Re-reassign back to a zero-net stylist silently loses commission.**
    `reassignBookingCommission` treats `priorHolders.length===0` as a replay without confirming the
    current target is whole; A(10%)→B(no rate)→A leaves A with 0. **Recommended fix:** gate the replay
    no-op on `netByStaff.get(newStaffId) === expectedAmount` (resolve target's rate at booking time;
    null→0), else post the missing reassign line + regression test. NOT auto-applied (a wrong
    idempotency change risks double-posting; confirm 0%-rate stylists exist). `commission-hook.ts:227-240`.

61. **[HIGH · P3-E03-S01] No admin/staff route to declare stylist availability** — data layer has zero
    non-test callers; the JTBD + authz boundary have no HTTP surface. Confirm deferred-to-UI or add it.

62. **[MED · P3-E03-S02] Past-dated salon slot is bookable** (no `slotDate >= today` guard); **[MED]**
    AC3 least-busy not server-enforced on confirm (advisory only, misleading doc comment).

63. **[MED · P3-E03-S05] Salon tile "total revenue" counts no-show/unsettled bookings** (invoiced, not
    realized) → diverges from the wallet ledger. Matches the ops dashboard. Label as "invoiced" or sum
    settled-only.

## Epic 24 — Stylist Commission Viewer

59. **[MED · P3-E02-S02] Earnings breakdown visit-count ignores `source='reassign'`** (later-epic
    source) → new stylist's visit undercounted; old stylist shows "1 visit / ~0 revenue". Revenue +
    headline totals correct. Decide counting semantics (count reassign for the new stylist, or count by
    current `bookings.staffId`) + a regression test.

## Epic 23 — Attribution & Commission Ledger

55. **[BLOCKER → finance · P3-E01-S02] Subscription-covered bookings accrue ZERO commission**
    (`staffRateSnapshot=0`). Same as #32. Decide the per-session value + whether stylists earn on
    subscription visits, and store/re-resolve the true service price for the commission base.

56. **[HIGH · P3-E01-S02] Commission reversal not wired into refund** — `reverseBookingCommission` has
    no caller; a refunded booking leaves the stylist's accrual (money leak). Wire it, but DEFINE
    partial-refund behavior first (it reverses the full accrual → would over-reverse a partial refund).

57. **[HIGH · cross-cutting · P3-E01-S03] Jobs cron not honored** — the scheduler runs on `intervalMs`,
    not the declared cron (`0 2 1 * *`, etc.); no cron parser exists. Affects the monthly commission run,
    db-backup, anonymise, mpesa-reconcile, etc. Resolve the jobs-framework cron support in Epic 28.

58. **[MED · cross-cutting] Commission/finance period boundary is UTC, not EAT** — folds into the
    UTC-vs-EAT timezone decision (item 17). (+ LOW P3-E01-S05: payout reference truncates the staff UUID
    to 8 chars — collidable, load-bearing for M-Pesa B2C reconciliation.)

## Epic 22 — Auto-credit & Outstanding

52. **[HIGH · P2-E07-S01] `settled_on_credit` AC3 violation** — the outstanding banner never clears for
    an auto-credit parent (the overdraw invoice keeps `amount_due` that no settlement clears, and the
    sum includes it). This is the cross-cutting `settled_on_credit` decision (#14) now confirmed as an
    AC violation. Fix consistently across `wallet.ts`/`parent-profile.ts`/`parents-search.ts`.

53. **[HIGH · compliance · P2-E07-S02] Outstanding-balance dunning nudge gated on the MARKETING opt-in
    (defaults OFF)** → dead-on-arrival for most parents; spec says "opt-out" (on by default). Decide:
    treat as transactional (always send), or add a dedicated dunning-consent flag. (+ HIGH: exact-day
    milestone match has no catch-up — a missed tick drops the nudge; + MED: SMS sent before the
    idempotency marker → double-send on crash.)

54. **[LOW · P2-E07-S03] `autoCreditStatusViewModel` is dead code** (page bypasses it) — wire or delete.

## Epic 21 — Backup Retention

49. **[HIGH · data-safety · P2-E06-S02] Two backup pruners with different policies coexist** — the
    legacy `db-backup.ts` prune (X8-S03) hardcodes 30 days and ignores the configurable policy; if both
    are wired to the scheduler it could delete monthly-tier backups the new policy keeps. Pick the
    canonical pruner and retire the other's prune.
50. **[MED · P2-E06-S01] Backup-retention admin page is a static shell** (no form/fetch) — AC2 met at
    the API only; ship the client or confirm intentional. (+ LOW: add sane `.max()` caps so a huge
    `graceDays` can't disable the pruner.)
51. **[MED · P2-E06-S02] AC3 "soft delete with grace before physical delete"** is creation-age
    protection, not a two-phase soft delete. Confirm intent.

## Epic 20 — Loyalty Redemption

45. **[HIGH · P2-E05-S01] Loyalty earn not wired to settled payments** — `earnPointsV2` has no
    production caller; the wallet route hardcodes `loyaltyPoints:0`, so no points are earned. Decide if
    settled-payment→earn wiring is in this "harden" story's scope. (+ MED: concurrent earn 500; AC2 ref unenforced.)

46. **[HIGH · P2-E05-S02] Two unintegrated loyalty rate-config systems** — the effective-dated engine
    endpoint has no UI; the existing Settings UI writes a different non-effective-dated store the engine
    ignores. Pick one source of truth. (+ LOW: forbid back-dating `effectiveFrom`.)

47. **[HIGH · P2-E05-S03] AC3 "no redeem on pending settlement" not enforced** — redeem checks the P2
    `walletId` balance but the pending-clawback hold is in the P3-E04 `parentId` schema and is never
    consulted. No live loss until P3 clawbacks ship; reconcile the dual schema then.

48. **[MED · P2-E05-S04] Loyalty history truncated at 100 rows, no pagination/`hasMore`** (+ LOW: AC2
    "source link" is a plain label, `sourceId` dropped).

## Epic 19 — POS App (in-store)

40. **[HIGH · money · P2-E04-S03] Flat-KES overall discount over-discounts `vat_exclusive` lines** by
    the VAT fraction (inconsistent net/gross frames). "KES 100 off" removes 116c on a vat_exclusive
    line; entered/displayed/actual diverge on mixed carts. % discounts are fine. Decide the intended
    (likely gross) frame. `packages/contracts/src/pricing.ts:96-157`.

41. **[HIGH · money · P2-E04-S05] `POST /pos/cashup` is not idempotent** — a retry/second tab claims
    zero sales and silently posts a second Treasury reconciliation adjustment with a fabricated
    variance. Add an idempotency key or reject a zero-sales close with a non-zero count. `pos/cashup.ts`.

42. **[MED · P2-E04-S03] No POS discount cap/authorization; discount not audited** — any cashier can
    zero a sale, `pos.sale.paid` records only `total_cents`. Add a cap/approval (product call) +
    record the discount in the audit payload.

43. **[MED · P2-E04-S05] Cash-up variance posts to a single global cash float**, not the cashier's till
    → multi-till conflation. Scope to single-till (document) or attribute per till.

44. **[MED · P2-E04-S04] POS concurrent duplicate-create surfaces 500 instead of replaying** (TOCTOU on
    the idempotency key); **[LOW]** Paystack amount-mismatch fails the sale but the customer was charged
    (no refund path); **[LOW]** admin can't run cash-up (guard is `create payment`).

## Epic 18 — Pickup Auth & Observations

38. **[MED · child-safety · P2-E03-S03] Hand-off never verifies the collector against the authorised
    pickup list (S01) nor records who collected the child** — only who released. The whole epic is
    "Pickup Authorisation" yet the list is unused at hand-off. Decide whether to require/record the
    collector (select from the authorised list + store collector id/name + audit it).
39. **[LOW · P2-E03-S01] Pickup-list audit payload omits the changed values** (phone/photoUrl/before-
    after) on a safety-critical list. Decide privacy-vs-traceability for what to record.

## Epic 17 — Subscription Plans  (several HIGH money/finance decisions)

31. **[HIGH · money · P2-E02-S05] Non-atomic renewal can double-charge.** Crash between the pending
    invoice insert and the separate-tx `debit()` orphans an invoice that a later wallet top-up
    FIFO-settles while the next cron posts a fresh debit. Wrap in one tx (tx-accepting debit) or make
    renewal invoices un-FIFO-settleable. `apps/jobs/src/jobs/subscription-renew.ts:56-68`.

32. **[HIGH · finance · P2-E02-S03] Subscription bookings record ZERO revenue & ZERO staff
    commission** (`staffRateSnapshot=0`) — feeds 4 dashboards + commission-hook. Decide the per-session
    value to recognise for subscription-covered sessions. `packages/catalog/src/schedules.ts:642`.

33. **[HIGH · P2-E02-S03] Subscription entitlement-refund semantics on cancel.** (a) Over-refund:
    cancelling an old-period booking after renewal pushes the new period above cap (free unit/period);
    (b) Under-refund: refund UPDATE requires `status='active'`, so a paused/dunning cancel silently
    drops the refund (parent loses a paid unit). Define correct cross-period + paused-state refund rules.
    `packages/catalog/src/schedules.ts:826-832`.

34. **[MED · P2-E02-S02] Subscription charge bypasses pre-pay for auto-credit parents** (negative
    wallet) AND is recorded as a `checkin` settlement / `wallet.checkin_debit` (reporting miscounts it
    as a check-in) AND a concurrent FIFO top-up of the pending invoice 500s. (3 related subscribe-flow items.)

35. **[MED · P2-E02-S05] Renewal transitions' update+audit are non-atomic; a no-plan-price sub stalls
    silently forever** (never charged/dunned, still honours entitlement — revenue leak). Wrap update+audit
    in a tx; emit an alert on no-price.

36. **[MED · P2-E02-S04] AC1 "admin" pause/resume unreachable** — route gates on `create payment`,
    which `admin` lacks. Add a `manage subscription` perm or drop "admin" from the AC.

37. **[MED/LOW · P2-E02-S06] Renewal cron writes a spurious `subscription.cancelled` audit on an
    un-cancel race** (`.returning()`-gate it); re-`/cancel` is non-idempotent (duplicate audit).

## Epic 16 — Booking Engine

26. **[HIGH · money · P2-E01-S05] Subscription-paid reschedule can cross the subscription period →
    entitlement double-dip.** `rescheduleBooking` predates subscriptions (Epic 17) and doesn't
    re-validate coverage; a unit from period N gets spent on a period N+1 slot. **Choose:** block
    cross-period reschedule, or re-run bookSlot entitlement on reschedule. File: `packages/catalog/src/schedules.ts:718-780`.

27. **[MED · P2-E01-S04] AC3 attribution unreachable from the reception UI** — `confirm()` never sends
    `staffId`, so attribution-required services can't be booked end-to-end (server enforcement is
    correct). Ship without the staff picker, or land it. (+ LOW: validate `staffId` role on
    non-attribution services to avoid commission mis-attribution.)

28. **[MED · P2-E01-S06] No dedicated cancellation cutoff** — parent self-cancel reuses
    `rescheduleCutoffHours`. Share one cutoff (document it) or add `cancellation_cutoff_hours`.

29. **[MED · P2-E01-S07] Parent bookings list is unbounded** (no LIMIT/pagination). Choose a fixed
    bound or cursor pagination. File: `apps/api/src/routes/parents/booking.ts:75`.

30. **[LOW · P2-E01-S02] In-progress slot still bookable** (`isSlotPast` keys on END time). Confirm
    whether a started-but-not-ended session is joinable.

> Note: the **UTC-vs-EAT timezone** decision (item 17) also covers booking slot wall-clock times
> (slot generation, availability "today"/"earlier today") — resolve one centre-timezone convention repo-wide.

## Epic 14 — Design System Foundation

25. **[LOW · X7-S01] `brand`/`ink`/`surface` token aliases don't re-skin on a palette swap** — they're
    hardcoded duplicates of `primary.500`/`neutral.900`, so receipt/packing-slip docs (direct token
    consumers) keep the old colour. **Choose:** derive aliases from the palette, or accept the
    decoupling (X7-S04 brand-override is the real re-skin) + document. File: `packages/config/tokens.cjs`.

## Epic 13 — Audit Log (outbox)

22. **[MED · X5-S01] Structurally enforce the audit atomicity contract.** JSDoc warning now added, but
    `audit()` still accepts the bare `db` as easily as a `tx`. **Choose:** `auditInTx`/`auditStandalone`
    named entry points, or a lint rule. File: `packages/db/src/audit.ts`.

23. **[MED · audit integrity · X5-S01] `audit_outbox` has no DB-layer tamper protection.** No DELETE
    block / content-immutability (sibling `wallet_ledger` has both). Needs a *column-aware* trigger
    (freeze content columns; keep the X5-S02 drain's `processed_at`/attempts updatable) + role REVOKE.
    File: `packages/db/migrations/0001_audit_outbox.sql`.

24. **[MED · X5-S03] Audit-catalogue drift enforcement is a static scan blind to non-literal actions.**
    ~11/176 sites use `auditAction()`; the rest pass raw literals; a variable-action site with an
    uncatalogued value would bypass the only guard. **Choose:** accept tradeoff, or add a lint rule /
    fail-CI-on-unresolved-scan-site. File: `packages/auth/src/audit-actions.test.ts`.

## Epic 12 — Marketing & Landing

20. **[HIGH · content · P1-E12-S02] All five per-unit hero images are broken** — they reference
    `/units/{slug}.jpg` but no `public/units/` assets exist (still broken in the working tree).
    Needs the real unit photos sourced (product/design) or an agreed placeholder + an `existsSync`
    regression test. File: `apps/platform/lib/unit-content.ts:66`.

21. **[LOW · P1-E12-S02] "Book now" CTA always routes to `/signup`** (even for authenticated
    visitors); `bookNowHref(isAuthenticated)` is dead code with a misleading passing test. **Choose:**
    wire the authed CTA into the booking funnel, or delete the dead helper + test. (May be the S04
    hand-off.) File: `apps/platform/app/(public)/[unit]/page.tsx`.

## Epic 8 — Receipt Engine

18. **[MED · fraud · P1-E08-S05] A voided receipt can still be reprinted/rendered (and re-SMS'd) as a
    valid positive receipt.** The render/reprint routes (S03/S04) don't check whether a `void` row
    reverses the original. **Choose:** block reprint/render of a voided original (409) or stamp a VOID
    watermark. Files: `apps/api/src/routes/receipts/reprint.ts`, `.../render.ts`.

19. **[MED · cross-cutting] Receipt per-series numbering uses `MAX(sequence_number)+1`** in both the
    local writer (S02) and the void path (S05) — race-prone under concurrency (UNIQUE prevents
    duplicates, but transactions retry and the series gains gaps). KRA/eTIMS prefer monotonic/gapless.
    **Choose:** per-series counter row under row lock, `pg_advisory_xact_lock(series)`, a SEQUENCE, or
    accept+document gaps. Files: `packages/payments/src/receipts/local-receipt-writer.ts`, `.../void.ts`.

## Epic 6 — Treasury & Float

15. **[MED · P1-E06-S04] Reconciliation export `real_balance`/`drift` are reconstructed from approved
    adjustments**, not the operator's real cash count (never persisted). An uncorrected real-world
    drift exports as `drift=0`/reconciled, and the columns diverge from the same-named live screen.
    **Choose:** rename/annotate columns, persist the real balance per day, or drop the columns.
    File: `packages/wallet/src/reconciliation-export.ts:124-133`.

16. **[LOW · P1-E06-S04] Adjustment sign convention unpinned** (`real = system + Σ adjustments`).
    If operators enter `system − real`, every export's real/drift is sign-inverted. Pin + document +
    test the convention. File: `packages/wallet/src/reconciliation-export.ts:125`.

17. **[finance · cross-cutting] Day-bucketing timezone: UTC vs EAT.** Statement `to`-date (item 5),
    reconciliation export, float-liability and float-vs-revenue read models all bucket by UTC while
    the business runs in EAT (UTC+3). Decide one convention (likely Africa/Nairobi) and apply
    uniformly. (Folds in item 5's timezone question.)

## Epic 5 — Reception Operator Surface

12. **[COMPLIANCE confirm · P1-E05-S06] Receipt SMS now sends regardless of marketing opt-in.** I
    fixed receipts to send as transactional (they were wrongly gated on the marketing flag, so most
    parents got no receipt). This follows the platform's own model (P1-E02-S04 AC3: transactional SMS
    always sent) and is staff-triggered per explicit parent request — but confirm it matches your
    intended SMS/compliance policy. File: `packages/sms/src/index.ts` `sendReceipt`.

13. **[MED · P1-E05-S06] Receipt SMS has no idempotency.** A double-click/retry on POST `…/receipt/:id/sms`
    sends duplicate texts + duplicate audit rows. **Choose:** accept resend-as-feature (+ client
    debounce) or dedup by recent `(phone, template, transactionId)`. File: `apps/api/src/routes/reception/receipt.ts:139-174`.

14. **[LOW · P1-E05-S02] `settled_on_credit` debt double-counts** on the reception header (negative
    wallet balance AND outstanding). Pre-existing/consistent across `wallet.ts`, `parents-search.ts`.
    **Choose:** exclude from outstanding, or show as a separate "owed on credit" line.

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

9. **[RESOLVED ✅ in Epic 6 · was MED→HIGH] CSV formula-injection guard.** All three `csvField`
   copies (`packages/contracts`, `packages/catalog/commission-run`, `packages/wallet/statement`) now
   prefix a leading `= + - @ \t \r` cell with `'`, numeric-aware so signed money is preserved.
   Regression test added. (Follow-up nicety, not blocking: dedupe the 3 copies into one shared helper.)
