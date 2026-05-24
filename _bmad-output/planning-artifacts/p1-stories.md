# Baby Milestones — Phase 1 Stories

*Source: `epics.md` · spec: `Baby-Milestones-Spec.md` v2.1 (36 locked decisions) · client-approved · ready for build*

This is the implementable backlog for Phase 1 (Foundation + Wallet + Parent Account, 12–14 weeks). Every story is sized for a single engineer-pair to complete in 1–3 days. Story IDs are stable and traceable to epics.

**Convention:**
- `P1-E0X-SYY` — Story for Epic X, sequence YY
- AC numbered for test-traceability
- Tech notes are not exhaustive — they pin decisions, not implementation

**Phase 1 epic index:**
- P1-E01 Identity & SSO Foundation
- P1-E02 Parent & Child Registry
- P1-E03 Wallet Ledger Core *(spine)*
- P1-E04 Payments Adapter (M-Pesa + Paystack + Cash + Bank Transfer)
- P1-E05 Reception Operator Surface *(heartbeat)*
- P1-E06 Treasury & Float Segregation
- P1-E07 Service Catalogue & Pricing
- P1-E08 Receipt Engine (KRA-shaped)
- P1-E09 SMS Stub Adapter + Config
- P1-E10 Admin Console Shell & RBAC
- P1-E11 Parent Dashboard MVP
- P1-E12 Marketing & Landing
- X5 Audit Log (outbox pattern)
- X7 Design System Foundation
- X8 Observability, Backups, CI/CD

---

## P1-E01 — Identity & SSO Foundation

### P1-E01-S01 — Parent signs up with phone + PIN
**JTBD:** As a new parent, I want to register with my phone number and a 4-digit PIN so I can access Baby Milestones without juggling passwords.
**AC:**
- AC1: Valid Kenya phone (`+2547XXXXXXXX` / `07XXXXXXXX`) + matching 4-digit PIN entered twice → account created, auto-logged in, wallet auto-provisioned.
- AC2: Duplicate phone → redirect to login with friendly message; no account leak.
- AC3: Invalid phone format → inline field error; submit blocked.
- AC4: Weak PINs (`0000`, `1234`, `1111`, `2580`, `9999`) rejected with helper text.
- AC5: PIN stored as `argon2id` hash; never logged or echoed.
- AC6: `audit_outbox` row: `auth.signup`, `user_id`, `ip`, `user_agent`, `timestamp`.
**Tech:** Phone normalised to `+2547XXXXXXXX`. Use `argon2id`. Session created immediately, opaque token in Redis. Cookie `bm_session`, domain `.babymilestones.co.ke`, `HttpOnly`, `Secure`, `SameSite=Lax`. Files: `apps/api/src/routes/auth/signup.ts`, `packages/auth/{phone.ts,pin.ts,session.ts}`.
**Tests:** Unit (phone normalisation, weak-PIN list, hash deterministic check). Integration (happy path, duplicate, invalid format, weak PIN). E2E (`e2e/signup-flow.spec.ts`).
**Deps:** `users` table migrated, `audit_outbox` ready.
**DoD:** Tests green, code-reviewed, staging-deployed, Reception lead walked through signup.

### P1-E01-S02 — Parent logs in with phone + PIN
**JTBD:** As a returning parent, I want to log in with my phone and PIN so I can access my wallet.
**AC:**
- AC1: Correct phone + PIN → session cookie set, redirect to dashboard.
- AC2: Wrong PIN → "Invalid credentials" (never specify which field).
- AC3: 5 failed attempts in 5 min → rate-limited (HTTP 429) with `Retry-After`.
- AC4: Unknown phone → identical timing and error as wrong PIN (anti-enumeration).
- AC5: `audit_outbox`: `auth.login.success` or `auth.login.failure` (no PIN in payload).
**Tech:** Rate limiter by `(phone, ip)`. Constant-time PIN compare. `apps/api/src/routes/auth/login.ts`.
**Tests:** Rate-limit fires at 6th attempt; timing-attack safe.
**Deps:** S01.

### P1-E01-S03 — Admin / Reception / Cashier login
**JTBD:** As an admin or staff user, I want to log into the admin app with my email + password so I can do my job.
**AC:**
- AC1: Email + password (not phone+PIN) → session for staff role.
- AC2: Role determines landing page (`/reception`, `/treasury`, `/admin`).
- AC3: Password complexity enforced at creation: ≥10 chars, mixed.
- AC4: Same SSO cookie machinery as parents but on `admin.babymilestones.co.ke`.
- AC5: Audit log captures `auth.staff.login`.
**Tech:** `users.user_type ENUM('parent','staff')`. Staff have email; parents have phone. `packages/auth/staff.ts`.
**Tests:** Cross-domain cookie issuance; staff cannot use parent flow and vice-versa.
**Deps:** S01.

### P1-E01-S04 — SSO across subdomains
**JTBD:** As a signed-in user, I want my login to carry across `platform`, `pos`, `admin` so I'm not re-prompted. (The WooCommerce online shop is excluded — separate auth.)
**AC:**
- AC1: Cookie domain `.babymilestones.co.ke` set on login from any app.
- AC2: All apps read session via the same middleware (`packages/auth/middleware.ts`).
- AC3: Logout from one app invalidates the session everywhere (Redis `DEL`).
- AC4: Role mismatch (e.g., parent landing on `admin.*`) → 403 with redirect to home.
- AC5: CSRF: double-submit cookie token required on POST/PUT/DELETE.
**Tech:** Opaque token in Redis (not JWT — role changes need instant invalidation). `session.touch()` extends TTL on each request.
**Tests:** Open two browser tabs on different subdomains; logout in one invalidates the other within 5 seconds.
**Deps:** S01–S03.

### P1-E01-S05 — Password / PIN reset by OTP
**JTBD:** As a parent who forgot their PIN, I want to reset it via an SMS code so I'm not locked out.
**AC:**
- AC1: Request reset by phone → 6-digit code, valid 10 min, single-use, logged to `sms_outbox` (stub).
- AC2: Code-verify endpoint → 1-time short-lived reset token (JWT, 15 min, audience-bound).
- AC3: Reset endpoint accepts token + new PIN; old sessions invalidated.
- AC4: Rate-limit: max 3 reset codes per phone per hour.
- AC5: Audit: `auth.reset.requested`, `auth.reset.completed`.
**Tech:** Staff reset is admin-initiated (no self-serve). Code: `Math.random` is fine; use `crypto.randomInt(100000, 999999)`.
**Deps:** S01, P1-E09 (SMS stub).

### P1-E01-S06 — Role + Permission model seeded
**JTBD:** As a developer, I need a stable role taxonomy so every guard reads from one source.
**AC:**
- AC1: Roles seeded: `parent`, `reception`, `cashier`, `packer`, `accountant`, `treasury`, `admin`, `super_admin`.
- AC2: Permissions table (`role`, `action`, `resource`) referenced by API middleware.
- AC3: Super-admin role can impersonate (`actAs`) with a visible banner — both real and impersonated user IDs in audit log.
- AC4: Role mutation invalidates the user's active sessions.
**Tech:** Permissions enforced server-side, not relied on client. `packages/auth/rbac.ts`.
**Tests:** Snapshot the permission matrix; CI fails if it drifts without migration.
**Deps:** S01.

---

## P1-E02 — Parent & Child Registry

### P1-E02-S01 — Parent self-registers with profile details
**JTBD:** As a parent, I want to add my name, language preference, and emergency contact during signup so the system knows me.
**AC:**
- AC1: After PIN setup, an inline profile form captures: first name, last name, optional email, residential area (free text).
- AC2: Required fields validated; email regex permissive (RFC 5322 light).
- AC3: Skip allowed; profile completion banner shown until done.
- AC4: Profile edit available from dashboard at any time.
**Tech:** `parents` table FK to `users`; one parent per user (no joint accounts for v1).
**Deps:** P1-E01-S01.

### P1-E02-S02 — Reception registers walk-in parent
**JTBD:** As Reception, I want to create a parent record for a walk-in in under 60 seconds.
**AC:**
- AC1: One-screen form: phone (required), first name, last name, optional email, area.
- AC2: Phone-collision check live (debounced 300ms); if duplicate, offer "Open existing" or "Merge intent" flag.
- AC3: PIN field optional at Reception creation — system can SMS a setup link later.
- AC4: Action logged: `parent.created_by_reception`, with the staff user ID.
**Tech:** No password set initially → parent must verify-via-OTP on first self-login.
**Deps:** S01, P1-E01-S03.

### P1-E02-S03 — Add and edit children
**JTBD:** As a parent, I want to register my children once and update their details as they grow.
**AC:**
- AC1: Add child: first name, optional last name, date of birth (required), gender (optional), allergies/notes (free text 500 chars).
- AC2: DOB drives age in months, surfaced on every booking selector.
- AC3: Edit: same fields; AC fields preserved.
- AC4: Soft-delete (mark `archived_at`); historical bookings remain.
- AC5: Audit: `child.created`, `child.updated`, `child.archived`.
**Tech:** `children` table with `parent_id` FK; `archived_at` nullable.
**Deps:** S01.

### P1-E02-S04 — Photo and SMS consent flags
**JTBD:** As a parent, I want to control whether my child is photographed or my number is messaged for marketing.
**AC:**
- AC1: Per-child: `photo_consent BOOLEAN`, defaults false; per-parent: `sms_marketing_opt_in BOOLEAN`, defaults false.
- AC2: Editing consent is logged with timestamp.
- AC3: SMS dispatcher (X4) reads `sms_marketing_opt_in` before sending non-transactional messages.
**Tech:** Transactional SMS (booking confirms, OTP) always sent regardless of opt-in.
**Deps:** S01, S03.

### P1-E02-S05 — Data export for a parent's record
**JTBD:** As a parent, I want to download everything you have on me and my children, in line with Kenya's Data Protection Act.
**AC:**
- AC1: "Export my data" button on parent profile → ZIP with JSON for parent, children, bookings, wallet ledger, receipts.
- AC2: Generation is async (>5s); SMS-stub sends a download link, valid 7 days, single-use.
- AC3: Audit logged.
**Tech:** Job runs in `apps/jobs`. ZIP stored at signed-URL S3-equivalent.
**Deps:** P1-E03 (ledger), P1-E09 (SMS stub).

---

## P1-E03 — Wallet Ledger Core *(spine — write tests first)*

### P1-E03-S01 — Append-only `wallet_ledger` schema enforced at DB level
**JTBD:** As an auditor, I need to know no ledger row was ever modified or deleted.
**AC:**
- AC1: Migration creates `wallet_ledger` with columns: `id`, `wallet_id`, `amount` (signed, integer cents), `direction` (`credit`|`debit`), `kind` (`topup`|`debit`|`refund`|`adjustment`|`reversal`), `idempotency_key UNIQUE`, `posted_by`, `source`, `reverses_entry_id NULLABLE FK`, `created_at`.
- AC2: Postgres app-role has `REVOKE UPDATE, DELETE` on the table; only migrations run as the owner.
- AC3: Unit test attempts `UPDATE wallet_ledger SET amount=0`; must fail with privilege error.
- AC4: Currency is **integer cents** (KES * 100) throughout the ledger to avoid float drift.
**Tech:** `packages/db/migrations/0003_wallet_ledger.sql`. App connections use `bm_app` role.
**Deps:** none (foundational).

### P1-E03-S02 — Balance is computed, never stored
**JTBD:** As a developer, I want one source of truth for wallet balance so reconciliation is trivial.
**AC:**
- AC1: `wallet.balance(walletId)` = `SELECT SUM(amount) FROM wallet_ledger WHERE wallet_id = ?`.
- AC2: No `wallets.balance` column.
- AC3: Index `(wallet_id, created_at DESC)` exists.
- AC4: Property test: 1000 random postings → balance equals naive sum.
**Tech:** Materialised view considered for P2 if perf-needed; not in P1.
**Deps:** S01.

### P1-E03-S03 — Idempotent posting interface
**JTBD:** As a developer integrating M-Pesa, I want to call `wallet.post()` safely even if the network retries.
**AC:**
- AC1: `post({ walletId, amount, kind, idempotencyKey, source, postedBy })` returns the ledger row.
- AC2: Same key called twice → returns the same row, no second posting (UNIQUE constraint catches it).
- AC3: Conflict surfaced as `IdempotencyConflict` typed error for caller to handle.
**Tech:** Wrap in transaction; rely on UNIQUE index for atomicity.
**Tests:** Concurrent 100 posts of the same key → exactly 1 row.
**Deps:** S01, S02.

### P1-E03-S04 — Top-up applies FIFO to outstanding invoices, residual to wallet
**JTBD:** As a parent settling a debt, my top-up should clear the oldest invoice first, then leave the rest as balance.
**AC:**
- AC1: Order of outstanding invoices: oldest `created_at` first.
- AC2: Each invoice settled until either invoice is closed or top-up is exhausted.
- AC3: Partial settlement allowed: invoice remains open with reduced `amount_due`.
- AC4: Three canonical test cases pass (top-up 2000 / owed 800 → wallet=1200, invoice closed) (top-up 500 / owed 800 → wallet=0, invoice partial 300 left) (top-up 2000 / owed [500,400,200] → wallet=900, all closed).
- AC5: Each settlement writes a `wallet_ledger` row + `wallet_ledger_invoice_settlement` linkage row.
**Tech:** `packages/wallet/settle.ts`. All within one DB transaction.
**Tests:** `packages/wallet/__tests__/topup-settlement.test.ts` — written **before** implementation.
**Deps:** S01, P1-E02-S03.

### P1-E03-S05 — Debit at check-in; pending invoice → settled
**JTBD:** As Reception, I want a child's check-in to debit the wallet automatically.
**AC:**
- AC1: Booking creates `invoice` row in `pending` status with `amount_due`, `parent_id`, `service_id`.
- AC2: Check-in calls `wallet.debit({ invoiceId, ... })` inside `SELECT FOR UPDATE` on the wallet.
- AC3: If wallet ≥ amount → debit, invoice → `settled`.
- AC4: If wallet < amount AND `auto_credit_enabled` → debit anyway, balance goes negative, invoice → `settled_on_credit`.
- AC5: If wallet < amount AND `auto_credit_enabled = false` → invoice → `outstanding`, no debit, booking still proceeds.
- AC6: Double-check-in blocked by unique index on settlement linkage.
**Tech:** Critical path — write test cases covering all four paths first.
**Deps:** S01–S04, P1-E07 (services), P1-E02.

### P1-E03-S06 — Refund recording (admin-only) creates a reversing entry
**JTBD:** As admin, I want to record an offline refund so the ledger matches reality.
**AC:**
- AC1: Admin selects an original debit entry; enters reason code (required) + free-text note; specifies refund amount (≤ original).
- AC2: A `wallet_ledger` row is inserted with `kind='refund'`, `reverses_entry_id` = original ID.
- AC3: SMS-stub notification queued for the parent.
- AC4: Refund cannot exceed remaining-refundable amount on the original (track partial refunds).
- AC5: Only `admin` and `super_admin` roles can call this endpoint.
**Tech:** Loyalty proportional clawback handled in P3 (`P3-E04`) — flagged on the entry now via `loyalty_clawback_pending=true`.
**Deps:** S01–S03, P1-E10 (admin shell).

### P1-E03-S07 — Auto-credit toggle per parent
**JTBD:** As admin, I want to allow specific trusted parents to go negative without prepayment.
**AC:**
- AC1: `parents.auto_credit_enabled BOOLEAN DEFAULT FALSE`.
- AC2: Reception screen shows the toggle on the parent header; flipping it requires admin role (Reception cannot flip).
- AC3: Toggle change audited.
**Tech:** Permission: `parents.toggle_auto_credit` → `admin`, `super_admin`.
**Deps:** S01, P1-E10.

### P1-E03-S08 — Statement export (CSV) for a parent
**JTBD:** As a parent, I want to download my wallet statement for my records.
**AC:**
- AC1: Date-range CSV: timestamp, kind, direction, amount, balance after, reference.
- AC2: Available from parent dashboard and admin Reception screen.
- AC3: Generated synchronously for ranges ≤ 12 months; async otherwise.
**Tech:** `packages/wallet/statement.ts`.
**Deps:** S01, S02.

---

## P1-E04 — Payments Adapter

### P1-E04-S01 — M-Pesa STK push initiated from parent dashboard
**JTBD:** As a parent, I want to top up by entering an amount and tapping "Pay", then approving on my phone.
**AC:**
- AC1: Top-up form: amount (KES, min 50, max 70,000 per STK call), confirm button.
- AC2: Server calls Daraja `stkpush`; persists `mpesa_stk_request` row keyed by `CheckoutRequestID`.
- AC3: UI shows "Check your phone…" with a 90-second progress indicator.
- AC4: Polling endpoint returns current status; transitions reflected live.
- AC5: Audit logged.
**Tech:** Daraja credentials in env vars (never DB). `apps/api/src/routes/payments/mpesa/initiate.ts`. State machine: `INITIATED → STK_SENT`.
**Deps:** P1-E03-S03.

### P1-E04-S02 — M-Pesa C2B callback handler (idempotent)
**JTBD:** As the system, I must accept Daraja's callback exactly once, even if it arrives twice or out of order.
**AC:**
- AC1: Callback URL `POST /webhooks/mpesa/c2b`.
- AC2: Handler is idempotent on `CheckoutRequestID`: `INSERT … ON CONFLICT DO NOTHING` into `mpesa_callback`.
- AC3: Success → `wallet.post(topup)` via idempotency key = `mpesa_callback.id`.
- AC4: Failure → state → `FAILED`, audit reason.
- AC5: Out-of-order arrival (callback before Express response committed) handled — the callback creates the request row if it doesn't exist yet.
- AC6: HTTP 200 OK returned in all cases (Daraja retries on non-200).
**Tech:** Use Daraja's IP allowlist; verify shape but treat it as untrusted input.
**Tests:** Replay same payload 5×; only 1 ledger entry.
**Deps:** S01.

### P1-E04-S03 — STK reconciliation cron
**JTBD:** As the system, I must recover from missing callbacks within 2 minutes.
**AC:**
- AC1: Cron in `apps/jobs` runs every 60s.
- AC2: For each `mpesa_stk_request` in `CALLBACK_PENDING` older than 90s, calls Daraja `stkpushquery`.
- AC3: If query returns success → process as if callback arrived (use the same idempotent path).
- AC4: If query returns failure → mark `FAILED`, notify parent via SMS-stub.
- AC5: Stale requests (>15 min, still pending) → marked `EXPIRED`.
**Tech:** Reuse handler logic from S02.
**Deps:** S01, S02.

### P1-E04-S04 — Paystack card top-up
**JTBD:** As a parent, I want to top up with my Visa or Mastercard via Paystack since Stripe isn't available in Kenya.
**AC:**
- AC1: "Pay with card" CTA opens Paystack hosted checkout with `email` (parent), `amount`, `reference` (UUID).
- AC2: Successful charge redirects back; UI shows "verifying…".
- AC3: Server verifies via `transaction/verify`; treats webhook as source of truth.
- AC4: Card-on-file: optional checkbox; uses Paystack's saved authorization for repeat top-ups.
**Tech:** `apps/api/src/routes/payments/paystack/init.ts`. Public key in client; secret server-only.
**Deps:** P1-E03-S03.

### P1-E04-S05 — Paystack webhook (signature + replay protection)
**JTBD:** As the system, I must trust Paystack webhooks cryptographically and accept each one only once.
**AC:**
- AC1: `POST /webhooks/paystack` verifies `x-paystack-signature` via HMAC-SHA512 with secret; constant-time compare.
- AC2: Invalid signature → 401, no DB writes.
- AC3: `paystack_event.id UNIQUE`; replay → 200 OK, no work.
- AC4: `charge.success` event → `wallet.post(topup)`.
**Tech:** `packages/payments/paystack/verify.ts` with timing-safe compare.
**Tests:** Tampered payload rejected; replay returns 200 without re-posting.
**Deps:** S04.

### P1-E04-S06 — Cash top-up by Reception
**JTBD:** As Reception, I want to record a cash top-up at the counter.
**AC:**
- AC1: Reception selects parent → "Cash top-up" → enters amount → confirms.
- AC2: Posts to `wallet_ledger` with `kind='topup'`, `source='cash:reception'`, `posted_by=reception_user_id`.
- AC3: Receipt printed + SMS-stub sent.
- AC4: Treasury reconciliation (P1-E06) expects this as cash float.
**Deps:** P1-E03-S03, P1-E05, P1-E08.

### P1-E04-S07 — Bank transfer top-up (admin-confirmed)
**JTBD:** As admin, I want to credit a parent's wallet against a bank transfer they've made.
**AC:**
- AC1: `bank_transfer_pending` table captures pending notifications (manual entry by admin or future bank API).
- AC2: Admin matches a transfer to a parent → confirms → `wallet.post(topup)` with `source='bank:manual'`.
- AC3: Parent SMS-stub notified.
**Tech:** No automated bank reconciliation in P1; manual entry only.
**Deps:** P1-E03-S03.

---

## P1-E05 — Reception Operator Surface *(heartbeat)*

### P1-E05-S01 — Search parent by phone or name in ≤300ms
**JTBD:** As Reception, I want to find a parent in one keystroke so I don't make a queue.
**AC:**
- AC1: Search field auto-focused on page load; supports phone (any format) and partial name.
- AC2: Debounced 200ms; results render ≤300ms p95 with 10k parents in fixtures.
- AC3: Results show: name, phone (last 4), wallet balance, outstanding amount, last visit date.
- AC4: Click → parent profile in same page (no full reload).
**Tech:** Trigram index on `parents.name`; index on `parents.phone_normalized`.
**Deps:** P1-E02.

### P1-E05-S02 — Parent profile header with wallet + outstanding + auto-credit toggle
**JTBD:** As Reception, I want all the financial facts about a parent visible without scrolling.
**AC:**
- AC1: Header shows: name, phone (full), wallet balance (KES), outstanding amount (red if > 0), auto-credit toggle (admin-only).
- AC2: Numbers refresh on every page action; no stale state.
- AC3: Outstanding amount click → modal listing open invoices.
**Tech:** Compound: `<ParentHeader parent={parent}/>`.
**Deps:** S01, P1-E03.

### P1-E05-S03 — Reception top-up (cash / M-Pesa / Paystack)
**JTBD:** As Reception, I want to take a top-up from a parent in any payment method.
**AC:**
- AC1: "Top up" CTA opens a sheet: amount field, method picker (Cash / M-Pesa STK / Paystack card / Bank transfer).
- AC2: M-Pesa STK triggers parent's phone — Reception sees status updating live.
- AC3: Cash route prints receipt immediately.
- AC4: Audit logged with method.
**Deps:** S01, S02, P1-E04.

### P1-E05-S04 — Record a service visit
**JTBD:** As Reception, I want to record that a child attended a service, attribute it to a staff member, and let the system handle payment.
**AC:**
- AC1: Service picker (loaded from `services`, active only) → child picker (parent's children) → staff attribution picker (loaded from `staff`, active only).
- AC2: Snapshot of staff name + rate stored on the booking row (`staff_name_snapshot`, `staff_rate_snapshot`).
- AC3: Confirm → `bookings` row + `invoices` row → immediate check-in → `wallet.debit` per P1-E03-S05.
- AC4: If wallet insufficient + auto-credit off → user warned + booking still proceeds + outstanding created.
**Tech:** No double-booking check yet (P2 for time-slot booking; P1 records arrivals).
**Deps:** S01–S03, P1-E03, P1-E07.

### P1-E05-S05 — Recent transactions panel
**JTBD:** As Reception, I want to see a parent's last 10 transactions to answer "did this go through?".
**AC:**
- AC1: Panel below header; latest 10 ledger entries with date, kind, amount, balance after.
- AC2: "View full statement" link → P1-E03-S08 export.
**Deps:** S02.

### P1-E05-S06 — Print + SMS-stub receipt from Reception
**JTBD:** As Reception, I want to print or text a receipt to a parent after a transaction.
**AC:**
- AC1: After any payment, a "Print" + "SMS" button pair appears.
- AC2: Print uses browser's default printer (Decision 13).
- AC3: SMS uses stub adapter (P1-E09).
- AC4: Reprint available from the transaction history at any time.
**Tech:** Print template uses `ReceiptPreview` compound from `packages/ui`.
**Deps:** P1-E08, P1-E09.

---

## P1-E06 — Treasury & Float Segregation

### P1-E06-S01 — Configure float accounts (per till / per bank)
**JTBD:** As admin, I want to declare which accounts hold customer wallet float so the system can reconcile against them.
**AC:**
- AC1: `float_accounts` table: name, kind (`mpesa_till` | `bank` | `cash_drawer`), opening balance, opening date.
- AC2: Admin CRUD with audit.
- AC3: Each top-up entry tags a `float_account_id` based on payment method.
**Tech:** Migration adds `wallet_ledger.float_account_id`. Backfill historical entries to "default" account at deploy time (will be empty in P1).
**Deps:** P1-E03, P1-E10.

### P1-E06-S02 — Daily reconciliation screen
**JTBD:** As admin, I want to see at-a-glance whether customer wallet liability matches the float in our accounts.
**AC:**
- AC1: One screen, three columns: float account name, system-tracked balance, real-world balance (manual input today, API in P5).
- AC2: Drift column: `system − real`; > KES 100 → red banner.
- AC3: "Add adjusting entry" CTA opens a form: amount, account, reason, posted by, dual-approval (admin + treasury role).
- AC4: All adjustments audited; reversing-entry pattern.
**Tech:** `customer_wallet_liability = SUM(wallet_ledger.amount)` grouped by `float_account_id`.
**Deps:** S01, P1-E03.

### P1-E06-S03 — Treasury role + permissions
**JTBD:** As admin, I want only the accountant to be able to approve adjusting entries.
**AC:**
- AC1: New role `treasury` seeded.
- AC2: Permission `treasury.approve_adjustment` granted to `treasury` and `super_admin`.
- AC3: Reconciliation screen accessible to `admin`, `treasury`, `super_admin`; adjustment approval requires the permission.
**Deps:** P1-E01-S06.

### P1-E06-S04 — Export float reconciliation for the accountant
**JTBD:** As the accountant, I want a CSV of daily liability vs float so I can reconcile in Excel.
**AC:**
- AC1: Date-range picker; export as CSV.
- AC2: Columns: date, account, system balance, real balance, drift, adjustments made that day.
**Deps:** S02.

---

## P1-E07 — Service Catalogue & Pricing

### P1-E07-S01 — CRUD services with effective-dated price history
**JTBD:** As admin, I want to manage the list of paid services and their prices without code changes.
**AC:**
- AC1: `services` table: name, description, unit (`play`, `talent`, `salon`, `coaching`, `event`), is_active, attribution_role_required (nullable).
- AC2: `service_prices` table: service_id, amount_cents, effective_from, effective_to (nullable).
- AC3: Creating a price change preserves the old row (sets `effective_to`) and inserts a new one.
- AC4: Lookup at booking time uses the row matching `booking_date`.
- AC5: Audit on every change.
**Tech:** `packages/catalog/services.ts`. No deletes — soft-delete via `is_active=false`.
**Deps:** P1-E10.

### P1-E07-S02 — Attribution role per service
**JTBD:** As admin, I want each service to declare whether it needs a staff attribution slot (stylist for salon; instructor for talent; none for events).
**AC:**
- AC1: `services.attribution_role` ENUM nullable.
- AC2: If non-null, Reception's booking flow forces a `staff` pick from that role's active members.
- AC3: If null, attribution is optional.
**Deps:** S01.

### P1-E07-S03 — Staff data records (no logins)
**JTBD:** As admin, I want to maintain a list of stylists, instructors and attendants for attribution and (future) commission.
**AC:**
- AC1: `staff` table: display_name, role (`stylist`|`instructor`|`attendant`|`coach`|`event_staff`), active, terminated_at.
- AC2: Admin CRUD; no auth association.
- AC3: Commission rate handled separately in P3-E01.
- AC4: Renames preserve historical snapshots (see Reception story S04).
**Deps:** P1-E10.

### P1-E07-S04 — VAT / tax flag per service
**JTBD:** As accountant, I want each service to declare its tax treatment so receipts and reports show VAT correctly.
**AC:**
- AC1: `services.tax_treatment` ENUM (`vat_inclusive`, `vat_exclusive`, `vat_exempt`, `zero_rated`).
- AC2: Receipt engine (P1-E08) shows line-tax accordingly.
- AC3: Default `vat_exempt` (KRA registration deferred).
**Deps:** S01.

---

## P1-E08 — Receipt Engine (KRA-shaped)

### P1-E08-S01 — Receipt schema with nullable eTIMS fields
**JTBD:** As a developer, I want the receipt model to be KRA-shaped today so eTIMS is a writer swap, not a migration.
**AC:**
- AC1: `receipts` table: id, sequence_number, parent_id, total, tax_total, payment_method, posted_by, created_at, **and** KRA fields: pin (nullable), control_unit_number (nullable), cu_invoice_number (nullable), qr_data (nullable), etims_status (nullable enum).
- AC2: `receipt_lines`: receipt_id, service_id or product_id, quantity, unit_price, line_tax, line_total.
- AC3: `sequence_number` is unique per receipt series (humans see series like `BM-2026-000123`).
**Tech:** Migration only — no rendering yet.
**Deps:** P1-E03, P1-E07.

### P1-E08-S02 — Receipt writer (interface)
**JTBD:** As a developer, I want one function to render a receipt so swapping for eTIMS is a one-place change.
**AC:**
- AC1: `packages/payments/receipts/index.ts` exports `writeReceipt(payload): Receipt` interface.
- AC2: Default implementation: `LocalReceiptWriter` (no KRA fields filled).
- AC3: Future: `EtimsReceiptWriter` implements the same interface and fills KRA fields.
**Deps:** S01.

### P1-E08-S03 — Receipt PDF render
**JTBD:** As Reception, I want to give a parent a clean printed receipt.
**AC:**
- AC1: A4 / 80mm thermal templates rendered server-side.
- AC2: Brand: logo + colours; uses `ReceiptPreview` compound for consistency with the SMS plain-text variant.
- AC3: Includes: business details, sequence number, date, items, totals, payment method, customer phone (last 4).
**Tech:** Puppeteer or `react-pdf`; thermal template is plain text with fixed-width formatting.
**Deps:** S02, X7.

### P1-E08-S04 — Receipt reprint
**JTBD:** As Reception, I want to reprint or re-SMS a receipt at any time.
**AC:**
- AC1: From transaction history → "Reprint" or "Re-send SMS".
- AC2: Reprints audited (`receipt.reprinted`).
- AC3: Receipt content is immutable — reprint is byte-identical.
**Deps:** S03.

### P1-E08-S05 — Receipt void (reversing entry)
**JTBD:** As admin, I want to void a wrong receipt without deleting it.
**AC:**
- AC1: Void creates a new receipt row with `kind='void'`, `reverses_receipt_id` FK.
- AC2: Net total of the original + void = 0; both visible in audit.
- AC3: Cannot void an already-voided receipt.
**Deps:** S01.

---

## P1-E09 — SMS Stub Adapter + Config

### P1-E09-S01 — Adapter interface + stub implementation
**JTBD:** As a developer, I want to write code as if SMS already works, knowing the stub captures everything for later.
**AC:**
- AC1: `packages/sms/index.ts` exports `send({to, template, data})` → returns a queued ID.
- AC2: Stub impl writes a row to `sms_outbox` with rendered body; doesn't call any external API.
- AC3: All product code uses this interface; provider switch in P5-E03 is a one-line config flag.
**Deps:** none (foundational).

### P1-E09-S02 — Admin config table for sender ID + URL + key
**JTBD:** As admin, I want to store the SMS provider config once a sender ID is registered.
**AC:**
- AC1: `sms_config` table: sender_id, api_url, api_key_ref (env var name, not the literal key), is_active.
- AC2: Admin CRUD; secret value never returned in API responses.
- AC3: Validation: api_url must be HTTPS and not point to RFC1918 / localhost / cloud metadata IPs.
- AC4: Only one row may be `is_active=true`.
**Tech:** SSRF allowlist — confirmed during Winston's review.
**Deps:** P1-E10.

### P1-E09-S03 — Templates registered + versioned
**JTBD:** As admin, I want to see (and later edit) every SMS template in one place.
**AC:**
- AC1: `sms_templates` table: key (e.g. `topup.success`), body (with `{placeholders}`), language (`en`), version, is_active.
- AC2: Code references templates by key; never by inline string.
- AC3: Admin view (read-only in P1; editable in P2).
**Deps:** S01.

---

## P1-E10 — Admin Console Shell & RBAC

### P1-E10-S01 — Nav shell + role-gated routes
**JTBD:** As any logged-in staff user, I want to see only the menus and pages my role can use.
**AC:**
- AC1: Side nav rendered server-side from the user's permission set.
- AC2: Direct-URL access to a forbidden route → 403 page with "Switch role" link.
- AC3: Header shows: current user, role badge, current float status (green/red dot from P1-E06), logout.
**Deps:** P1-E01-S04, S06.

### P1-E10-S02 — User management (staff CRUD)
**JTBD:** As super-admin, I want to create staff logins and assign roles.
**AC:**
- AC1: Create staff: email, name, role(s), initial password (auto-generated, must change on first login).
- AC2: Edit: role(s), active flag.
- AC3: Reset password: generates a one-time link sent via SMS-stub or shown on screen for super-admin.
- AC4: Audit all changes.
**Deps:** P1-E01-S03, S06.

### P1-E10-S03 — Audit log viewer
**JTBD:** As admin, I want to search the audit log to investigate disputes.
**AC:**
- AC1: Searchable by actor (user), action, target ID, date range.
- AC2: Pagination; CSV export.
- AC3: Audit log itself is read-only — no edits, no deletes.
**Tech:** Read from the projection table populated by X5.
**Deps:** X5.

### P1-E10-S04 — Settings sub-app
**JTBD:** As admin, I want a single Settings area for system-wide configuration.
**AC:**
- AC1: Settings sections: SMS config, float accounts, loyalty rates, branding (logo/colours), receipt branding.
- AC2: Read/write by `admin`, `super_admin`; some sub-sections need `treasury`.
- AC3: Settings changes audited.
**Deps:** S01, X5.

---

## P1-E11 — Parent Dashboard MVP

### P1-E11-S01 — Wallet page (balance + outstanding + statement)
**JTBD:** As a parent, I want to see what's in my wallet and what I owe at a glance.
**AC:**
- AC1: Hero: large wallet balance, smaller outstanding indicator (if > 0), auto-credit status indicator (read-only here — admin sets).
- AC2: "Top up" CTA opens method picker (M-Pesa STK / Paystack card / Bank transfer).
- AC3: Last 10 transactions visible; "View full statement" → CSV download.
- AC4: Loyalty points balance shown read-only (earn-only in P1).
**Tech:** `WalletBalanceCard` compound; identical render to admin Reception header.
**Deps:** P1-E03, P1-E04, X7.

### P1-E11-S02 — Children list and profile management
**JTBD:** As a parent, I want to add and edit my children from my dashboard.
**AC:**
- AC1: List view with child cards (name, age in months, allergies summary).
- AC2: Add child / edit child / archive child flows.
- AC3: Soft-deleted children visible under "Archived" with restore.
**Deps:** P1-E02.

### P1-E11-S03 — Top-up flow from dashboard
**JTBD:** As a parent, I want to top up via the dashboard without going to Reception.
**AC:**
- AC1: M-Pesa STK: enter amount → tap "Pay" → STK push to phone → live status → success state with new balance.
- AC2: Paystack card: redirect to hosted checkout → return → verifying → success.
- AC3: Bank transfer: instructions screen ("Send to X account; admin will confirm").
- AC4: Failures show clear remediation copy.
**Deps:** P1-E04.

### P1-E11-S04 — Profile & consent management
**JTBD:** As a parent, I want to update my details and consent preferences.
**AC:**
- AC1: Profile edit: name, email, area.
- AC2: Consents toggle: SMS marketing opt-in.
- AC3: PIN change flow (current PIN required).
- AC4: "Export my data" link (P1-E02-S05).
**Deps:** P1-E02, P1-E01.

### P1-E11-S05 — Bottom nav + mobile-first shell
**JTBD:** As a parent on a phone, I want quick taps to Home / Wallet / Children / Profile.
**AC:**
- AC1: 4-tab bottom nav on mobile; sidebar on desktop.
- AC2: All routes load < 1s on a throttled 3G fast profile.
- AC3: Initial JS < 200 KB (gzipped).
**Tech:** `ParentShellLayout` compound.
**Deps:** X7.

---

## P1-E12 — Marketing & Landing (public route group)

### P1-E12-S01 — Home page
**JTBD:** As a first-time visitor, I want to understand Baby Milestones in 8 seconds and tap to sign up.
**AC:**
- AC1: Hero: real photo of a real child + headline + visible CTA ("Top up & book").
- AC2: 4-icon unit strip below hero (Play / Talent / Salon / Toy Shop — Toy Shop icon links out to the WooCommerce site).
- AC3: No carousel.
- AC4: SSR for SEO; LCP < 2s on 3G.
**Tech:** `apps/platform/app/(public)/page.tsx`.
**Deps:** X7.

### P1-E12-S02 — Per-unit pages
**JTBD:** As a visitor, I want a page per unit with what it offers and a "Book now" CTA.
**AC:**
- AC1: Pages: `/play`, `/talent`, `/salon`, `/events`, `/coaching`. Toy shop is an **external link** to the standalone WooCommerce site (not a `/shop` route in this app).
- AC2: Each: photo, short copy, examples, "Book now" CTA → signup if not logged in.
- AC3: Content sourced from MDX or DB (admin-editable in P5 polish).
**Deps:** S01.

### P1-E12-S03 — Deep-link from WhatsApp ads
**JTBD:** As a marketing manager, I want to link from a WhatsApp ad straight to the right booking flow.
**AC:**
- AC1: URL pattern `/book/[unit]?utm_*` captures UTM and pre-selects the unit.
- AC2: UTM persisted to parent on signup for attribution.
**Tech:** `utm_*` stored on `parents.acquisition_source`.
**Deps:** S02, P1-E02.

### P1-E12-S04 — Sign-in / sign-up entry points
**JTBD:** As a visitor, I want a clear way to sign in or create an account from anywhere on the marketing site.
**AC:**
- AC1: Header: "Sign in" + "Sign up" CTAs visible on all public pages.
- AC2: After auth, redirect honours intended destination (e.g., back to `/book/talent`).
- AC3: Auth UI uses the parent flow (phone + PIN).
**Deps:** P1-E01.

---

## X5 — Audit Log (outbox pattern)

### X5-S01 — `audit_outbox` table + write helper
**JTBD:** As a developer, I want to record an audit event in the same transaction as the business write without slowing it down.
**AC:**
- AC1: `audit_outbox` table: id, actor_user_id, action, target_table, target_id, payload JSONB, created_at, processed_at NULLABLE.
- AC2: Helper `audit({ actor, action, target, payload })` insertable in any TX.
- AC3: Outbox row is the durable audit guarantee.
**Deps:** none.

### X5-S02 — Async drain worker → `audit_log` projection
**JTBD:** As an investigator, I want fast, queryable audit history.
**AC:**
- AC1: Worker in `apps/jobs` polls `audit_outbox` every 5s.
- AC2: Writes to projection table `audit_log` with indexes on `(actor)`, `(target_table, target_id)`, `(action)`, `(created_at)`.
- AC3: Marks outbox rows `processed_at` on success.
- AC4: Failures retried with exponential backoff; dead-lettered after 24h.
**Deps:** S01, X8 (jobs runner).

### X5-S03 — Audit catalogue (what gets audited)
**JTBD:** As a security reviewer, I want a definitive list of audited actions.
**AC:**
- AC1: Documented in `packages/auth/audit-actions.ts` as a typed enum.
- AC2: Initial set: all auth events, all role changes, all ledger postings, refund actions, settings changes.
- AC3: NOT audited: reads, list-views, page navigation.
**Deps:** S01.

---

## X7 — Design System Foundation

### X7-S01 — Tailwind preset with brand tokens
**JTBD:** As a developer, I want one preset that every app extends so colours and spacing don't drift.
**AC:**
- AC1: `packages/config/tailwind.preset.cjs` exports tokens: primary palette, neutrals, semantic (success/warn/danger), spacing scale, radii, type scale.
- AC2: All apps' `tailwind.config.cjs` extends the preset.
- AC3: Token swap re-skins the whole suite.
**Deps:** none.

### X7-S02 — Primitive components
**JTBD:** As a developer, I want a primitive library that handles a11y + Kenya-specific inputs.
**AC:**
- AC1: `Button`, `Input`, `MoneyInput` (KES, integer cents internal), `PhoneInput` (KE flag + format), `OTPInput`, `BottomSheet`, `Toast`, `Spinner`, `Skeleton`, `ChipGroup`.
- AC2: All keyboard-accessible; visible focus ring; WCAG AA contrast.
- AC3: Storybook entries for each.
**Deps:** S01.

### X7-S03 — Compound components for P1 surfaces
**JTBD:** As a developer, I want load-bearing UI patterns standardised.
**AC:**
- AC1: `WalletBalanceCard`, `ChildCard`, `MpesaPushPrompt`, `ReceiptPreview`, `ParentShellLayout`, `StaffShellLayout`.
- AC2: Each consumes typed props from `packages/contracts`.
- AC3: Snapshot tests cover the visual contract.
**Deps:** S02.

### X7-S04 — Brand assets pipeline
**JTBD:** As a designer, I want one place to drop logo + colours so every surface reflects the brand.
**AC:**
- AC1: `packages/ui/brand/` holds logo SVGs and colour overrides.
- AC2: Receipt PDFs (P1-E08) and SMS-stub bodies (P1-E09) consume the same brand strings.
**Deps:** S01.

---

## X8 — Observability, Backups, CI/CD

### X8-S01 — Structured logging + error tracking
**JTBD:** As on-call, I want to know about errors within 5 minutes of them happening.
**AC:**
- AC1: `pino` JSON logs in all apps; correlation ID per request.
- AC2: Sentry-equivalent error tracker capturing API + frontend errors.
- AC3: Alert rules: any error rate > 1%/5min, any payments webhook failure, any ledger insert failure.
**Deps:** none.

### X8-S02 — Health endpoints
**JTBD:** As a load balancer, I want a fast health check that tells me an app is alive.
**AC:**
- AC1: `/health/live` (process up) and `/health/ready` (DB reachable, Redis reachable) on every app.
- AC2: Returns < 100ms p95.
**Deps:** none.

### X8-S03 — Daily DB backup + retention
**JTBD:** As admin, I want a backup of yesterday's data, every day, automatic.
**AC:**
- AC1: Daily snapshot to off-host storage.
- AC2: Retention fixed at 30 days in P1 (Decision 35).
- AC3: `backup_runs` table records every run + result.
- AC4: Restore drill rehearsed at commissioning (manual procedure documented).
**Deps:** none.

### X8-S04 — CI/CD pipelines (per app)
**JTBD:** As a developer, I want every PR built and tested and every main merge deployed.
**AC:**
- AC1: PR pipeline: lint, type-check, unit + integration tests, build all apps.
- AC2: Migrations applied in a gated step before deploy.
- AC3: Preview environments for PRs (one per PR).
- AC4: One-click rollback documented and rehearsed.
**Deps:** none.

---

## Story landing order (first 30 PRs)

Aligned with Amelia's commits/ checklist; expanded with story refs:

```
01. X7-S01      Tailwind preset
02. P1-E01-S01  Parent signup (phone+PIN)
03. P1-E01-S02  Parent login
04. P1-E01-S03  Staff login
05. P1-E01-S04  SSO across subdomains
06. P1-E01-S06  Roles + permissions seed
07. X5-S01      Audit outbox table + helper
08. X7-S02      Primitives
09. P1-E03-S01  Ledger schema (immutable)
10. P1-E03-S02  Balance = SUM (computed)
11. P1-E03-S03  Idempotent posting
12. P1-E03-S04  FIFO settlement (tests first)
13. P1-E04-S01  M-Pesa STK initiate
14. P1-E04-S02  M-Pesa callback (idempotent)
15. P1-E04-S03  STK reconciliation cron
16. P1-E04-S04  Paystack init
17. P1-E04-S05  Paystack webhook
18. P1-E02-S01  Parent profile
19. P1-E02-S03  Children CRUD
20. P1-E07-S03  Staff data records
21. P1-E07-S01  Service catalogue + price history
22. P1-E03-S05  Check-in debit
23. P1-E05-S01  Reception search
24. P1-E05-S04  Reception record visit
25. P1-E03-S06  Refund recording
26. P1-E03-S07  Auto-credit toggle
27. P1-E06-S01  Float accounts
28. P1-E06-S02  Daily reconciliation screen
29. P1-E08-S01  Receipt schema
30. P1-E08-S03  Receipt PDF + reprint
```

Remaining ~40 stories land after PR #30 in parallel tracks (parent dashboard, marketing site, X8, settings).

---

## Definition of Done (every story)

A story is **Done** when:
1. Code reviewed by another engineer.
2. All AC have a passing test (unit, integration, or E2E as appropriate).
3. New tables / columns have migrations + are additive-only.
4. Audited actions write to `audit_outbox`.
5. Deployed to staging.
6. PM + designer walked through the staging build for the affected surface.
7. No regression in `e2e/` suite.

---

*End of P1 stories. P2–P5 stories will be written just-in-time per BMAD convention — each phase's stories sliced when the phase begins.*
