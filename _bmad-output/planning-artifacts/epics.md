# Baby Milestones — Epic Backlog

*Source spec: `Baby-Milestones-Spec.md` v2.1 · 36 locked decisions · prepared in BMAD party-mode round*

This document is the build-from artifact. Every epic traces back to a spec section and a locked decision. Estimates are conservative; effort assumes one full-stack squad (3–4 engineers + 1 designer + PM) working in parallel on independent epics.

---

## 1. Monorepo Layout

```
baby-milestones/
├── apps/
│   ├── api/          # Node/TS — single API surface, all business logic, webhooks
│   ├── platform/     # Next.js — public landing (marketing) + authed parent dashboard
│   ├── pos/          # Next.js — browser POS for toy shop counter; also syncs WooCommerce orders + stock
│   ├── admin/        # Next.js — admin + Reception operator + Treasury + RBAC console
│   └── jobs/         # Node worker — SMS retry, commission run, anonymisation, M-Pesa callback recovery, WooCommerce sync
├── packages/
│   ├── db/           # Drizzle/Prisma schema + migrations (single shared schema, single DB)
│   ├── wallet/       # Ledger primitives: debit/credit/hold/release, FIFO settlement, idempotency
│   ├── payments/     # Adapter pattern: mpesa, paystack, cash; unified Charge interface
│   ├── catalog/      # Product, stock, price, SKU — used by pos; stock pushed to WooCommerce
│   ├── sms/          # Provider-agnostic sender; stub adapter ships at launch
│   ├── auth/         # Phone+PIN, SSO session via opaque token, role guards
│   ├── ui/           # Tailwind components, design tokens, primitives + compounds
│   ├── contracts/    # Zod schemas + TS types shared between API and apps
│   └── config/       # eslint, tsconfig, tailwind preset
└── infra/            # Docker, deploy manifests, env templates
```

**Subdomain routing at the edge:**
`pos.*` → pos · `admin.*` → admin · `api.*` → api · apex → platform.

**Online toy shop:** runs on a **standalone WooCommerce** site (own hosting, own auth, own checkout, own payments via Woo's M-Pesa plugin). Not part of this monorepo. The only integration is a periodic sync from the POS:
- **Pull:** POS fetches new WooCommerce orders for in-store dispatch.
- **Push:** POS pushes stock-level updates to WooCommerce (POS is source of truth; physical-shop stock = online stock — single pool, no overselling).
- **No SSO**, **no wallet integration**, **no loyalty** on Woo purchases.

**Database:** single PostgreSQL DB, **single shared schema** (Decision 16). Domain tables unprefixed; payment-provider tables prefixed (`mpesa_*`, `paystack_*`).

---

## 2. Phase Plan

| Phase | Theme | Estimate | MVP demo at end? |
|---|---|---|---|
| **P1** | Foundation + Wallet + Parent Account | 12–14 wks | ✅ Parent tops up, books, gets debited, admin reconciles |
| **P2** | Bookings, Subscriptions, POS, Loyalty Redemption | 8–10 wks | Play & Talent live; in-store toy POS live (no online orders yet) |
| **P3** | Commission, Salon, Loyalty Engine, Reporting | 8–10 wks | Salon live, monthly commission runs, loyalty redemption end-to-end |
| **P4** | WooCommerce Sync + Events Ticketing | 3–4 wks | WooCommerce site live (separate build); POS pulls online orders + syncs stock; recital tickets |
| **P5** | Coaching, eTIMS, SMS Go-Live, Polish | 6–8 wks | All 7 units live; live SMS; eTIMS swap done |

**Total:** ~9–11 months end-to-end with current scope (revised after WooCommerce decision shrank P4).

---

## 3. Cross-Cutting Epics (the spine)

These thread through every phase. P1 ships the foundation; later phases harden.

### X1 — Identity & SSO
One credential set works across `platform`, `admin`, `pos`. Role determines accessible app. (The WooCommerce online shop is out of scope — it has its own auth.)
**Owns:** `packages/auth`, session middleware, cookie domain `.babymilestones.co.ke`, CSRF.
**Decision refs:** 17.

### X2 — Wallet & Ledger
Immutable append-only `wallet_ledger`. FIFO outstanding-invoice settlement. Auto-credit toggle off by default. Bookings always proceed.
**Owns:** `packages/wallet`, `wallets`, `wallet_ledger`, `invoices`.
**Decision refs:** 18, 20, 31, 32.

### X3 — Payments Adapter
M-Pesa Daraja (STK + C2B callback + stkpushquery recovery), Paystack (init + webhook + replay protection), cash (manual entry), bank transfer (admin-confirmed).
**Owns:** `packages/payments`, `mpesa_*`, `paystack_event`, `bank_transfer_pending`.
**Decision refs:** 9, plus M-Pesa technical reality.

### X4 — Notifications & SMS Stub
Stub adapter logs to DB at launch; admin config table (Sender ID, API URL, API key). Templates registered + versioned. Email fallback.
**Owns:** `packages/sms`, `sms_outbox`, `sms_config`.
**Decision refs:** 19. **Live integration is P5-E02.**

### X5 — Audit Log (outbox pattern)
Business transactions write to `audit_outbox` (cheap, same-shard). Async worker projects into `audit_log`. Audit mutations + auth events + role changes + refunds + manual ledger adjustments. Don't audit reads.
**Owns:** `audit_outbox`, `audit_log`, drain worker in `apps/jobs`.

### X6 — Loyalty Engine
Earn on settled payments only. Configurable earn + redeem rates. Proportional refund clawback with negative-balance carry.
**Decision refs:** 11, 21, 22. **Earn ledger ships P1; redemption UI ships P2; clawback rules harden in P3.**

### X7 — Design System (`packages/ui`)
Primitives: Button, Input, MoneyInput, PhoneInput, OTPInput, EmojiPicker, ChipGroup, BottomSheet, Toast, Spinner.
Compounds: WalletBalanceCard, ChildCard, BookingSlotPicker, MpesaPushPrompt, LoyaltyChip, ReceiptPreview, StaffShellLayout, ParentShellLayout.
**WalletBalanceCard must render identically across platform header, receipt, SMS, admin Reception screen.** Data contract, not a design rule.
**Decision refs:** 7.

### X8 — Observability, Backups, CI/CD
Structured logs, Sentry-class error tracker, health endpoints, daily PITR-capable backup (fixed 30-day retention in P1), per-app build pipelines, gated migrations, preview environments.
**Decision refs:** 35.

---

## 4. Phase 1 — Foundation + Wallet + Parent Account *(MUST-HAVE-AT-LAUNCH set)*

> Demo at end of P1: a parent self-registers, tops up via M-Pesa, books a session via Reception, gets debited on check-in, sees the transaction in their dashboard, admin reconciles wallet float against the segregated till. Everything below is required for that demo to be true.

### P1-E01 — Identity & SSO Foundation
*Apps: `api`, all apps · Deps: none · Blocks: everything*
- **JTBD:** One login gets a parent or admin into any surface they're allowed in.
- **Stories:** parent signup w/ phone + PIN + optional email; parent login; admin login; role/permission model; session refresh across apps; password reset via SMS-stub OTP (becomes live in P5).
- **AC:** SSO cookie on `.babymilestones.co.ke`, `SameSite=Lax`, `Secure`, `HttpOnly`; opaque-token sessions in Redis; role table seeded (parent, reception, cashier, packer, accountant, admin, super-admin); audit log on auth events; rate-limit on login (5 attempts / 5 min); logout invalidates session across all apps; role change forces re-login.
- **Hidden complexity:** CSRF (double-submit cookie) on state-changing routes; session invalidation on role mutation.

### P1-E02 — Parent & Child Registry
*Apps: `api`, `platform`, `admin` · Deps: E01*
- **JTBD:** A parent (or Reception on their behalf) registers a household and its children once, reuses forever.
- **Stories:** parent self-registers; Reception registers walk-in parent; add/edit child (name, DOB, allergies, photo consent); sibling linkage; soft-delete; data-export view.
- **AC:** phone number is canonical key; duplicate-phone detection w/ merge prompt at Reception; child DOB powers age-stage filters downstream; consent flags captured (SMS, marketing, photo).

### P1-E03 — Wallet Ledger Core *(spine)*
*Apps: `api` (in `packages/wallet`) · Deps: E01, E02*
- **JTBD:** Every shilling in and out of a parent's wallet is provable and immutable.
- **Stories:** top-up entry; debit entry; refund entry (reversing); negative-balance entry; balance query; statement export; idempotency key per posting; FIFO outstanding-invoice settlement on top-up.
- **AC:**
  - `wallet_ledger` append-only — Postgres role-level REVOKE on UPDATE/DELETE.
  - Corrections are reversing entries with `reverses_entry_id` FK.
  - Running balance computed via `SUM(amount) WHERE wallet_id = ?`; no cached balance column.
  - Every entry carries `posted_by`, `source`, `idempotency_key`.
  - FIFO top-up settlement test cases: (top-up 2000, owed 800 → wallet=1200, invoice settled); (top-up 500, owed 800 → wallet=0, invoice partial w/ 300 remaining); (top-up 2000, owed [500, 400, 200] → wallet=900, all invoices settled).
  - Auto-credit toggle off by default per parent; admin sets per-parent.
  - Ledger reconciles to penny vs `customer_wallet_liability` GL.
- **Hidden complexity:** this is the spine — write tests **before** the implementation.

### P1-E04 — Payments: M-Pesa STK + Paystack Card + Cash + Bank Transfer
*Apps: `api`, `admin`, `platform` · Deps: E01, E03*
- **JTBD:** A parent's money lands in the wallet reliably from any supported channel, every time.
- **Stories:** M-Pesa STK push initiation; Daraja C2B callback handler; `stkpushquery` reconciliation cron (T+90s); Paystack inline init; Paystack webhook handler; manual cash entry by Reception; admin-confirmed bank transfer; failure/timeout recovery.
- **AC:**
  - M-Pesa state machine persisted: `INITIATED → STK_SENT → USER_ACCEPTED → CALLBACK_PENDING → SETTLED | TIMEOUT | FAILED`.
  - `CheckoutRequestID` is PK on `mpesa_stk_request`; callbacks idempotent (INSERT … ON CONFLICT).
  - Paystack `x-paystack-signature` verified HMAC-SHA512, constant-time compare; `paystack_event.id` UNIQUE for replay protection; 200 OK on duplicate, no work done.
  - Failed postings retried via outbox in `apps/jobs`.
- **Hidden complexity:** M-Pesa callbacks duplicate, arrive out of order, sometimes never. Express response can arrive *after* the callback (~3% of cases). Recovery cron is **required**, not optional.

### P1-E05 — Reception Operator Surface *(heartbeat)*
*Apps: `admin` · Deps: E01, E02, E03, E04, E07*
- **JTBD:** A walk-in is served in under 90 seconds.
- **Stories:** parent search by phone/name; see wallet balance + outstanding; top up wallet (cash / M-Pesa / Paystack); record a visit / service; toggle auto-credit per parent; view recent transactions; print + SMS-stub receipt.
- **AC:** keyboard-first UX; phone search returns ≤300ms; wallet balance live; outstanding amount + auto-credit toggle visible on parent header; every action posts to ledger via E03; English-only copy.

### P1-E06 — Treasury & Float Segregation
*Apps: `admin`, `api` · Deps: E03, E04*
- **JTBD:** Admin can prove wallet float is segregated from operating cash, daily.
- **Stories:** float-account configuration (per till / bank); daily reconciliation screen; drift alerts; manual adjusting entry with reason; treasury role.
- **AC:** `customer_wallet_liability` total = float balance ± float-in-transit; mismatch > KES 100 triggers banner; adjustments require dual approval (admin + treasury); exportable for the accountant.
- **Decision refs:** 27. **Non-negotiable for launch** — commingled cash is a regulatory landmine.

### P1-E07 — Service Catalogue & Pricing
*Apps: `api`, `admin` · Deps: E01*
- **JTBD:** A service has a name, a price, a tax treatment, and an attribution slot.
- **Stories:** CRUD service; price history (effective-dated); tax flag; attribution role (stylist / instructor / attendant); active/inactive toggle.
- **AC:** price changes versioned — historical visits keep old price; soft-delete only; attribution role optional per service.

### P1-E08 — Receipt Engine (KRA-shaped)
*Apps: `api`, `admin` · Deps: E03, E07*
- **JTBD:** Every settled payment produces a receipt the bookkeeper trusts and KRA will eventually accept.
- **Stories:** receipt template; sequential numbering per receipt-series; PDF render; SMS-stub link; reprint; void w/ reason.
- **AC:** schema includes KRA fields (PIN, control-unit number, CU invoice number, line-tax, QR placeholder) nullable at launch; writer is interface-shaped — eTIMS adapter is a swap in P5; voids are reversing entries, never deletions.
- **Decision refs:** 30.

### P1-E09 — SMS Stub Adapter + Config
*Apps: `api`, `admin` · Deps: E01*
- **JTBD:** System sends messages now via console/log; flip a config flag later to go live.
- **Stories:** adapter interface; admin config table (Sender ID, API URL, API key); template registry; send log.
- **AC:** `sms_outbox` row for every send attempt; templates versioned; email fallback when configured.
- **Decision refs:** 19.

### P1-E10 — Admin Console Shell & RBAC
*Apps: `admin` · Deps: E01*
- **JTBD:** Admin opens one app, sees only what their role permits.
- **Stories:** nav shell, role-gated routes, audit-log viewer, user management.
- **AC:** every mutation logged via X5 outbox; super-admin can impersonate w/ banner; settings sub-app present.

### P1-E11 — Parent Dashboard MVP
*Apps: `platform` · Deps: E01, E02, E03, E04*
- **JTBD:** A parent logs in and sees wallet, kids, recent transactions, top-up button.
- **Stories:** wallet page (balance, outstanding, auto-credit status, statement); child list; recent transactions; top-up CTA; loyalty balance read-only.
- **AC:** mobile-first; outstanding + auto-credit display in parity with admin Reception; statement paginated; bundle < 200KB initial JS; works on 3G.

### P1-E12 — Marketing & Landing (public route group)
*Apps: `platform` (public group) · Deps: X7*
- **JTBD:** A first-time visitor lands, understands the brand in 8 seconds, signs up.
- **Stories:** hero, unit pages, signup CTA, deep-links from WhatsApp ads to specific booking flows.
- **AC:** mobile-first; visible "Top up & book" CTA above fold; no carousel; 4-icon unit strip; SSR for SEO.
- **Decision refs:** 24.

### X1, X5, X7, X8 ship in P1 alongside the epics above.

**P1 MUST-HAVE-AT-LAUNCH:** E01–E12 + X1 + X5 + X7 + X8. **No nice-to-haves in P1.**

---

## 5. Phase 2 — Bookings, Subscriptions, POS, Loyalty Redemption

### P2-E01 — Booking Engine
*Apps: `admin`, `platform` · Deps: P1-E05, P1-E07*
Reception books on behalf; parent self-books from dashboard. Capacity rules. Attribution captured at booking and snapshotted on the row. **Wallet debit triggers at child check-in, not at booking** (Decision 31).
**AC:** booking creates a `pending` invoice; check-in calls `wallet.debit(invoice_id)` inside `SELECT … FOR UPDATE` on the wallet row; double-check-in blocked by unique index.

### P2-E02 — Subscription Plans (Play & Talent)
*Apps: `api`, `platform`, `admin` · Deps: P1-E03, P1-E04*
Recurring debit, prorated start, pause/cancel, carryover entitlement, dunning state machine.
**Decision refs:** 3.
**Hidden complexity:** dunning state machine; admin override for pause windows.

### P2-E03 — Pickup Authorisation & Free-Text Observations
*Apps: `admin` · Deps: P1-E02*
Authorised pickup list per child; daily attendant log; free-text observation entry (24-month retention, then anonymise — Decision 29).
**AC:** 5-emoji mood picker default-set to 😊; 3–4 chip tags configurable; free-text optional; voice-to-text button on tablet. Pickup-handoff target: 9 seconds.

### P2-E04 — POS App (in-store mode)
*Apps: `pos` · Deps: P1-E04, P1-E08*
Barcode scan → cash / M-Pesa / Paystack → receipt to default printer → live stock decrement. Tablet-first, landscape ≥768px.

### P2-E05 — Loyalty Redemption UI + Engine
*Apps: `platform`, `admin`, `api` · Deps: P1-E03*
Redemption toggle at checkout ("Use 340 points (save KSh 340)"). Engine settles points to wallet credit on application.
**Decision refs:** 11, 34.

### P2-E06 — Backup Retention Configurability
*Apps: `admin` · Deps: P1 X8*
Admin sets retention policy (e.g., 30 daily + 12 monthly). Decision 35 unlock.

### P2-E07 — Auto-credit & Outstanding Surface (parent app)
*Apps: `platform`, `admin` · Deps: P1-E11, P1-E09*
Threshold UX, SMS-stub nudge templates ("you owe KSh 800 — top up to keep your loyalty earning").

---

## 6. Phase 3 — Commission, Salon, Loyalty Engine, Reporting

### P3-E01 — Attribution & Commission Ledger
*Apps: `api`, `admin` · Deps: P1-E03, P1-E07*
Per-visit attribution → monthly commission run → admin-triggered ad-hoc payout export.
**Decision refs:** 15.

### P3-E02 — Stylist Commission Viewer (named, not auth)
*Apps: `admin` (sub-route, no auth wall) · Deps: P3-E01*
Shared Reception PC. Dropdown of active stylists. View this month's earnings. **No login.** Decision 14 specific.

### P3-E03 — Kids-Only Salon Flow
*Apps: `admin`, `platform` · Deps: P2-E01, P3-E01*
Stylist scheduling (no double-booking), commission attribution at checkout, counter payment.
**Decision refs:** 6.

### P3-E04 — Loyalty Engine: Clawback + Negative Carry
*Apps: `api` · Deps: P1-E03, P2-E05*
Proportional clawback on refund; insufficient-balance → negative loyalty entry repaid by future earnings.
**Decision refs:** 22.

### P3-E05 — Operational Reporting
*Apps: `admin` · Deps: across*
Daily ops dashboard; revenue by unit; attribution leaderboard; wallet aging report; outstanding-invoice ageing.

### P3-E06 — Jobs Runner
*Apps: `jobs` · Deps: X5, P3-E01*
Scheduled commission run, retention anonymisation worker, SMS retry, M-Pesa reconciliation cron.

---

## 7. Phase 4 — WooCommerce Sync + Events Ticketing

> **Scope change:** The online toy shop is **out of scope for this custom build** — it runs on a standalone WooCommerce site (separate project, separate hosting, separate auth, own M-Pesa plugin, no wallet, no loyalty). What remains in P4 is the **sync glue** so the in-store POS stays in lockstep with Woo on orders and stock, plus Events Ticketing.
>
> **Dropped from original P4:** P4-E01 (Catalogue & Inventory online), P4-E02 (Storefront & Checkout), P4-E03 (Delivery Methods Admin) — all handled by WooCommerce natively.

### P4-E04 — POS ↔ WooCommerce Sync
*Apps: `pos`, `jobs` · Deps: P2-E04 (POS in-store mode), `packages/catalog`*
- **Order pull:** Scheduled job (every N minutes) fetches new/updated WooCommerce orders via WC REST API → surfaces them in a "Online Orders" tab in POS. Live queue: New → Packing → Ready → Dispatched → Fulfilled. Status changes write back to Woo.
- **Stock push:** Whenever POS catalogue stock changes (sale, GRN, stock-take), push updated `stock_quantity` to the matching Woo product via REST. Stock is mapped by SKU.
- **Conflict policy:** POS is the source of truth for inventory. Woo orders that arrive for an out-of-stock SKU are flagged for manual handling, not auto-fulfilled.
- **No customer/account sync** — Woo customers stay in Woo.

### P4-E05 — Events & Recital Ticketing
*Apps: `platform`, `admin` · Deps: P1-E04*
Reading Corner events, Talent Center recitals. Guest checkout supported (Decision 28). Capacity; check-in by scan or manual list.

---

## 8. Phase 5 — Coaching, eTIMS, SMS Go-Live, Polish

### P5-E01 — Mom Coaching & Birth Doula
*Apps: `platform`, `admin` · Deps: P2-E01*
Coaching catalogue, 1:1 and group sessions, sensitive flow (discreet booking, private notes). Coach is a `staff` data record (no login).

### P5-E02 — eTIMS Writer Swap
*Apps: `api` · Deps: P1-E08*
Replace KRA-shaped receipt writer with live eTIMS adapter. **Writer swap — not a migration.**
**Decision refs:** 1, 30.

### P5-E03 — SMS Go-Live
*Apps: `api` · Deps: P1-E09*
Flip stub adapter to live provider (Africa's Talking, Twilio, or whatever the client registers with). Config table from P1-E09 is the connection point.
**Decision refs:** 19.

### P5-E04 — Feedback Engine
*Apps: `platform`, `admin` · Deps: P2-E01*
0–5 rating + optional comment after every paid touchpoint. Attached to unit + staff. Admin view by unit + by staff.
**Decision refs:** Module 7 of spec.

### P5-E05 — Advanced Reporting / Cohort Analytics
*Apps: `admin` · Deps: P3-E05*
Period-over-period comparisons; cohort retention; consolidated P&L; PDF + CSV exports.

### P5-E06 — Marketing Site Polish
*Apps: `platform` public group*
SEO, performance budget tightening, content management for unit pages.

---

## 9. P1 Engineering Notes *(from Amelia's sanity check)*

### 9.1 Tables required by end of P1

```
users, user_roles, sessions, audit_log, audit_outbox,
parents, children, staff, staff_rate_history,
wallets, wallet_ledger, wallet_ledger_invoice_settlement,
invoices, invoice_lines,
bookings, services, service_units,
mpesa_stk_request, mpesa_callback, paystack_event, bank_transfer_pending,
refunds, loyalty_ledger, loyalty_clawback,
sms_outbox, sms_config,
receipts, kra_etims_queue,
backup_runs
```

**~28 tables.** Migrations in `packages/db/migrations/`. Additive-only in P1 — no column renames in shipped tables.

### 9.2 Required test suites before P1 tag

- `packages/wallet/**` — unit, 100% branch coverage on ledger math
- `packages/payments/mpesa.contract.test.ts` — recorded Daraja sandbox fixtures
- `packages/payments/paystack.contract.test.ts` — webhook signature + replay rejection
- `apps/api/**.integration.test.ts` — testcontainers Postgres
- `e2e/wallet-topup-mpesa.spec.ts` — Playwright, sandbox creds
- `e2e/reception-walkin-booking.spec.ts`
- `e2e/checkin-autodebit.spec.ts`
- `e2e/refund-with-loyalty-clawback.spec.ts`

**No mocks for ledger math.** Real Postgres in CI.

### 9.3 Slip vectors (ranked, with mitigations)

1. **M-Pesa callback reliability** (wk 6–8 surprise) — build idempotency + recovery cron *before* the happy-path.
2. **Ledger correctness tests** (wk 5, +1 wk) — TDD, write the FIFO settlement cases first.
3. **`packages/ui` churn** — freeze the primitive set by wk 3; compounds iterate after.
4. **Safaricom Daraja prod credentials** (3–6 wk lead time, outside control) — apply on day 1; develop against sandbox.
5. **Reception walk-in flow** — phone-dedup merge UI is non-trivial; allocate full week.

### 9.4 First 10 PRs against an empty repo

```
1.  chore: scaffold monorepo + turbo + tsconfig
2.  feat(db): initial schema + drizzle setup
3.  feat(auth): phone+PIN signup, login, sessions
4.  feat(auth): SSO cookie + role middleware
5.  feat(ui): button, input, money, phone, otp
6.  feat(wallet): ledger primitives + balance query
7.  feat(wallet): topup settlement FIFO + tests
8.  feat(payments): mpesa stk + callback + recovery
9.  feat(payments): paystack init + webhook verify
10. feat(audit): outbox + drain worker
```

Land in order. Each green before the next opens. Red-green-refactor or it doesn't ship.

---

## 10. Open Items (non-blocking, default-applied)

| Ref | Item | Default applied |
|---|---|---|
| Delivery dispatch ops | Who physically dispatches online orders | Admin manually arranges courier; system tracks status; admin-configurable delivery method list (Decision 26). |
| Stylist rate-change policy | When commission rate changes mid-period | `staff_rate_history` effective-dated; bookings join on `effective_from ≤ booking.created_at < effective_to`. |
| Partial top-up against multiple invoices | What if top-up < total owed | FIFO partial settlement; oldest invoice partially settled, newer invoices remain fully open (Decision 32). |
| Photo consent UX | At signup or per-event | Captured at child registration (P1-E02), per-event override available later. |

---

## 11. Glossary

- **Wallet** — the parent's prepaid balance, held as `customer_wallet_liability` in segregated float.
- **Outstanding invoice** — a negative-balance entry; pending receivable.
- **Auto-credit** — per-parent toggle that allows wallet to go negative (Decision 18, 20).
- **Reception operator** — staff who run the booking platform on behalf of walk-in parents; the only staff role with a login besides admin/cashier/packer/accountant (Decision 14).
- **FIFO settlement** — top-ups apply against oldest outstanding invoice first (Decision 32).
- **KRA-shaped** — receipt schema has eTIMS fields present but nullable; the eTIMS adapter is a writer swap (Decision 30).
- **Stub adapter (SMS)** — logs to `sms_outbox` only; goes live in P5-E03.

---

*End of epic backlog. Pair with `Baby-Milestones-Spec.md` v2.1 for full functional context.*
