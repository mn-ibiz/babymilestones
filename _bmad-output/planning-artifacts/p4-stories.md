# Baby Milestones — Phase 4 Stories

*Source: `epics.md` · Phase 4 (WooCommerce Sync + Events Ticketing — 3–4 weeks)*

> **Scope change (locked):** The online toy shop runs on a **standalone WooCommerce site** (separate hosting, own auth, own checkout, own M-Pesa plugin). It is **not** part of this monorepo. P4-E01 (Catalogue), P4-E02 (Storefront), P4-E03 (Delivery Methods) from the original plan are dropped — WooCommerce handles them natively. **No SSO. No wallet integration. No loyalty on Woo purchases.**
>
> What remains in P4: a sync layer between the in-store POS and WooCommerce (orders pulled, status pushed back, stock pushed by SKU; POS is the source of truth for inventory) plus Events & Recital Ticketing.

**Prerequisite:** P1 + P2 + P3 shipped. A WooCommerce site provisioned (separate ops track).

**Phase 4 epic index:**
- P4-E04 POS ↔ WooCommerce Sync
- P4-E05 Events & Recital Ticketing

---

## P4-E04 — POS ↔ WooCommerce Sync

### P4-E04-S01 — Online orders tab in POS (pulled from WooCommerce)
**JTBD:** As shop staff, I want to see online orders from the same screen I sell from, pulled in from our standalone WooCommerce site.
**AC:**
- AC1: New tab "Online orders" alongside the in-store sale tab.
- AC2: Queue shows New orders first with a subtle alert tone (toggle-able).
- AC3: Per-order card: items, qty, customer name + phone last 4, delivery method (from Woo shipping), payment status (from Woo).
- AC4: Filter chips: New, Packing, Ready, Dispatched, Fulfilled.
- AC5: Reads from local `wc_orders` mirror populated by sync (S07); no live Woo call on render.
- AC6: Each card shows source Woo order ID and last-synced timestamp.
**Deps:** P2-E04, S06, S07.

### P4-E04-S02 — Order status transitions sync back to WooCommerce
**JTBD:** As shop staff, I want to advance an order's status as I work it, and have WooCommerce reflect the change.
**AC:**
- AC1: Action sheet: Start packing / Mark ready / Mark dispatched / Mark fulfilled / Cancel.
- AC2: Transitions write to local `order_events` and enqueue a Woo writeback via the sync layer.
- AC3: Local → Woo status mapping (configurable): packing→processing, ready→processing+note, dispatched→completed+tracking-note, fulfilled→completed, cancelled→cancelled.
- AC4: No skipping; admin role to reverse.
- AC5: Dispatched captures rider/courier name, vehicle/contact, time — appended as Woo order note.
- AC6: Failed writebacks retried by S07; permanent failures land in dead-letter.
- Note: customer notifications come from WooCommerce's own email/SMS — the custom system does **not** send SMS for online orders.
**Deps:** S01, S06, S07.

### P4-E04-S03 — Print packing slip
**JTBD:** As a packer, I want to print a packing slip per WooCommerce order.
**AC:**
- AC1: "Print packing slip" button on order card.
- AC2: Slip lists Woo order #, customer name+phone, shipping address, delivery method, items+qty, customer note.
- AC3: System default printer (Decision 13).
- AC4: Renders from `wc_orders` mirror — no live Woo call.
**Deps:** S01, P1-E08.

### P4-E04-S04 — Daily dispatch report
**JTBD:** As shop ops, I want an end-of-day summary of online orders dispatched and pending.
**AC:**
- AC1: Covers WooCommerce-originated orders only.
- AC2: Counts by `local_status`, total value (KES), avg pack time, avg dispatch time.
- AC3: CSV export.
- AC4: Date filter; defaults to today.
- AC5: "Sync health" row links to dead-letter view.
**Deps:** S02.

### P4-E04-S05 — Stock push: POS catalogue stock changes propagate to WooCommerce
**JTBD:** As shop ops, I want every change to physical-shop stock to flow to WooCommerce automatically.
**AC:**
- AC1: Every stock-mutating event (in-store sale, GRN, stock-take, online-order fulfilment, manual adjust) enqueues a Woo push.
- AC2: Keyed by SKU; local `products.woo_product_id` maps to Woo; missing mapping = no-op.
- AC3: Push updates `stock_quantity` + `stock_status` (in/outofstock) via Woo REST.
- AC4: Per-SKU debounce (default 5s) collapses bursts.
- AC5: Admin SKU mapping screen; bulk CSV import.
- AC6: Nightly reconciliation report flags drift between local and Woo stock.
- Note: POS is source of truth; never read Woo stock back into local.
**Deps:** P2-E04, S06, S07.

### P4-E04-S06 — WooCommerce REST client + credentials config
**JTBD:** As a developer (and admin), I want a single typed client for the Woo REST API with credentials managed in admin.
**AC:**
- AC1: New `packages/woocommerce` exporting typed methods: `listOrders`, `getOrder`, `updateOrderStatus`, `addOrderNote`, `getProduct`, `updateProductStock`, `listProducts`.
- AC2: Auth: WC consumer key + secret (HTTP Basic over HTTPS).
- AC3: Admin Settings → WooCommerce panel: site URL, key, secret, "Test connection". Secrets encrypted at rest, write-only.
- AC4: Test connection hits `/system_status` and reports OK / status+error.
- AC5: Typed errors: `WooNotFound`, `WooRateLimited`, `WooAuthFailed`, `WooServerError`, `WooNetworkError`. No retry in client.
- AC6: All requests logged via X8-S01 (secrets redacted).
**Deps:** P1-E10-S04, X8-S01.

### P4-E04-S07 — Sync scheduler + dead-letter for WooCommerce calls
**JTBD:** As shop ops, I want orders and stock to stay in sync automatically, with failures surfaced not silently dropped.
**AC:**
- AC1: Job in `apps/jobs` runs every N min (default 2) and pulls orders via `listOrders({ since })`, upserting into `wc_orders`. Checkpoint `since`.
- AC2: `wc_outbox` table holds pending writebacks (statuses from S02, stock pushes from S05). Worker drains FIFO with bounded concurrency.
- AC3: Retry: network/5xx/429 → exponential backoff (1m,5m,30m,2h,6h) ×5, then dead-letter; 4xx (except 429) → 1 retry, then dead-letter.
- AC4: `wc_outbox_dead` with admin UI: replay / mark resolved / discard.
- AC5: Sync health surface: last pull time, queue depth, dead-letter count, last 10 errors; red banner if last pull > 15 min.
- AC6: Per-item logs; audit at summary level (counts, not per-item).
- AC7: "Sync now" admin button for immediate pull.
**Deps:** S06, P3-E06-S01, P1-E10-S04.

---

## P4-E05 — Events & Recital Ticketing

### P4-E05-S01 — Event creation
**JTBD:** As admin, I want to create an event with capacity, date, location, and pricing tiers.
**AC:**
- AC1: `events` table: name, description, unit (`reading_corner` | `talent_recital` | `general`), starts_at, ends_at, venue, capacity.
- AC2: `event_ticket_tiers` table: event_id, name, price_cents, allotment, sale_starts_at, sale_ends_at.
- AC3: Admin CRUD with audit.
- AC4: Decision refs: 28.
**Deps:** P1-E10.

### P4-E05-S02 — Public event listing + detail page
**JTBD:** As a parent or guest, I want to browse upcoming events.
**AC:**
- AC1: Public list on `apps/platform` (public group).
- AC2: Each event detail page shows tiers, remaining capacity per tier, "Buy ticket" CTAs.
- AC3: SEO-friendly URLs.
**Deps:** S01.

### P4-E05-S03 — Ticket purchase with guest checkout
**JTBD:** As a grandparent (no account), I want to buy a recital ticket without registering.
**AC:**
- AC1: Buy flow: quantity → buyer name + phone (+ optional email for e-ticket) → pay (M-Pesa or Paystack).
- AC2: Tickets issued with unique codes; e-ticket SMS-stub link.
- AC3: If buyer is a signed-in parent, prefilled.
- AC4: Decision refs: 28.
**Deps:** S01, P1-E04.

### P4-E05-S04 — Free events (RSVP only)
**JTBD:** As admin, I want some events to be free RSVP for capacity tracking only.
**AC:**
- AC1: Tier with `price_cents=0` → no payment, just RSVP.
- AC2: RSVP collects same info as ticket purchase minus payment.
- AC3: SMS-stub confirmation sent.
**Deps:** S03.

### P4-E05-S05 — Door check-in via ticket code or manual list
**JTBD:** As event staff, I want to admit ticket holders quickly.
**AC:**
- AC1: Check-in screen lists all sold tickets; search by name/phone/code.
- AC2: Mark "checked in"; double-scan blocked.
- AC3: Capacity-against-checkedin counter visible.
- AC4: Code scanner support (browser camera) deferred to P5 polish.
**Deps:** S03.

---

*End of P4 stories.*
