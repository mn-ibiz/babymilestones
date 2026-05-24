# Baby Milestones — Stories Index

*183 stories across 5 phases. Each story is a self-contained build unit (1–3 days for an engineer-pair).*

**Source artifacts:**
- Spec: `Baby-Milestones-Spec.md` v2.1 — 36 locked decisions, client-approved
- Epics: `epics.md` — 5 phases, 32 epics + 4 cross-cutting
- Phase consolidated story docs (read-only reference): `p1-stories.md`, `p2-stories.md`, `p3-stories.md`, `p4-stories.md`, `p5-stories.md`

---

## Story file conventions

Every story file follows this format:

```
# {ID} — {title}
**Status:** Ready for development
**Phase:** {phase label}
**Epic:** {epic ID — name}
**Estimate:** 1–3 days

## Job To Be Done
## Acceptance Criteria
## Technical Notes
## Tests
## Dependencies
## Definition of Done
## References
```

Story IDs are stable. Copy them as-is into Linear / Jira / GitHub Projects.

---

## Definition of Done (every story)

A story is **Done** when:
1. Code reviewed by another engineer.
2. All AC have a passing test (unit, integration, or E2E as appropriate).
3. Migrations are additive-only.
4. Audited actions write to `audit_outbox`.
5. Deployed to staging.
6. PM + designer walked through the staging build for the affected surface.
7. No regression in `e2e/` suite.

---

## P1 — Foundation + Wallet + Parent Account

*72 stories · 12–14 weeks · directory: `p1/`*

### P1-E01 — Identity & SSO Foundation

- [`P1-E01-S01`](p1/P1-E01-S01.md) — Parent signs up with phone + PIN
- [`P1-E01-S02`](p1/P1-E01-S02.md) — Parent logs in with phone + PIN
- [`P1-E01-S03`](p1/P1-E01-S03.md) — Admin / Reception / Cashier login
- [`P1-E01-S04`](p1/P1-E01-S04.md) — SSO across subdomains
- [`P1-E01-S05`](p1/P1-E01-S05.md) — Password / PIN reset by OTP
- [`P1-E01-S06`](p1/P1-E01-S06.md) — Role + Permission model seeded

### P1-E02 — Parent & Child Registry

- [`P1-E02-S01`](p1/P1-E02-S01.md) — Parent self-registers with profile details
- [`P1-E02-S02`](p1/P1-E02-S02.md) — Reception registers walk-in parent
- [`P1-E02-S03`](p1/P1-E02-S03.md) — Add and edit children
- [`P1-E02-S04`](p1/P1-E02-S04.md) — Photo and SMS consent flags
- [`P1-E02-S05`](p1/P1-E02-S05.md) — Data export for a parent's record

### P1-E03 — Wallet Ledger Core

- [`P1-E03-S01`](p1/P1-E03-S01.md) — Append-only `wallet_ledger` schema enforced at DB level
- [`P1-E03-S02`](p1/P1-E03-S02.md) — Balance is computed, never stored
- [`P1-E03-S03`](p1/P1-E03-S03.md) — Idempotent posting interface
- [`P1-E03-S04`](p1/P1-E03-S04.md) — Top-up applies FIFO to outstanding invoices, residual to wallet
- [`P1-E03-S05`](p1/P1-E03-S05.md) — Debit at check-in; pending invoice → settled
- [`P1-E03-S06`](p1/P1-E03-S06.md) — Refund recording (admin-only) creates a reversing entry
- [`P1-E03-S07`](p1/P1-E03-S07.md) — Auto-credit toggle per parent
- [`P1-E03-S08`](p1/P1-E03-S08.md) — Statement export (CSV) for a parent

### P1-E04 — Payments Adapter

- [`P1-E04-S01`](p1/P1-E04-S01.md) — M-Pesa STK push initiated from parent dashboard
- [`P1-E04-S02`](p1/P1-E04-S02.md) — M-Pesa C2B callback handler (idempotent)
- [`P1-E04-S03`](p1/P1-E04-S03.md) — STK reconciliation cron
- [`P1-E04-S04`](p1/P1-E04-S04.md) — Paystack card top-up
- [`P1-E04-S05`](p1/P1-E04-S05.md) — Paystack webhook (signature + replay protection)
- [`P1-E04-S06`](p1/P1-E04-S06.md) — Cash top-up by Reception
- [`P1-E04-S07`](p1/P1-E04-S07.md) — Bank transfer top-up (admin-confirmed)

### P1-E05 — Reception Operator Surface

- [`P1-E05-S01`](p1/P1-E05-S01.md) — Search parent by phone or name in ≤300ms
- [`P1-E05-S02`](p1/P1-E05-S02.md) — Parent profile header with wallet + outstanding + auto-credit toggle
- [`P1-E05-S03`](p1/P1-E05-S03.md) — Reception top-up (cash / M-Pesa / Paystack)
- [`P1-E05-S04`](p1/P1-E05-S04.md) — Record a service visit
- [`P1-E05-S05`](p1/P1-E05-S05.md) — Recent transactions panel
- [`P1-E05-S06`](p1/P1-E05-S06.md) — Print + SMS-stub receipt from Reception

### P1-E06 — Treasury & Float Segregation

- [`P1-E06-S01`](p1/P1-E06-S01.md) — Configure float accounts (per till / per bank)
- [`P1-E06-S02`](p1/P1-E06-S02.md) — Daily reconciliation screen
- [`P1-E06-S03`](p1/P1-E06-S03.md) — Treasury role + permissions
- [`P1-E06-S04`](p1/P1-E06-S04.md) — Export float reconciliation for the accountant

### P1-E07 — Service Catalogue & Pricing

- [`P1-E07-S01`](p1/P1-E07-S01.md) — CRUD services with effective-dated price history
- [`P1-E07-S02`](p1/P1-E07-S02.md) — Attribution role per service
- [`P1-E07-S03`](p1/P1-E07-S03.md) — Staff data records (no logins)
- [`P1-E07-S04`](p1/P1-E07-S04.md) — VAT / tax flag per service

### P1-E08 — Receipt Engine (KRA-shaped)

- [`P1-E08-S01`](p1/P1-E08-S01.md) — Receipt schema with nullable eTIMS fields
- [`P1-E08-S02`](p1/P1-E08-S02.md) — Receipt writer (interface)
- [`P1-E08-S03`](p1/P1-E08-S03.md) — Receipt PDF render
- [`P1-E08-S04`](p1/P1-E08-S04.md) — Receipt reprint
- [`P1-E08-S05`](p1/P1-E08-S05.md) — Receipt void (reversing entry)

### P1-E09 — SMS Stub Adapter + Config

- [`P1-E09-S01`](p1/P1-E09-S01.md) — Adapter interface + stub implementation
- [`P1-E09-S02`](p1/P1-E09-S02.md) — Admin config table for sender ID + URL + key
- [`P1-E09-S03`](p1/P1-E09-S03.md) — Templates registered + versioned

### P1-E10 — Admin Console Shell & RBAC

- [`P1-E10-S01`](p1/P1-E10-S01.md) — Nav shell + role-gated routes
- [`P1-E10-S02`](p1/P1-E10-S02.md) — User management (staff CRUD)
- [`P1-E10-S03`](p1/P1-E10-S03.md) — Audit log viewer
- [`P1-E10-S04`](p1/P1-E10-S04.md) — Settings sub-app

### P1-E11 — Parent Dashboard MVP

- [`P1-E11-S01`](p1/P1-E11-S01.md) — Wallet page (balance + outstanding + statement)
- [`P1-E11-S02`](p1/P1-E11-S02.md) — Children list and profile management
- [`P1-E11-S03`](p1/P1-E11-S03.md) — Top-up flow from dashboard
- [`P1-E11-S04`](p1/P1-E11-S04.md) — Profile & consent management
- [`P1-E11-S05`](p1/P1-E11-S05.md) — Bottom nav + mobile-first shell

### P1-E12 — Marketing & Landing

- [`P1-E12-S01`](p1/P1-E12-S01.md) — Home page
- [`P1-E12-S02`](p1/P1-E12-S02.md) — Per-unit pages
- [`P1-E12-S03`](p1/P1-E12-S03.md) — Deep-link from WhatsApp ads
- [`P1-E12-S04`](p1/P1-E12-S04.md) — Sign-in / sign-up entry points

### X5 — Audit Log (outbox pattern)

- [`X5-S01`](p1/X5-S01.md) — `audit_outbox` table + write helper
- [`X5-S02`](p1/X5-S02.md) — Async drain worker → `audit_log` projection
- [`X5-S03`](p1/X5-S03.md) — Audit catalogue (what gets audited)

### X7 — Design System Foundation

- [`X7-S01`](p1/X7-S01.md) — Tailwind preset with brand tokens
- [`X7-S02`](p1/X7-S02.md) — Primitive components
- [`X7-S03`](p1/X7-S03.md) — Compound components for P1 surfaces
- [`X7-S04`](p1/X7-S04.md) — Brand assets pipeline

### X8 — Observability, Backups, CI/CD

- [`X8-S01`](p1/X8-S01.md) — Structured logging + error tracking
- [`X8-S02`](p1/X8-S02.md) — Health endpoints
- [`X8-S03`](p1/X8-S03.md) — Daily DB backup + retention
- [`X8-S04`](p1/X8-S04.md) — CI/CD pipelines (per app)

---

## P2 — Bookings, Subscriptions, POS, Loyalty Redemption

*32 stories · 8–10 weeks · directory: `p2/`*

### P2-E01 — Booking Engine

- [`P2-E01-S01`](p2/P2-E01-S01.md) — Time-slot model and capacity for services
- [`P2-E01-S02`](p2/P2-E01-S02.md) — Parent browses available slots for a service
- [`P2-E01-S03`](p2/P2-E01-S03.md) — Parent books a slot (creates pending invoice)
- [`P2-E01-S04`](p2/P2-E01-S04.md) — Reception books on behalf of a walk-in
- [`P2-E01-S05`](p2/P2-E01-S05.md) — Parent reschedules a booking
- [`P2-E01-S06`](p2/P2-E01-S06.md) — Parent or Reception cancels a booking
- [`P2-E01-S07`](p2/P2-E01-S07.md) — Bookings list on parent dashboard

### P2-E02 — Subscription Plans

- [`P2-E02-S01`](p2/P2-E02-S01.md) — Subscription plan catalogue
- [`P2-E02-S02`](p2/P2-E02-S02.md) — Parent subscribes to a plan
- [`P2-E02-S03`](p2/P2-E02-S03.md) — Bookings deduct subscription entitlement first
- [`P2-E02-S04`](p2/P2-E02-S04.md) — Pause/freeze and resume a subscription
- [`P2-E02-S05`](p2/P2-E02-S05.md) — Renewal / dunning state machine
- [`P2-E02-S06`](p2/P2-E02-S06.md) — Cancel subscription

### P2-E03 — Pickup Authorisation & Observations

- [`P2-E03-S01`](p2/P2-E03-S01.md) — Authorised pickup list per child
- [`P2-E03-S02`](p2/P2-E03-S02.md) — Attendant check-in screen
- [`P2-E03-S03`](p2/P2-E03-S03.md) — Pickup handoff with free-text observations
- [`P2-E03-S04`](p2/P2-E03-S04.md) — Observations feed in parent's account
- [`P2-E03-S05`](p2/P2-E03-S05.md) — 24-month retention + anonymisation

### P2-E04 — POS App (in-store mode)

- [`P2-E04-S01`](p2/P2-E04-S01.md) — POS app scaffold + auth
- [`P2-E04-S02`](p2/P2-E04-S02.md) — Product catalogue read for POS
- [`P2-E04-S03`](p2/P2-E04-S03.md) — Cart + line discounts + overall discount
- [`P2-E04-S04`](p2/P2-E04-S04.md) — Payment at POS (cash / M-Pesa STK / Paystack card / wallet)
- [`P2-E04-S05`](p2/P2-E04-S05.md) — End-of-day cash-up

### P2-E05 — Loyalty Redemption UI + Engine

- [`P2-E05-S01`](p2/P2-E05-S01.md) — Loyalty earn ledger (already shipped P1, harden here)
- [`P2-E05-S02`](p2/P2-E05-S02.md) — Configurable earn and redeem rates
- [`P2-E05-S03`](p2/P2-E05-S03.md) — Redemption at parent checkout
- [`P2-E05-S04`](p2/P2-E05-S04.md) — Loyalty balance and history in parent app

### P2-E06 — Backup Retention Configurability

- [`P2-E06-S01`](p2/P2-E06-S01.md) — Settings for backup retention policy
- [`P2-E06-S02`](p2/P2-E06-S02.md) — Backup pruner respects policy

### P2-E07 — Auto-credit & Outstanding Surface (parent app)

- [`P2-E07-S01`](p2/P2-E07-S01.md) — Outstanding-balance banner on parent dashboard
- [`P2-E07-S02`](p2/P2-E07-S02.md) — SMS-stub nudge templates for outstanding balances
- [`P2-E07-S03`](p2/P2-E07-S03.md) — Auto-credit toggle visibility for parent (read-only)

---

## P3 — Commission, Salon, Loyalty Engine, Reporting

*26 stories · 8–10 weeks · directory: `p3/`*

### P3-E01 — Attribution & Commission Ledger

- [`P3-E01-S01`](p3/P3-E01-S01.md) — Per-staff commission rate with effective dating
- [`P3-E01-S02`](p3/P3-E01-S02.md) — Commission line recorded on every attributed booking
- [`P3-E01-S03`](p3/P3-E01-S03.md) — Monthly commission run (scheduled job)
- [`P3-E01-S04`](p3/P3-E01-S04.md) — Ad-hoc commission calculation (e.g., on the 15th)
- [`P3-E01-S05`](p3/P3-E01-S05.md) — Commission payout export (CSV)

### P3-E02 — Stylist Commission Viewer (named, not auth)

- [`P3-E02-S01`](p3/P3-E02-S01.md) — Public-but-named commission viewer route
- [`P3-E02-S02`](p3/P3-E02-S02.md) — Earnings breakdown (count of visits, top services)

### P3-E03 — Kids-Only Salon Flow

- [`P3-E03-S01`](p3/P3-E03-S01.md) — Stylist availability and slot creation
- [`P3-E03-S02`](p3/P3-E03-S02.md) — Parent picks a service, then a stylist, then a slot
- [`P3-E03-S03`](p3/P3-E03-S03.md) — Salon counter check-in and service completion
- [`P3-E03-S04`](p3/P3-E03-S04.md) — Reassign a salon booking between stylists
- [`P3-E03-S05`](p3/P3-E03-S05.md) — Salon-specific reporting tile

### P3-E04 — Loyalty Engine: Clawback + Negative Carry

- [`P3-E04-S01`](p3/P3-E04-S01.md) — Proportional loyalty clawback on refund
- [`P3-E04-S02`](p3/P3-E04-S02.md) — Negative-loyalty carry repaid by future earnings
- [`P3-E04-S03`](p3/P3-E04-S03.md) — Admin manual loyalty adjustment
- [`P3-E04-S04`](p3/P3-E04-S04.md) — Loyalty redemption respects pending settlement

### P3-E05 — Operational Reporting

- [`P3-E05-S01`](p3/P3-E05-S01.md) — Daily operations dashboard
- [`P3-E05-S02`](p3/P3-E05-S02.md) — Revenue by unit by period
- [`P3-E05-S03`](p3/P3-E05-S03.md) — Top-staff leaderboard
- [`P3-E05-S04`](p3/P3-E05-S04.md) — Wallet aging report
- [`P3-E05-S05`](p3/P3-E05-S05.md) — Peak-hours heatmap

### P3-E06 — Jobs Runner

- [`P3-E06-S01`](p3/P3-E06-S01.md) — Job framework: scheduling + observability
- [`P3-E06-S02`](p3/P3-E06-S02.md) — Anonymisation worker registered
- [`P3-E06-S03`](p3/P3-E06-S03.md) — Commission run registered
- [`P3-E06-S04`](p3/P3-E06-S04.md) — SMS retry worker registered
- [`P3-E06-S05`](p3/P3-E06-S05.md) — M-Pesa STK reconciliation cron now under framework

---

## P4 — WooCommerce Sync + Events Ticketing

*12 stories · 3–4 weeks · directory: `p4/`*

> **Scope change (locked):** Online toy shop runs on a **standalone WooCommerce site**, not in this monorepo. P4-E01, P4-E02, P4-E03 from the original plan are **dropped** (handled by WooCommerce). P4-E04 is reframed as a sync layer. No SSO, no wallet, no loyalty on Woo purchases.

### P4-E04 — POS ↔ WooCommerce Sync

- [`P4-E04-S01`](p4/P4-E04-S01.md) — Online orders tab in POS (pulled from WooCommerce REST)
- [`P4-E04-S02`](p4/P4-E04-S02.md) — Order status transitions sync back to WooCommerce
- [`P4-E04-S03`](p4/P4-E04-S03.md) — Print packing slip
- [`P4-E04-S04`](p4/P4-E04-S04.md) — Daily dispatch report
- [`P4-E04-S05`](p4/P4-E04-S05.md) — Stock push: POS catalogue changes propagate to Woo by SKU
- [`P4-E04-S06`](p4/P4-E04-S06.md) — WooCommerce REST client + credentials config in admin
- [`P4-E04-S07`](p4/P4-E04-S07.md) — Sync scheduler + dead-letter for failed Woo API calls

### P4-E05 — Events & Recital Ticketing

- [`P4-E05-S01`](p4/P4-E05-S01.md) — Event creation
- [`P4-E05-S02`](p4/P4-E05-S02.md) — Public event listing + detail page
- [`P4-E05-S03`](p4/P4-E05-S03.md) — Ticket purchase with guest checkout
- [`P4-E05-S04`](p4/P4-E05-S04.md) — Free events (RSVP only)
- [`P4-E05-S05`](p4/P4-E05-S05.md) — Door check-in via ticket code or manual list

---

## P5 — Coaching, eTIMS, SMS Go-Live, Polish

*28 stories · 6–8 weeks · directory: `p5/`*

### P5-E01 — Mom Coaching & Birth Doula

- [`P5-E01-S01`](p5/P5-E01-S01.md) — Coaching catalogue (1:1 + group)
- [`P5-E01-S02`](p5/P5-E01-S02.md) — Coach availability and 1:1 booking
- [`P5-E01-S03`](p5/P5-E01-S03.md) — Group session booking
- [`P5-E01-S04`](p5/P5-E01-S04.md) — Coach session notes (private)
- [`P5-E01-S05`](p5/P5-E01-S05.md) — Sensitive flow: discreet billing labels

### P5-E02 — eTIMS Writer Swap

- [`P5-E02-S01`](p5/P5-E02-S01.md) — eTIMS adapter implementation
- [`P5-E02-S02`](p5/P5-E02-S02.md) — eTIMS retry + dead-letter
- [`P5-E02-S03`](p5/P5-E02-S03.md) — Switch flag with rollback
- [`P5-E02-S04`](p5/P5-E02-S04.md) — VAT registration metadata

### P5-E03 — SMS Go-Live

- [`P5-E03-S01`](p5/P5-E03-S01.md) — Live SMS adapter (provider-agnostic)
- [`P5-E03-S02`](p5/P5-E03-S02.md) — Live/stub switch flag
- [`P5-E03-S03`](p5/P5-E03-S03.md) — Rate limit + cost control
- [`P5-E03-S04`](p5/P5-E03-S04.md) — Template editor (admin)

### P5-E04 — Feedback Engine

- [`P5-E04-S01`](p5/P5-E04-S01.md) — 0–5 rating after every paid touchpoint
- [`P5-E04-S02`](p5/P5-E04-S02.md) — Feedback dashboard by unit and by staff
- [`P5-E04-S03`](p5/P5-E04-S03.md) — Negative feedback alert
- [`P5-E04-S04`](p5/P5-E04-S04.md) — Public review snippets (optional)

### P5-E05 — Advanced Reporting / Cohort Analytics

- [`P5-E05-S01`](p5/P5-E05-S01.md) — Consolidated P&L by period
- [`P5-E05-S02`](p5/P5-E05-S02.md) — Cohort retention by signup month
- [`P5-E05-S03`](p5/P5-E05-S03.md) — Repeat-attendance metrics for events and classes
- [`P5-E05-S04`](p5/P5-E05-S04.md) — Wallet float vs revenue snapshot
- [`P5-E05-S05`](p5/P5-E05-S05.md) — Expenses module
- [`P5-E05-S06`](p5/P5-E05-S06.md) — Tax-ready exports

### P5-E06 — Marketing Site Polish

- [`P5-E06-S01`](p5/P5-E06-S01.md) — Brand polish pass
- [`P5-E06-S02`](p5/P5-E06-S02.md) — SEO + performance budget tightening
- [`P5-E06-S03`](p5/P5-E06-S03.md) — CMS-driven unit pages
- [`P5-E06-S04`](p5/P5-E06-S04.md) — Blog / stories (optional)
- [`P5-E06-S05`](p5/P5-E06-S05.md) — Social proof + testimonials

---

## P1 Landing Order (first 30 PRs)

Recommended order to open the first 30 PRs against an empty repo. Each green before the next opens.

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

---

## Counts at a glance

| Phase | Stories | Duration |
|---|---|---|
| P1 | 72 | 12–14 weeks |
| P2 | 32 | 8–10 weeks |
| P3 | 26 | 8–10 weeks |
| P4 | 12 | 3–4 weeks |
| P5 | 28 | 6–8 weeks |
| **Total** | **170** | **~9–11 months** |

---

## Tooling

- `_splitter.py` — splits a consolidated phase stories markdown into individual story files.
  Usage: `python3 _splitter.py <source.md> <output_dir> '<phase label>'`
- Re-run any phase by re-running the splitter against its consolidated source file.

