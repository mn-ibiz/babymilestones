# Baby Milestones — Phase 2 Stories

*Source: `epics.md` · Phase 2 (Bookings, Subscriptions, POS, Loyalty Redemption — 8–10 weeks)*

Phase 2 turns the Phase 1 foundation into the first revenue-generating activities for the complex: parents book and pay for Play and Talent sessions, the in-store toy POS opens for cash + M-Pesa walk-ups, and loyalty earned in P1 becomes redeemable.

**Prerequisite:** P1 fully shipped (wallet, ledger, auth, payments, Reception surface, Treasury reconciliation, receipt engine, SMS stub).

**Phase 2 epic index:**
- P2-E01 Booking Engine
- P2-E02 Subscription Plans (Play & Talent)
- P2-E03 Pickup Authorisation & Free-Text Observations
- P2-E04 POS App (in-store mode)
- P2-E05 Loyalty Redemption UI + Engine
- P2-E06 Backup Retention Configurability
- P2-E07 Auto-credit & Outstanding Surface (parent app)

---

## P2-E01 — Booking Engine

### P2-E01-S01 — Time-slot model and capacity for services
**JTBD:** As admin, I want to define when a service is available and how many children fit per slot.
**AC:**
- AC1: `service_schedules` table: service_id, day_of_week (0-6), start_time, end_time, slot_duration_minutes, capacity, is_active.
- AC2: A schedule generates concrete `session_slots` for the next 60 days; regenerated nightly.
- AC3: Each slot has computed `remaining_capacity` = `capacity − bookings_in_slot`.
- AC4: Admin CRUD; changes don't retroactively touch booked slots, only future ones.
- AC5: Audit on schedule changes.
**Tech:** Slot pre-materialisation simplifies booking queries; cron in `apps/jobs`. Files: `packages/catalog/schedules.ts`.
**Deps:** P1-E07.

### P2-E01-S02 — Parent browses available slots for a service
**JTBD:** As a parent, I want to see this week's available Play / Talent slots so I can book what fits.
**AC:**
- AC1: Service detail page shows a 7-day grid with available slots + remaining capacity.
- AC2: Slots filtered to those the child's age fits (uses `services.age_min` / `age_max`).
- AC3: Past slots greyed out; today's earlier slots disabled.
- AC4: Loads ≤500ms p95.
**Tech:** Indexed query on `session_slots`. `apps/platform/app/(app)/book/[service]/page.tsx`.
**Deps:** S01, P1-E11.

### P2-E01-S03 — Parent books a slot (creates pending invoice)
**JTBD:** As a parent, I want to book a slot and lock my child's seat instantly.
**AC:**
- AC1: Tap slot → child picker (parent's eligible children only) → confirm.
- AC2: Booking row created; `session_slots.bookings_in_slot` incremented atomically.
- AC3: Pending invoice created for the service price at booking time (price snapshotted).
- AC4: Capacity race: two parents booking the last seat — only one succeeds; the other sees a clear "Slot just filled" message.
- AC5: SMS-stub confirmation sent with date/time and child name.
**Tech:** Atomic `UPDATE … SET bookings_in_slot = bookings_in_slot + 1 WHERE remaining > 0`. Files: `apps/api/src/routes/bookings/create.ts`.
**Deps:** S02, P1-E03.

### P2-E01-S04 — Reception books on behalf of a walk-in
**JTBD:** As Reception, I want to book a slot for a walk-in parent at the counter.
**AC:**
- AC1: From parent profile → "New booking" → service picker → slot picker → child picker → confirm.
- AC2: Same atomicity guarantees as parent self-book.
- AC3: Attribution captured if service requires it.
**Tech:** Reuses S03 server flow; Reception UI shells it.
**Deps:** S03, P1-E05.

### P2-E01-S05 — Parent reschedules a booking
**JTBD:** As a parent, I want to move a booking if life gets in the way, up to the cut-off.
**AC:**
- AC1: Reschedule allowed up to N hours before slot (configurable per service; default 2).
- AC2: New slot must have capacity; new booking replaces old in one transaction.
- AC3: Audit shows both old and new slot IDs.
- AC4: After cut-off, parent gets a clear "Contact reception" message instead.
**Deps:** S03.

### P2-E01-S06 — Parent or Reception cancels a booking
**JTBD:** As a parent, I want to cancel a booking I no longer need.
**AC:**
- AC1: Cancel before cut-off → slot capacity restored, invoice voided.
- AC2: Cancel after cut-off → admin discretion (reception flow); cancellation fee policy configurable per service (zero by default).
- AC3: Audit logged.
**Deps:** S03.

### P2-E01-S07 — Bookings list on parent dashboard
**JTBD:** As a parent, I want to see what I've booked, what's coming up, and what's done.
**AC:**
- AC1: Upcoming, today, past tabs; per-row: service, child, date, status, attendance.
- AC2: Tap → detail with reschedule/cancel CTAs subject to AC of S05/S06.
**Deps:** S03.

---

## P2-E02 — Subscription Plans (Play & Talent)

### P2-E02-S01 — Subscription plan catalogue
**JTBD:** As admin, I want to define subscription plans like "8 Play sessions per month" with price and entitlement.
**AC:**
- AC1: `subscription_plans` table: name, service_id, entitlement_count, period (`week`|`month`|`term`), price, is_active.
- AC2: CRUD with audit.
- AC3: Plan price changes are effective-dated like services.
**Deps:** P1-E07.

### P2-E02-S02 — Parent subscribes to a plan
**JTBD:** As a parent, I want to subscribe to a plan and pre-pay for the period.
**AC:**
- AC1: From service page, "Subscribe" option lists eligible plans.
- AC2: Subscription created; full period charged from wallet immediately.
- AC3: `subscriptions` table: parent_id, child_id, plan_id, started_at, current_period_start, current_period_end, status (`active`|`paused`|`cancelled`), entitlement_remaining.
- AC4: SMS-stub confirms; loyalty earns on the settled charge.
**Deps:** S01, P1-E03.

### P2-E02-S03 — Bookings deduct subscription entitlement first
**JTBD:** As a parent on a subscription, my bookings should consume entitlement, not wallet.
**AC:**
- AC1: When booking a service, if parent has active subscription matching service + child + period, entitlement decrements by 1; no wallet charge.
- AC2: If entitlement is exhausted, fall back to wallet pay-as-you-go.
- AC3: Booking row records `paid_via='subscription'` or `paid_via='wallet'`.
**Deps:** S02, P2-E01.

### P2-E02-S04 — Pause/freeze and resume a subscription
**JTBD:** As a parent, I want to pause my subscription when we travel and resume later — without losing what I paid for.
**AC:**
- AC1: Pause from parent dashboard or by admin/Reception; `status='paused'`; entitlement remaining frozen.
- AC2: While paused: no new period charges, bookings forbidden under the plan, wallet pay-as-you-go still works.
- AC3: Resume restores `status='active'`; period dates shifted by the pause duration; entitlement carries over.
- AC4: Audit logged at pause and resume.
**Tech:** Carryover behaviour locked by Decision 3. `subscriptions.pause_history` JSONB.
**Deps:** S02.

### P2-E02-S05 — Renewal / dunning state machine
**JTBD:** As the system, I must charge the next period when the current ends, and handle failures gracefully.
**AC:**
- AC1: On `current_period_end`, job attempts to charge the next period from wallet.
- AC2: Success → period rolls, entitlement reset.
- AC3: Failure (insufficient wallet, auto-credit off) → `status='dunning'`; SMS-stub notifies parent; daily retry for 3 days.
- AC4: After 3 days unpaid → `status='paused'` until manually resumed.
- AC5: Auto-credit-enabled parents charge through to negative balance.
**Tech:** `apps/jobs/subscriptions/renew.ts`. State transitions logged.
**Deps:** S02, S04.

### P2-E02-S06 — Cancel subscription
**JTBD:** As a parent, I want to cancel my subscription and not be charged again.
**AC:**
- AC1: Cancel from parent dashboard; effective at `current_period_end` (current period plays out).
- AC2: Cancellation reversible until period end.
- AC3: No refunds on already-paid periods (refunds handled offline per spec).
**Deps:** S02.

---

## P2-E03 — Pickup Authorisation & Free-Text Observations

### P2-E03-S01 — Authorised pickup list per child
**JTBD:** As a parent, I want to nominate who can collect my child so the attendant knows it's safe.
**AC:**
- AC1: Per-child list of authorised pickups: name, phone, optional photo URL, relationship.
- AC2: Parent CRUDs from dashboard.
- AC3: Audit on every change.
**Tech:** `child_pickup_authorisations` table.
**Deps:** P1-E02.

### P2-E03-S02 — Attendant check-in screen
**JTBD:** As an attendant (operated via Reception's screen), I want to check children in for a session in seconds.
**AC:**
- AC1: Today's session slots listed; tap → booking list for that slot.
- AC2: For each booking: child card with name + photo (if consented) + drop-off time field.
- AC3: Check-in triggers wallet debit (P1-E03-S05) and records `attendance.checked_in_at`.
- AC4: Bulk check-in supported (rare but useful).
**Tech:** Reception screen sub-route. Same auth as Reception.
**Deps:** P2-E01, P1-E03.

### P2-E03-S03 — Pickup handoff with free-text observations
**JTBD:** As the attendant, I want to record what happened today in 9 seconds and SMS the parent.
**AC:**
- AC1: Child card → "Hand over" → screen with: mood picker (5 emojis, default 😊), activity chips (configurable list), single optional free-text line.
- AC2: Confirm → records `attendance.checked_out_at`, observation row, sends SMS-stub summary to parent.
- AC3: Voice-to-text button available on tablet.
- AC4: Receipt automatically generated for the visit.
**Tech:** Compound: `PickupHandoffScreen`. Designed for ≤9 seconds typical hand-off.
**Deps:** S02, P1-E08, P1-E09.

### P2-E03-S04 — Observations feed in parent's account
**JTBD:** As a parent, I want to read what my child did at every session in one place.
**AC:**
- AC1: Per-child timeline: mood, activities, free-text note, attendant name, date.
- AC2: Filterable by date range and service.
- AC3: Read-only.
**Deps:** S03.

### P2-E03-S05 — 24-month retention + anonymisation
**JTBD:** As a data-protection officer, I want observation free-text auto-anonymised after 24 months.
**AC:**
- AC1: Nightly job scans `attendances.observations` older than 24 months.
- AC2: Strips `parent_id` and `child_id`; replaces names in free-text with `[child]`/`[parent]` using regex on first names.
- AC3: Aggregate text retained for operational learning; PII cleared.
- AC4: Job run + count logged.
**Tech:** `apps/jobs/anonymise/observations.ts`. Decision 29.
**Deps:** S03.

---

## P2-E04 — POS App (in-store mode)

### P2-E04-S01 — POS app scaffold + auth
**JTBD:** As a cashier, I want a POS app that I log into and start selling.
**AC:**
- AC1: `apps/pos` Next.js app on `pos.babymilestones.co.ke`.
- AC2: SSO from P1-E01-S04; role `cashier` lands directly on the sale screen.
- AC3: Tablet-first layout, landscape ≥ 768px, large touch targets.
**Deps:** P1-E01.

### P2-E04-S02 — Product catalogue read for POS
**JTBD:** As a cashier, I want to search or scan a product and add it to a sale.
**AC:**
- AC1: Barcode scanner input auto-focused; on enter → matches `products.sku` or `products.barcode`.
- AC2: Search by name with debounce; results show price, stock.
- AC3: Out-of-stock products greyed out (sale blocked at checkout).
**Tech:** Uses `packages/catalog`. Catalogue itself created in P4-E01 — for P2 ship a minimal stub seed product set.
**Deps:** S01.

### P2-E04-S03 — Cart + line discounts + overall discount
**JTBD:** As a cashier, I want to manage the active sale: adjust quantities, apply discounts, see totals.
**AC:**
- AC1: Cart shows lines with qty +/-, remove, line discount %.
- AC2: Overall discount % or KES.
- AC3: Totals recompute live; tax shown per line per `services.tax_treatment` semantics.
- AC4: Stock check at "Pay" step; insufficient stock → block + clear error.
**Deps:** S02.

### P2-E04-S04 — Payment at POS (cash / M-Pesa STK / Paystack card / wallet)
**JTBD:** As a cashier, I want to take any payment method without leaving the POS.
**AC:**
- AC1: Pay screen offers all four methods.
- AC2: Cash: change calculation, drawer instruction message.
- AC3: M-Pesa STK: enter customer phone → push → live status panel.
- AC4: Paystack: redirect customer's phone to a Paystack hosted-checkout URL (QR option) OR cashier-typed card form (Paystack-hosted).
- AC5: Wallet: only if customer is a signed-in parent at the POS (phone lookup); deducts via wallet flow.
- AC6: On success → receipt printed (default printer) + SMS-stub sent → stock decremented → cart cleared.
- AC7: Failure paths handled distinctly.
**Tech:** Reuses P1-E04 adapters. Receipt via P1-E08. State machine logged.
**Deps:** S03, P1-E04, P1-E08.

### P2-E04-S05 — End-of-day cash-up
**JTBD:** As a cashier, I want to close the till at end-of-day and report any variance.
**AC:**
- AC1: "End of day" CTA shows: expected cash (sum of cash sales), expected M-Pesa, expected Paystack.
- AC2: Cashier enters actual cash counted; variance computed.
- AC3: Variance > KES 500 → reason text required.
- AC4: Audit + writes to Treasury reconciliation feed (P1-E06).
**Deps:** S04, P1-E06.

---

## P2-E05 — Loyalty Redemption UI + Engine

### P2-E05-S01 — Loyalty earn ledger (already shipped P1, harden here)
**JTBD:** As a developer, I want loyalty earnings to be auditable and reconcilable.
**AC:**
- AC1: `loyalty_ledger` rows for every settled payment per Decision 21.
- AC2: Each row references the `wallet_ledger` entry that triggered it.
- AC3: Earn-rate snapshot stored on the row to survive future rate changes.
**Tech:** Tidy up the earn path written in P1.
**Deps:** P1 loyalty plumbing.

### P2-E05-S02 — Configurable earn and redeem rates
**JTBD:** As admin, I want to tune the loyalty programme without code changes.
**AC:**
- AC1: Settings: `earn_rate` (KES per point, default 100), `redeem_rate` (KES per point, default 1).
- AC2: Changes are effective-dated; historical earnings/redemptions unchanged.
- AC3: Decision refs: 11, 34.
**Deps:** P1-E10-S04.

### P2-E05-S03 — Redemption at parent checkout
**JTBD:** As a parent, I want to use my points to reduce my booking or shop bill.
**AC:**
- AC1: At booking confirmation (in the custom platform), a toggle: "Use X points (save KES Y)". (Online toy-shop purchases run in WooCommerce and do not participate in loyalty per Decision 37.)
- AC2: Toggle on → applies points as a wallet credit equal to `points × redeem_rate`, deducts from the bill.
- AC3: Cannot redeem more points than current balance; cannot redeem points already on a pending settlement.
- AC4: Redemption writes a `loyalty_ledger` debit + a `wallet_ledger` credit + the booking debit applies normally.
**Deps:** S01, P2-E01.

### P2-E05-S04 — Loyalty balance and history in parent app
**JTBD:** As a parent, I want to see my points balance and how I earned them.
**AC:**
- AC1: Parent dashboard shows points balance + lifetime earned + lifetime redeemed.
- AC2: History view: earn/redeem entries with source link (booking, top-up, etc.).
- AC3: Decision refs: 11.
**Deps:** S01, S03, P1-E11.

---

## P2-E06 — Backup Retention Configurability

### P2-E06-S01 — Settings for backup retention policy
**JTBD:** As admin, I want to choose how many daily / monthly backups to keep.
**AC:**
- AC1: Settings: `daily_retention_days` (default 30), `monthly_retention_months` (default 12).
- AC2: Admin-editable; audit logged.
- AC3: Decision 35 unlocked here (P1 ships fixed 30-day).
**Deps:** P1-E10.

### P2-E06-S02 — Backup pruner respects policy
**JTBD:** As the system, I want to prune older backups so storage doesn't grow forever.
**AC:**
- AC1: Daily job in `apps/jobs/backups/prune.ts` reads the policy and deletes expired backups.
- AC2: Action logged in `backup_runs`.
- AC3: Deletion is a soft action: 7-day grace period before physical delete (configurable).
**Deps:** S01, P1-X8.

---

## P2-E07 — Auto-credit & Outstanding Surface (parent app)

### P2-E07-S01 — Outstanding-balance banner on parent dashboard
**JTBD:** As a parent with an outstanding balance, I want it surfaced clearly so I don't forget.
**AC:**
- AC1: If `outstanding_amount > 0`, banner shows on every page: "You owe KES X. Top up to settle."
- AC2: Banner CTA opens top-up flow.
- AC3: After settlement, banner disappears automatically.
**Tech:** Banner uses `OutstandingBalanceBanner` compound.
**Deps:** P1-E11, P1-E03.

### P2-E07-S02 — SMS-stub nudge templates for outstanding balances
**JTBD:** As the system, I want to remind parents about their outstanding balance on a schedule.
**AC:**
- AC1: New templates registered: `outstanding.day1`, `outstanding.day7`, `outstanding.day30`.
- AC2: Job in `apps/jobs/dunning/outstanding-reminders.ts` runs daily, queues stub-SMS per the schedule.
- AC3: Parent opt-out from non-transactional reminders honoured (consent flag).
**Deps:** P1-E09, S01.

### P2-E07-S03 — Auto-credit toggle visibility for parent (read-only)
**JTBD:** As a parent, I want to see whether I'm allowed to go negative — not control it, but know.
**AC:**
- AC1: Wallet page shows: "Auto-credit: Enabled by admin" or "Auto-credit: Not enabled".
- AC2: If disabled, helper copy explains: "Top up before booking to avoid an outstanding balance".
- AC3: No edit affordance for parent.
**Deps:** P1-E03-S07.

---

*End of P2 stories.*
