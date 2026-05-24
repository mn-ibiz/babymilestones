# Baby Milestones — Phase 3 Stories

*Source: `epics.md` · Phase 3 (Commission, Salon, Loyalty Engine, Reporting — 8–10 weeks)*

Phase 3 stands up the Kids-Only Salon end-to-end, formalises stylist commission, ships the loyalty engine including refund clawback, and gives admins real operational visibility.

**Prerequisite:** P1 + P2 shipped.

**Phase 3 epic index:**
- P3-E01 Attribution & Commission Ledger
- P3-E02 Stylist Commission Viewer (named, not auth)
- P3-E03 Kids-Only Salon Flow
- P3-E04 Loyalty Engine: Clawback + Negative Carry
- P3-E05 Operational Reporting
- P3-E06 Jobs Runner

---

## P3-E01 — Attribution & Commission Ledger

### P3-E01-S01 — Per-staff commission rate with effective dating
**JTBD:** As admin, I want each stylist's commission percentage to be configurable and to support changes over time.
**AC:**
- AC1: `staff_commission_rates` table: staff_id, rate_percent (decimal), effective_from, effective_to (nullable), reason.
- AC2: Admin CRUD; setting a new rate auto-closes the previous one.
- AC3: Bookings join commission via `effective_from ≤ booking.created_at < effective_to`.
- AC4: Audit on every rate change.
- AC5: Decision refs: 6, 15.
**Tech:** `packages/catalog/staff.ts`.
**Deps:** P1-E07.

### P3-E01-S02 — Commission line recorded on every attributed booking
**JTBD:** As accountant, I want every salon visit to write a commission line for traceability.
**AC:**
- AC1: On booking settle (wallet debit or subscription consumption), if `attributed_staff_id IS NOT NULL`, insert a `commission_ledger` row: staff_id, booking_id, amount_cents, rate_snapshot, source.
- AC2: Refunds reverse the commission via reversing entry.
- AC3: Commission amount = service price × rate at booking time.
- AC4: Ledger is append-only.
**Tech:** Hooks into wallet debit completion. `packages/wallet/commission-hook.ts`.
**Deps:** S01, P1-E03, P1-E07.

### P3-E01-S03 — Monthly commission run (scheduled job)
**JTBD:** As the system, I want to close each calendar month's commission and produce a payout report.
**AC:**
- AC1: Cron in `apps/jobs/commission/run.ts` runs at 02:00 on the 1st of each month.
- AC2: Computes per-staff totals for the prior month.
- AC3: Writes `commission_runs` row + `commission_run_lines` per staff.
- AC4: Run is idempotent — running twice for the same month is a no-op.
- AC5: Audit logged.
**Tech:** Decision 15.
**Deps:** S02.

### P3-E01-S04 — Ad-hoc commission calculation (e.g., on the 15th)
**JTBD:** As admin, I want to run commission calculation any time, not only month-end.
**AC:**
- AC1: Admin Reports → "Run ad-hoc commission" → date-range picker → preview totals.
- AC2: Confirming creates a `commission_runs` row marked `ad_hoc`.
- AC3: Subsequent month-end run excludes already-paid-out ad-hoc periods.
**Deps:** S03.

### P3-E01-S05 — Commission payout export (CSV)
**JTBD:** As accountant, I want to download the commission run as CSV to feed into M-Pesa B2C.
**AC:**
- AC1: Per run: CSV with staff name, phone (held on staff record), amount, reference.
- AC2: Audit on export download.
- AC3: Mark run as `paid_out_at` after admin confirms payout has been made externally.
**Deps:** S03, S04.

---

## P3-E02 — Stylist Commission Viewer (named, not auth)

### P3-E02-S01 — Public-but-named commission viewer route
**JTBD:** As a stylist, I want to see this month's earnings from the reception PC without logging in.
**AC:**
- AC1: Route `admin.babymilestones.co.ke/staff-earnings` accessible without login.
- AC2: Dropdown of active stylists (display names only).
- AC3: Pick name → confirm display: month-to-date earnings, last month's earnings, last payout amount + date.
- AC4: No PII beyond display name; no parent or booking details.
- AC5: Rate limit on the endpoint (anti-scrape).
- AC6: Decision refs: 14.
**Tech:** Caching: 60s. `apps/admin/app/staff-earnings/page.tsx`.
**Deps:** P3-E01.

### P3-E02-S02 — Earnings breakdown (count of visits, top services)
**JTBD:** As a stylist, I want to know which services drove my earnings.
**AC:**
- AC1: Below total: number of completed visits, top 3 services by count, top 3 by revenue.
- AC2: No customer-specific information shown.
**Deps:** S01.

---

## P3-E03 — Kids-Only Salon Flow

### P3-E03-S01 — Stylist availability and slot creation
**JTBD:** As admin, I want to declare which stylist is in on which day so the booking grid respects it.
**AC:**
- AC1: `staff_availability` table: staff_id, day_of_week, start_time, end_time, effective_date_range.
- AC2: Slots generated nightly into `salon_slots` from staff availability × salon service durations.
- AC3: Past/today edits don't retroactively change historical bookings.
**Tech:** Re-uses the P2-E01 slot mechanics scoped to salon.
**Deps:** P2-E01.

### P3-E03-S02 — Parent picks a service, then a stylist, then a slot
**JTBD:** As a parent, I want to book a salon visit with a stylist I trust.
**AC:**
- AC1: Booking flow: service → stylist (optional, default "Any available") → date → available slots.
- AC2: If parent picks a stylist, only that stylist's slots show.
- AC3: If "Any available" — system picks the least-busy stylist on confirmation.
- AC4: Confirm → booking, attribution captured, pending invoice created.
**Deps:** S01, P2-E01.

### P3-E03-S03 — Salon counter check-in and service completion
**JTBD:** As Reception, I want to check the child in and mark the service complete.
**AC:**
- AC1: Salon view shows today's bookings by stylist, by hour.
- AC2: Tap booking → check in → wallet debit (P1-E03-S05) + commission line (P3-E01-S02).
- AC3: Mark complete → photo capture optional (subject to consent), feedback prompt triggered (P5-E04).
- AC4: Walk-in: receptionist creates parent (P1-E02-S02) → books a slot now → checks in.
**Deps:** S02, P1-E03, P3-E01.

### P3-E03-S04 — Reassign a salon booking between stylists
**JTBD:** As Reception, I want to move a child to a different stylist on the day if needed.
**AC:**
- AC1: Drag/select-and-reassign in the daily view.
- AC2: New stylist must be available; double-book prevented.
- AC3: Attribution snapshot updated; audit recorded.
- AC4: If service already settled (rare), commission lines move proportionally.
**Deps:** S03.

### P3-E03-S05 — Salon-specific reporting tile
**JTBD:** As admin, I want salon performance at a glance.
**AC:**
- AC1: Tile on operational dashboard: today's bookings, no-shows, total revenue.
- AC2: Drill-down to per-stylist breakdown.
**Deps:** P3-E05.

---

## P3-E04 — Loyalty Engine: Clawback + Negative Carry

### P3-E04-S01 — Proportional loyalty clawback on refund
**JTBD:** As the system, when a refund happens, I must claw back the points that were earned on the refunded amount.
**AC:**
- AC1: When `wallet_ledger.kind='refund'` posts, compute the points that were earned on the original transaction (use `earn_rate` snapshot from that day).
- AC2: Insert a `loyalty_ledger` debit with the proportional clawback amount and `reverses_loyalty_ledger_id` FK.
- AC3: If the parent's points balance is sufficient → straightforward debit.
- AC4: If insufficient → balance goes negative; flag `negative_carry=true` on the entry.
- AC5: Decision refs: 22.
**Deps:** P2-E05-S01, P1-E03-S06.

### P3-E04-S02 — Negative-loyalty carry repaid by future earnings
**JTBD:** As the system, future loyalty earnings should first repay any negative balance before adding to spendable points.
**AC:**
- AC1: When a new earn entry posts, if balance is negative, apply earned points to bring balance back up to 0 first; remainder is spendable.
- AC2: The earn ledger row tags `applied_to_negative_carry` portion separately for traceability.
**Deps:** S01.

### P3-E04-S03 — Admin manual loyalty adjustment
**JTBD:** As admin, I want to credit or debit a parent's points balance for goodwill or correction.
**AC:**
- AC1: Admin Reception → parent → loyalty → "Adjust" → amount + reason text.
- AC2: Writes a `loyalty_ledger` row with `kind='adjustment'`, `posted_by=admin_user`.
- AC3: Audit logged.
- AC4: Permission: `admin`, `super_admin`.
**Deps:** S01.

### P3-E04-S04 — Loyalty redemption respects pending settlement
**JTBD:** As the system, I must not let parents redeem points that are about to be clawed back.
**AC:**
- AC1: At redemption, `available_to_redeem = balance − points_pending_clawback`.
- AC2: Pending clawback set when a refund is initiated but not yet finalised (rare; admin workflow).
- AC3: UI shows available-to-redeem, not raw balance, on the redeem screen.
**Deps:** S01, P2-E05-S03.

---

## P3-E05 — Operational Reporting

### P3-E05-S01 — Daily operations dashboard
**JTBD:** As admin / owner, I want one screen showing what's happening today across all units.
**AC:**
- AC1: Tiles: today's revenue (total + per-unit), bookings count, active sessions, outstanding balances total, top staff today.
- AC2: All numbers click through to drill-down.
- AC3: Auto-refresh every 60s.
- AC4: Permission: `admin`, `super_admin`, `treasury` (read-only).
**Tech:** Materialised view refreshed every minute.
**Deps:** P1-E03, P2 + P3 epics.

### P3-E05-S02 — Revenue by unit by period
**JTBD:** As owner, I want to see revenue trends per business unit.
**AC:**
- AC1: Date-range picker; per-unit revenue line/bar chart; period-over-period delta.
- AC2: CSV export per the same filter.
- AC3: Excludes refunded amounts.
**Deps:** S01.

### P3-E05-S03 — Top-staff leaderboard
**JTBD:** As admin, I want to see who's bringing in the most revenue this period.
**AC:**
- AC1: Per-staff totals, count of services, average ticket.
- AC2: Filterable by role (stylist / instructor / attendant).
- AC3: Click → per-staff drill-down with commission totals.
**Deps:** P3-E01, S01.

### P3-E05-S04 — Wallet aging report
**JTBD:** As accountant, I want to see how long outstanding balances have been open.
**AC:**
- AC1: Buckets: 0–7, 8–30, 31–60, 61–90, 90+ days.
- AC2: Per-parent rows under each bucket; clickable to parent profile.
- AC3: CSV export.
**Deps:** P1-E03.

### P3-E05-S05 — Peak-hours heatmap
**JTBD:** As admin, I want to understand when the complex is busiest so staffing tracks demand.
**AC:**
- AC1: Heatmap: weekday × hour; intensity = total active sessions.
- AC2: Filterable by unit.
- AC3: Date range up to 12 months.
**Deps:** P2-E01.

---

## P3-E06 — Jobs Runner

### P3-E06-S01 — Job framework: scheduling + observability
**JTBD:** As ops, I want a single place jobs are defined, scheduled, and monitored.
**AC:**
- AC1: `apps/jobs` exposes a registry: name, schedule (cron expression), handler, on-failure policy.
- AC2: Each run logged: `job_runs` table with started_at, ended_at, status, error.
- AC3: Failed runs alert via Sentry.
- AC4: Manual "run now" available to super-admin from admin console.
**Tech:** `node-cron` or BullMQ. Single-worker model in P3; scale-out later.
**Deps:** P1-X8.

### P3-E06-S02 — Anonymisation worker registered
**JTBD:** As the system, observation anonymisation (P2-E03-S05) runs reliably each night.
**AC:**
- AC1: Job registered, schedule `0 2 * * *` (02:00 daily).
- AC2: Logs count of rows anonymised.
**Deps:** S01, P2-E03-S05.

### P3-E06-S03 — Commission run registered
**JTBD:** Monthly commission run (P3-E01-S03) runs via the framework.
**AC:**
- AC1: Registered as `commission.monthly` with cron `0 2 1 * *`.
- AC2: Failures retried; max 3 attempts before alert.
**Deps:** S01, P3-E01-S03.

### P3-E06-S04 — SMS retry worker registered
**JTBD:** Failed SMS sends from `sms_outbox` are retried automatically.
**AC:**
- AC1: Job picks `sms_outbox` rows where status=`failed` and attempt_count < 5.
- AC2: Exponential backoff (1m, 5m, 30m, 2h, 12h).
- AC3: After 5 failed attempts → dead-lettered + alert.
**Deps:** S01, P1-E09.

### P3-E06-S05 — M-Pesa STK reconciliation cron now under framework
**JTBD:** Move the P1 ad-hoc STK reconciliation into the framework.
**AC:**
- AC1: P1-E04-S03 logic registered as `payments.mpesa.reconcile` every 60s.
- AC2: Logs count of recovered transactions per run.
**Deps:** S01, P1-E04-S03.

---

*End of P3 stories.*
