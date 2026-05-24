# Baby Milestones — Unified Platform
## Requirements & Functional Specification

*Version 2.2 · Draft · Prepared by Moses*

> **v2.2 scope change (locked):** The **online toy shop** is no longer part of this custom build. It will run on a **standalone WooCommerce site** (separate hosting, separate auth, WooCommerce's own checkout, WooCommerce's own M-Pesa plugin). The only integration with the custom platform is a periodic sync from the **in-store POS**: pull new online orders for dispatch, push stock-level updates by SKU. **No SSO. No wallet integration on Woo. No loyalty on Woo purchases.** All wording in the rest of this document about a "Toy Shop subdomain", "online storefront", `apps/shop`, or "online checkout on our platform" reflects the earlier scope and is overridden by this note. See locked Decision **37** below and the revised Module 5 / Phase 4 sections.

---

## 1. Executive Summary

**Baby Milestones** is a single physical complex offering a full journey of services for mothers and young children, unified by one digital platform. Parents discover services on a public website, book online, top up a wallet, and let their balance pay for activities across every unit. Staff use role-scoped screens for their unit; the owner sees everything.

### The business units

| # | Unit | Type | Audience |
|---|---|---|---|
| 1 | **Mom Coaching & Birth Doula** | Service | Expecting/new mothers |
| 2 | **Play Area** (supervised, timed sessions) | Service | Kids 0–3 yrs (primary) |
| 3 | **Talent Center** (ballet, gymnastics, crafts, music) | Service | Kids 2.5–12 yrs |
| 4 | **Kids-Only Salon** | Service | Kids |
| 5 | **Toy Shop** (in-store POS; **online via standalone WooCommerce**) | Products | Parents, with in-store age-stage guidance |
| 6 | **Reading Corner & Events** (Craft Saturday, drawing, etc.) | Service | Kids |
| 7 | **HQ / Admin** | Management layer | Owner, accountant |

The **physical Toy Shop** is run from our custom in-store **POS** app (part of the custom platform). The **online toy shop** runs on a **separate WooCommerce site** that is not part of this platform — the POS keeps it in sync (pulls online orders, pushes stock by SKU). Everything else (parent portal, admin, all bookings) lives on the main custom site. **All units of the custom platform share one database** so the admin gets a unified view and consolidated reports. The WooCommerce site is not in that database.

---

## 2. Platform Shape

- **Web application only** — no app to install, accessible from any browser, anywhere (including outside Kenya).
- **Beautiful public landing page** — marketing copy, service catalogue, easy "Check availability & Book" flow.
- **Cloud-hosted** — yearly hosting fee, no on-site server.
- **Single database** — every unit writes to one logical database so admin reports are real, not stitched together.
- **Full branding applied across the experience** — landing site, parent account, staff screens, receipts, SMS — following design best practices.

---

## 3. The Parent Wallet (central concept)

This replaces "pay-per-thing-at-the-counter" as the default flow.

- A parent signs up once (phone + PIN).
- A parent can register **multiple children** under their account.
- The parent **tops up** the account via **M-Pesa**, **Paystack card**, and direct bank transfer.
- As children attend activities, **deductions are made automatically** from the parent's balance.
- Subscriptions (weekly/monthly) and one-off drop-ins both pull from the same wallet.
- **Pay-as-you-go is the default for non-subscribed children.** If a parent has a balance (e.g., KES 1,000) and the child attends sessions at KES 200 each, the system deducts 200 per visit until the balance is exhausted.
- **When the balance hits zero**, behaviour depends on a per-parent **auto-credit toggle**:
  - **Toggle OFF (default for all parents):** the wallet cannot go negative without admin action.
  - **Toggle ON (per trusted parent, set by admin):** the wallet may go into an outstanding invoice (negative balance) without a cap. The shortfall is recorded as a receivable; the parent settles later.
- **Bookings always proceed**, even if a parent has an outstanding balance. The system surfaces the outstanding amount on the booking confirmation (UI + SMS) so the parent is reminded.
- Admin can see all outstanding invoices, toggle auto-credit per parent, and adjust limits over time.
- Top-up history, deductions, outstanding invoices and child-by-child spend are all visible in the parent's account.
- **Refunds** are handled offline (cash / M-Pesa transfer outside the system). The **admin** records the refund entry against the wallet so the ledger stays accurate. Only the admin role can record a refund. The parent is notified by SMS.

Cash and direct M-Pesa-at-counter remain supported as fallbacks for walk-ins.

---

## 4. Users & Roles

| Role | Scope |
|---|---|
| **Parent / Customer** | Self-service: own account, children, top-ups, bookings, history. Logs in via parent phone + PIN. |
| **Reception / Counter Operator** | Operates the booking platform on behalf of walk-in parents; selects the stylist/instructor for each service; records sessions; takes counter payments. Logged in as a reception user on the shared reception computer. |
| **Toy Shop Cashier (POS)** | In-store sales, stock lookup, end-of-day cash-up. Logged in on the POS tablet. |
| **Toy Shop Order Packer** | Online order queue pulled from WooCommerce (pack → ready → dispatched). Same POS app, separate tab. |
| **Accountant** | Expenses, reconciliation, exports. |
| **Admin / Owner** | **Unified access — everything, all units, all reports, all drill-downs, wallet refunds.** |

**Staff members do NOT have personal logins** — Baby Milestones operates with ~4 staff who don't carry their own computers. **Stylists, play attendants, instructors, doulas, and event staff are stored as data records (for commission and reporting attribution), not as system users.** Service attribution is captured by the reception operator at booking/check-out time. Stylists can view their commission summary on the shared reception computer without authenticating (a public-but-named-stylist screen).

**Rule:** Login-bearing roles (parent, reception, cashier, packer, accountant, admin) are scoped to their function. One person can hold multiple login roles.

---

## 5. Module 1 — Mom Coaching & Birth Doula

- Catalogue of coaching offerings across **pregnancy → birth → early parenting**.
- 1:1 sessions (booked with a specific coach/doula) and group sessions both supported.
- Booking → wallet deduction or M-Pesa at booking.
- Coach sees own roster, attendance, and session notes.
- Reminder SMS before each session.

---

## 6. Module 2 — Play Area (supervised, timed)

**Model:** physical supervised play. A child is dropped off; an attendant supervises; parent picks up later.

- **Session = 2–3 hours** (exact value **configurable per package**).
- Pricing options the parent can choose between:
  - **Drop-in (one-off)** — single session, charged from wallet or paid at counter.
  - **Weekly subscription** — N sessions per week.
  - **Monthly subscription** — N sessions per month.
- Subscriptions can be **paused / frozen** (by parent or admin). Unused entitlement carries over when resumed.
- The system **tracks actual hours stayed** per child (clock-in / clock-out).
- Pricing rules are **changeable from the admin panel** without code changes.
- **Pickup Report** — at hand-off the parent receives a report containing:
  - Drop-off time, pickup time, total time on site.
  - Attendant on duty.
  - Activities the child took part in.
  - **Free-text observations** — attendants type whatever they observed (no required fields, no fixed tags).
- Report is shown in the parent's account and (optionally) SMS-summarised at pickup.

---

## 7. Module 3 — Talent Center

- **Disciplines:** ballet, gymnastics, crafts, music (extendable).
- **Age range:** 2.5 to 12 years.
- **Pricing options** (same shape as Play Area):
  - **Drop-in** (one-off class)
  - **Weekly subscription**
  - **Monthly / termly subscription**
- Subscriptions can be **paused / frozen**; entitlement carries over.
- Booking via parent account; payment from wallet (or M-Pesa direct).
- Instructor sees daily roster, marks attendance, can log notes that feed the parent's child report.
- **Recitals / events** (e.g. ballet showcase) are bookable as separate ticketed events.

---

## 8. Module 4 — Kids-Only Salon

- Online booking + walk-ins.
- Stylist scheduling (no double-booking).
- Counter payment from wallet, M-Pesa, or cash.
- **Commission-based stylist compensation** — each stylist has a configurable commission percentage. Every completed service writes a commission line attributable to that stylist for reporting and payout.
- Stylist sees only their own day and their own earned commission.

---

## 9. Module 5 — Toy Shop *(in-store POS + standalone WooCommerce)*

The toy shop now spans **two systems with a one-way-ish sync between them**:

**A. In-store POS** (part of this custom platform, app: `apps/pos`)
- Product catalogue + stock model lives in our database (`packages/catalog`). POS is the **source of truth for inventory**.
- Product schema includes **age-appropriateness** fields (`age_min`, `age_max`) — every toy carries its recommended developmental age range; cashier sees age-stage prompts to help guide the parent.
- POS: barcode scan, M-Pesa STK / cash / Paystack card / wallet, printed + SMS receipt, real-time stock decrement.
- **POS hardware is generic** — any tablet or PC browser. Printing uses the system-configured default printer.
- Inventory: goods-received-note, low-stock alerts, stock-take.

**B. Online toy shop** (standalone WooCommerce, **not** in this platform)
- Runs on its own hosting at `shop.babymilestones.example` (or similar), with its own auth, its own admin, its own checkout, and its **own M-Pesa plugin** for payments.
- Customers shop and pay entirely within WooCommerce. They do **not** have Baby-Milestones accounts via this site; **no SSO**.
- **No wallet** integration: Woo customers cannot pay with Baby-Milestones wallet credit.
- **No loyalty** on online toy purchases. Loyalty is only earned on bookings/services in the custom platform.

**C. Sync layer (POS ↔ WooCommerce)**
- **Pull (periodic, default every 2 min):** POS fetches new and updated WooCommerce orders via the WC REST API into a local `wc_orders` mirror. They surface in a separate "Online Orders" tab in the same POS app.
- **Push (on stock change):** Every local stock-mutating event (in-store sale, GRN, stock-take, adjustment) pushes the new `stock_quantity` to the matching Woo product by **SKU**. Per-SKU debounce collapses bursts. This is what prevents online overselling of an item just sold in the shop.
- **Order workflow:** POS staff advance the local order (New → Packing → Ready → Dispatched → Fulfilled). Each transition writes back to WooCommerce (`processing` / `completed` / `cancelled`) so the customer sees the correct status. Customer-facing email/SMS is sent by WooCommerce, not by this platform.
- **Reconciliation:** nightly job compares local and Woo stock per mapped SKU and reports any drift.
- **Failure handling:** failed REST calls go to a retry queue with exponential backoff, then a **dead-letter** view in the admin for manual resolution.

What this means in practice:
- A customer browsing the WooCommerce site sees the same stock numbers as the physical shelf (within the sync window).
- An order placed online appears in the POS within ~2 minutes for the packer to handle.
- A toy sold at the counter is reflected as out-of-stock online within seconds.
- WooCommerce is replaceable without re-architecting the custom platform — only the sync layer cares.

---

## 10. Module 6 — Reading Corner & Events

- Calendar of recurring kids' events: **Craft Saturday**, drawing days, story time, reading corner sessions.
- Public booking + capacity tracking.
- Free events still capture RSVP (for capacity); paid events deduct from wallet.
- Attendance recorded for the child's history.

---

## 10a. Loyalty Points *(cross-cutting)*

A configurable points programme for **parents** (not staff). Points are earned on spend and redeemable as wallet credit.

- **Earning rule** — admin-configurable: "spend X KES → earn 1 point". Default example: **100 KES = 1 point**.
- **Redemption rule** — admin-configurable: "1 point = Y KES". Default example: **1 point = 1 KES**.
- Both rates are editable from the admin panel at any time; changes apply to **future** earnings/redemptions only (historical balances unaffected).
- Points accrue **only on settled payments**. Outstanding-invoice charges do **not** earn points until the parent pays the invoice; on settlement, points are credited for the now-paid amount.
- Points accrue on every settled paid touchpoint in the custom platform: salon, play, talent, doula, classes, events, and **in-store** toy-shop POS sales. **Online toy purchases (WooCommerce) do not earn or redeem loyalty** — see Decision 37.
- Redemption: parent can apply points at checkout / booking; redeemed points convert to wallet credit at the configured rate and are deducted on use.
- **Refund clawback:** when admin records a refund (e.g., for unconsumed sessions in a package), the points that were earned on the refunded amount are deducted proportionally. If the parent's points balance is insufficient, the difference is recorded as a negative loyalty entry that future earnings repay.
- Points balance, earning history, redemption history, and clawback entries are visible in the parent's account alongside wallet movements.
- Admin can manually adjust (credit / debit) a parent's points balance with an audit-logged reason (e.g., goodwill, correction).
- Out of scope at launch: tiered programmes (silver/gold), point expiry, referral bonuses — can be added later without schema breakage.

---

## 11. Module 7 — Feedback & Reviews *(cross-cutting)*

- After every paid touchpoint (salon visit, play session, class, doula session, order), parent gets a one-tap **0–5 rating + optional comment**.
- Feedback is attached to:
  - The unit (Salon, Play, Talent…)
  - The specific staff member who handled the visit.
- Admin reviews feedback by staff and by unit — doubles as a **lightweight employee performance signal**.

---

## 12. Module 8 — Admin / HQ

- **Unified dashboard** showing today's revenue and activity across **every unit of the custom platform** (including in-store toy POS). Online toy-shop revenue lives in WooCommerce's own admin; the only Woo-derived view in this dashboard is the **fulfilment queue + sync health** card.
- One-click **drill-down** from any total to the underlying transaction.
- Reports per unit (revenue, attendance, top staff, top products, peak hours).
- **Expenses module** (with categories, recurring expenses, receipts).
- **Consolidated P&L** by period, with period-on-period comparison.
- **Exports** to PDF and Excel/CSV.
- **Audit log** of who did what, when.
- **Wallet refund recording** (admin-only).

---

## 13. Cross-Cutting Requirements

| Area | Detail |
|---|---|
| **Auth** | Phone + PIN/password for parents; staff accounts via admin; password reset by SMS code. |
| **Payments** | M-Pesa STK-push, **card via Paystack** (Visa / Mastercard — Stripe not available in Kenya), and direct bank transfer for top-ups; cash at counters. Wallet is the primary settlement mechanism. |
| **Refunds** | Recorded by admin only; cash/M-Pesa movement happens offline; ledger entry + SMS to parent. |
| **SMS** | Booking confirmations, reminders, top-up receipts, pickup report summaries, order updates. Templates editable. Provider integration is **deferred** — a stub adapter ships at launch (logs to DB / no-op). |
| **SMS provider config** | Simple admin table with fields: **Sender ID**, **API URL**, **API key**. Live integration wired up once a provider is selected and sender ID is registered. |
| **Receipts** | Print + SMS at launch. **ETR / eTIMS deferred** — added later when client is ready. |
| **Roles & permissions** | Each staff role scoped to its unit; sensitive actions (refunds, voids, expense delete) require an authorised role. |
| **Audit log** | Every create/update/delete recorded with user + timestamp. |
| **Backups** | Daily automated backup; retention configurable; restore procedure tested at commissioning. |
| **Security** | HTTPS everywhere; hashed passwords; encrypted secrets; session timeout on idle counter terminals. |
| **Branding** | Full branding across landing site, parent account, staff screens, receipts, SMS — design best practices. |
| **Marketing (out of system)** | Click-to-WhatsApp ads and social campaigns are handled outside the platform — the website provides the landing page and booking link they point to. |
| **Wallet float (best practice)** | Customer wallet balances are **customer money held on deposit** (a liability), not the business's revenue. Best-practice handling: **(a)** keep wallet float in a **segregated bank account / dedicated M-Pesa till** separate from operating cash; **(b)** on the ledger, credit a `customer_wallet_liability` account on top-up, and recognise revenue only when the service is delivered (drawing down the liability and crediting the unit's revenue account); **(c)** the admin Treasury screen always reconciles **wallet liability total** against the **segregated account balance** — they must match within float-in-transit. To be confirmed with the client's accountant for Kenyan compliance specifics. |
| **Language** | **English only** at launch. (Swahili / multilingual deferred — not retrofitted into copy strings now.) |

---

## 14. Technical Architecture (short version)

- **Web app** (Next.js + Tailwind), responsive — works on parent phones and counter tablets.
- **Backend:** Node.js / TypeScript API — **one API serves all front-end apps**.
- **Database:** **Single PostgreSQL instance with a single shared schema** for all apps. One unified data model → straightforward joins and consolidated reporting.
- **Single Sign-On across the custom apps** — one credential set works across the parent portal, the POS, and the admin console. Role determines which app is accessible. (The standalone WooCommerce site is **not** part of this SSO — it has its own customer accounts.)
- **Hosting:** Cloud (AWS / DigitalOcean), yearly hosting cost.
- **Payments:** M-Pesa Daraja (STK + callbacks) for top-ups and direct charges; **Paystack** for card payments (hosted checkout + webhooks).
- **SMS:** Provider-agnostic — configured via Sender ID + API URL + API key in admin. **Live integration deferred.**
- **Online toy shop** is a **standalone WooCommerce site** on its own hosting and database. The POS app syncs to it (orders pulled, stock pushed) via WC REST API. The custom platform does **not** serve the online storefront.
- **No native app, no local install** — training is delivered as part of handover.

---

## 15. Phased Delivery (baselined)

| Phase | Scope | Estimate |
|---|---|---|
| **1 — Foundation + Wallet + Parent Account** | Identity & SSO, parent + child registry, wallet ledger (immutable), M-Pesa STK + Paystack card + bank-transfer top-ups, Reception operator surface, Treasury & float reconciliation, service catalogue + pricing, KRA-shaped receipts, SMS stub, admin shell + RBAC, parent dashboard, observability + CI/CD. | **12–14 wks** |
| **2 — Bookings, Subscriptions, POS, Loyalty Redemption** | Booking engine (services + classes), subscriptions w/ pause + carryover, pickup authorisation + observation log, POS in-store mode, loyalty redemption UI, backup-retention configurability. | 8–10 wks |
| **3 — Commission, Salon, Events, Reporting** | Attribution + monthly commission ledger, salon flow, named-not-auth stylist commission viewer, loyalty engine with refund clawback, operational reporting, scheduled jobs runner (commissions, anonymisation, SMS retry). | 8–10 wks |
| **4 — WooCommerce Sync + Events Ticketing** | WooCommerce site provisioned separately (out of custom-build scope). Custom side: typed WC REST client, order pull job, status push-back, stock-by-SKU push with reconciliation, sync-health surface, plus recital/event ticketing with guest checkout. | 3–4 wks |
| **5 — Coaching, eTIMS, SMS Go-Live, Polish** | Mom Coaching + Doula bookings, eTIMS writer swap, live SMS provider, advanced reporting / cohort analytics, marketing site polish, feedback engine. | 6–8 wks |

Phase 1 is the prerequisite; the rest can be reshuffled. **The P1 estimate accounts for** Safaricom Daraja credential lead time, KRA receipt-schema legal review, and the size of the Reception operator surface.

---

## 16. Decisions Locked In

| # | Topic | Decision |
|---|---|---|
| 1 | ETR / eTIMS | Deferred — standard receipts at launch; ETR added later. |
| 2 | Wallet refunds | Offline movement; admin records the ledger entry. No self-service refunds. |
| 3 | Subscription pause/freeze | Supported on both Play Area and Talent Center; entitlement carries over. |
| 4 | Pickup report observations | Free-text. Attendants type whatever they observed. |
| 5 | Toy age-stage guidance | Per-product age-appropriateness fields on every toy. |
| 6 | Stylist commission | Commission-based, configurable percentage per stylist. |
| 7 | Branding | Full branding using best practices. |
| 8 | SMS configuration | Sender ID + API URL captured in admin after Safaricom (or other provider) registration. |
| 9 | Card payments | **Supported online via Paystack** (Visa / Mastercard / card-on-file). Paystack is used because Stripe is not available in Kenya. Card is available wherever M-Pesa is in the **custom platform** — wallet top-ups, class/event booking. The WooCommerce online toy shop handles its own card / M-Pesa payments via Woo plugins (separate config). Offline card terminals at the counter are out of scope. |
| 10 | Toy Shop delivery | Online delivery is configured **inside WooCommerce** (Woo shipping zones + methods). Custom platform no longer holds a delivery-methods table. The chosen Woo shipping method is read from the order during sync and shown on the POS packing slip. |
| 11 | Loyalty programme | **Included.** Configurable earning rate (default 100 KES = 1 pt) and configurable redemption rate (default 1 pt = 1 KES). Parents only — no staff loyalty. |
| 12 | Multi-branch | **Single complex only** at launch. Data model does not need multi-branch from day one; can be added later. |
| 13 | POS hardware | **Generic.** Any tablet/PC browser; receipts print to the **system-configured default printer**. No specific hardware mandated or supplied. |
| 14 | Staff portal | **No staff portal.** Stylists / instructors / attendants don't have personal logins. Services are attributed to them as data records via the reception operator. Stylists view commissions on the shared reception computer (named, not authenticated). |
| 15 | Commission payout | **Monthly cadence by default.** Admin can run ad-hoc calculation and process payout at any time (e.g., on the 15th). |
| 16 | Database & schema | **Single PostgreSQL DB with a single shared schema** across all apps — for one unified business view and clean cross-unit reporting. (Reverses the earlier "schemas-per-unit" idea.) |
| 17 | Single Sign-On | **One credential set works across all custom apps in the suite** (parent portal, POS, admin). Role gates which app a user can access. The standalone WooCommerce site is excluded — it has its own customer accounts. |
| 18 | Wallet pay-as-you-go | Non-subscribed children: every visit auto-deducts the per-session price from the wallet. **When the balance is exhausted, an outstanding-invoice (negative balance) is recorded** as a receivable; the parent settles later. Trust-based — admin can toggle the auto-credit allowance per parent. |
| 19 | SMS integration | **Live SMS deferred.** A stub adapter ships at launch. Admin config table fields: **Sender ID**, **API URL**, **API key** — wired up when a provider is chosen. |
| 20 | Outstanding-invoice cap | **No cap** at launch. Auto-credit is **off by default** for every parent; admin toggles it on per trusted parent. Bookings always proceed; the system surfaces any outstanding balance on the booking confirmation (UI + SMS). |
| 21 | Loyalty × outstanding invoices | Points are credited **only when the parent pays**. Invoiced (unpaid) amounts do not earn points; once settled, the corresponding points are awarded. |
| 22 | Loyalty × refunds | **Proportional clawback** — when admin records a refund, the points originally earned on the refunded portion are deducted. If the balance is insufficient, a negative-loyalty entry is recorded and future earnings repay it. |
| 23 | Language | **English only** at launch. No i18n scaffolding required at MVP. |
| 24 | Landing + booking | **One single-app surface.** Public landing pages (marketing, unit pages, "Book now" deeplinks) and the authenticated parent dashboard live in **one Next.js app** with public + authenticated route groups. |
| 25 | Toy-shop checkout data | **Owned by WooCommerce.** WC checkout configuration determines what's collected (phone, email, address, shipping method). Custom platform reads whatever Woo gives it on order pull and shows it on the packing slip — no custom checkout in our scope. |
| 26 | Delivery methods | **Configured in WooCommerce** (Woo shipping zones / shipping methods). The custom platform no longer maintains a separate delivery-methods catalogue. **The POS still doubles as the online-order workstation** — it pulls Woo orders and shop staff dispatch them from the same screen they use for in-store sales. |
| 27 | Wallet float segregation | **Best practice applied.** Wallet float held in a **segregated bank / M-Pesa till** (separate from operating cash). The ledger tracks `customer_wallet_liability` separately from unit revenue. Admin Treasury screen reconciles liability total against the segregated-account balance. Client's Kenyan accountant to confirm specifics. |
| 28 | Event ticket guest checkout | **Guest checkout supported** for recitals / ticketed events — buyer enters name + phone (and email if delivering an e-ticket). No parent account required. SMS receipt sent. Account-holders get the same flow with their details prefilled. |
| 29 | Observation retention | Free-text pickup-report observations retained for **24 months**, then anonymised (parent + child identifiers stripped; aggregate text retained for operational learning). Kenya Data Protection Act compliant. |
| 30 | Receipt schema (eTIMS-ready) | Receipt table designed **KRA-shaped from day one** (control unit number, CU invoice number, PIN fields, QR placeholder) — fields are nullable / unused at launch. Future eTIMS integration is a **writer swap, not a migration**. |
| 31 | Auto-debit trigger | Wallet debit occurs at **child check-in**, not at booking. Booking creates a `pending` invoice; check-in settles it from wallet (and creates outstanding-invoice entry if balance insufficient and auto-credit is enabled). |
| 32 | Outstanding-invoice settlement | When a parent tops up, the system applies the top-up **FIFO against outstanding invoices first**, residual to wallet. **Partial settlements are allowed** — an invoice may remain open with a reduced balance after a partial top-up. |
| 33 | P1 timeline | Revised from "8–10 weeks" (suggested) to **12–14 weeks** to reflect real-world constraints: Safaricom Daraja credential lead time (3–6 wks), KRA receipt-schema legal review, and the actual size of the Reception operator surface. Subsequent phases are re-baselined accordingly. |
| 34 | Loyalty redemption UI | **Deferred from P1 to P2.** Loyalty *earning* ships with the wallet in P1 (ledger correctness requires it from day one). The redemption UI / checkout integration lands in P2 alongside booking. |
| 35 | Backup retention | **30-day daily backup retention, fixed, in P1.** Admin-configurable retention (e.g., 30 daily + 12 monthly) lands in P2. |
| 36 | Native mobile app | **Out of scope.** The parent dashboard is mobile-web responsive. A native shell will be reconsidered post-launch if retention data justifies it. |
| 37 | **Online toy shop = standalone WooCommerce** | The online toy shop runs on a **separate WooCommerce site** (own hosting, own DB, own auth, own checkout, own M-Pesa plugin). **Not** part of the custom monorepo. **Single integration:** the POS app pulls Woo orders and pushes stock by SKU on a schedule. **POS is the source of truth for inventory.** No SSO, no wallet on Woo, no loyalty on Woo purchases. Reverses prior decisions 25 and 26 to the extent they assumed a custom storefront, and shrinks Phase 4 from 8–10 wks to 3–4 wks. |

---

## 17. Next Steps

1. Client review of this revised document.
2. Sign-off of scope.
3. Commercial proposal against signed-off scope.
4. Kick-off of Phase 1.
