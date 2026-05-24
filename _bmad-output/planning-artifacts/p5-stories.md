# Baby Milestones — Phase 5 Stories

*Source: `epics.md` · Phase 5 (Coaching, eTIMS, SMS Go-Live, Polish — 6–8 weeks)*

Phase 5 closes the loop on the 7-unit vision: Mom Coaching & Birth Doula goes live, eTIMS receipt integration swaps in, SMS goes live with a registered provider, the 0–5 feedback engine fires after every paid touchpoint, and the marketing site gets its polish.

**Prerequisite:** P1 + P2 + P3 + P4 shipped.

**Phase 5 epic index:**
- P5-E01 Mom Coaching & Birth Doula
- P5-E02 eTIMS Writer Swap
- P5-E03 SMS Go-Live
- P5-E04 Feedback Engine
- P5-E05 Advanced Reporting / Cohort Analytics
- P5-E06 Marketing Site Polish

---

## P5-E01 — Mom Coaching & Birth Doula

### P5-E01-S01 — Coaching catalogue (1:1 + group)
**JTBD:** As admin, I want to manage coaching offerings across pregnancy → birth → early parenting.
**AC:**
- AC1: New unit `coaching` in the service taxonomy.
- AC2: Each offering: name, description, format (`one_to_one`|`group`), price, duration, optional age-stage tags ("expecting", "0-3mo", "3-6mo"...).
- AC3: Coach assigned as a `staff` record (no login).
- AC4: Admin CRUD with audit.
**Deps:** P1-E07, P3-E01-S01.

### P5-E01-S02 — Coach availability and 1:1 booking
**JTBD:** As a parent, I want to book a 1:1 session with a specific coach at a time that works.
**AC:**
- AC1: Coach availability defined as in P3-E03-S01.
- AC2: Parent selects offering → coach → date → time.
- AC3: 1:1 sessions hold the slot privately (capacity=1).
- AC4: Payment via wallet or direct (M-Pesa / Paystack).
- AC5: SMS-stub confirmation; reminder day-before; loyalty earns on settle.
**Deps:** S01, P2-E01.

### P5-E01-S03 — Group session booking
**JTBD:** As a parent, I want to attend a group session (e.g., "Newborn Care, Saturday") with other parents.
**AC:**
- AC1: Group sessions defined as slots with capacity > 1.
- AC2: Parents book individual seats; bookings list shows seats remaining.
- AC3: Same payment and reminder flows as 1:1.
**Deps:** S01, S02.

### P5-E01-S04 — Coach session notes (private)
**JTBD:** As a coach (operated via Reception), I want to log private session notes per parent.
**AC:**
- AC1: After session check-out, Reception (or admin acting for coach) records private notes.
- AC2: Notes visible to admin and the named coach only (via the named-not-auth viewer in P3-E02, scoped to their own records).
- AC3: Notes are NOT shown to parents.
- AC4: 24-month retention then anonymisation (consistent with Decision 29).
**Tech:** Encrypt notes at rest (column-level) — coaching content is sensitive.
**Deps:** S02.

### P5-E01-S05 — Sensitive flow: discreet billing labels
**JTBD:** As a new mom, I want my receipts and SMS to be discreet ("BM Coaching" rather than service detail).
**AC:**
- AC1: Coaching service line on receipts uses a configurable display label ("BM Coaching Session").
- AC2: SMS templates for coaching use neutral language.
- AC3: Admin can toggle this per service.
**Deps:** P1-E08, P1-E09.

---

## P5-E02 — eTIMS Writer Swap

### P5-E02-S01 — eTIMS adapter implementation
**JTBD:** As the system, I want to call KRA eTIMS APIs to record taxable receipts.
**AC:**
- AC1: New writer `EtimsReceiptWriter` implements the same interface from P1-E08-S02.
- AC2: Calls eTIMS endpoints with: PIN, business details, invoice items + tax, idempotency key.
- AC3: Populates the previously-nullable KRA fields on the receipt (control_unit_number, cu_invoice_number, qr_data).
- AC4: Connection details + PIN stored as encrypted secrets (env-refs, not literal).
- AC5: Decision refs: 1, 30.
**Tech:** Hosted KRA test env for staging; production switch via admin setting + env var.
**Deps:** P1-E08.

### P5-E02-S02 — eTIMS retry + dead-letter
**JTBD:** As the system, if KRA is down, I shouldn't lose the receipt.
**AC:**
- AC1: Failures queued to `kra_etims_queue` for retry by the jobs runner.
- AC2: Exponential backoff up to 24h; alert if dead-lettered.
- AC3: Admin can manually retry / inspect failures from Settings.
**Deps:** S01, P3-E06.

### P5-E02-S03 — Switch flag with rollback
**JTBD:** As admin, I want to enable/disable eTIMS without code deploy.
**AC:**
- AC1: Settings flag `receipts.etims_enabled`.
- AC2: Off → `LocalReceiptWriter` (P1); On → `EtimsReceiptWriter`.
- AC3: Audit on flag change.
- AC4: New receipts only — historical ones not retroactively re-issued.
**Deps:** S01, P1-E10-S04.

### P5-E02-S04 — VAT registration metadata
**JTBD:** As admin, I want to record the company PIN and VAT registration once.
**AC:**
- AC1: Settings → Tax → fields: PIN, VAT registration number, registered address.
- AC2: Receipt renderer (PDF + thermal) shows these in the footer block.
**Deps:** S01.

---

## P5-E03 — SMS Go-Live

### P5-E03-S01 — Live SMS adapter (provider-agnostic)
**JTBD:** As the system, I want to actually send SMS instead of logging stubs.
**AC:**
- AC1: New implementation `LiveSmsAdapter` reads provider config from `sms_config`.
- AC2: Posts to the configured URL with auth as per provider.
- AC3: Records send result + provider message ID in `sms_outbox`.
- AC4: SSRF guard (P1-E09-S02) re-validated.
- AC5: Decision refs: 19.
**Tech:** Provider-agnostic shape — works with Africa's Talking, Twilio, or others per Decision 19.
**Deps:** P1-E09.

### P5-E03-S02 — Live/stub switch flag
**JTBD:** As admin, I want to flip the stub off when the sender ID is registered.
**AC:**
- AC1: Settings flag `sms.live_enabled`.
- AC2: Off → `StubAdapter`; On → `LiveSmsAdapter`.
- AC3: Audit on flag change.
**Deps:** S01, P1-E10-S04.

### P5-E03-S03 — Rate limit + cost control
**JTBD:** As admin, I want a guardrail against runaway SMS spend.
**AC:**
- AC1: Per-day total cap (default 10,000) and per-recipient daily cap (default 10).
- AC2: Exceeding caps queues the message for next day and alerts admin.
- AC3: Admin can adjust caps in Settings.
**Deps:** S01.

### P5-E03-S04 — Template editor (admin)
**JTBD:** As admin, I want to edit SMS bodies without code changes.
**AC:**
- AC1: Settings → SMS Templates → list + edit.
- AC2: Placeholder validation: missing `{name}` etc. flagged.
- AC3: New version on save; old versions retained.
**Deps:** P1-E09-S03.

---

## P5-E04 — Feedback Engine

### P5-E04-S01 — 0–5 rating after every paid touchpoint
**JTBD:** As a parent, I want to rate every interaction in one tap so the business improves.
**AC:**
- AC1: Triggered when a `bookings.status='completed'` event fires (salon checkout, play pickup, talent class end, doula session end, order fulfilled).
- AC2: SMS-stub link OR in-app prompt; one-tap 0–5 stars + optional 200-char comment.
- AC3: Single submission per touchpoint; idempotent.
- AC4: Decision refs: Spec Module 7.
**Tech:** `feedback` table: source_type, source_id, parent_id, attributed_staff_id, rating, comment, submitted_at.
**Deps:** P2-E03, P3-E03, P4-E02.

### P5-E04-S02 — Feedback dashboard by unit and by staff
**JTBD:** As admin, I want to see who and what is delighting (or disappointing) parents.
**AC:**
- AC1: Unit-level averages, distributions; staff-level averages with min-sample-size guardrail (avoid one-star surprises).
- AC2: Filterable by date range.
- AC3: Click → individual responses (anonymised view by default; admin can de-anonymise with audit).
**Deps:** S01.

### P5-E04-S03 — Negative feedback alert
**JTBD:** As admin, I want to know immediately when a rating ≤ 2 lands.
**AC:**
- AC1: New feedback ≤ 2 → in-app alert + SMS to admin within 5 minutes.
- AC2: Alert links to the feedback detail.
**Deps:** S01.

### P5-E04-S04 — Public review snippets (optional)
**JTBD:** As marketing, I want top-rated comments visible on the public site as social proof.
**AC:**
- AC1: Admin curates which 5-star comments to publish; anonymisation enforced ("Parent of two, Nairobi").
- AC2: Public site shows curated quotes on home page.
- AC3: Audit on publication.
**Deps:** S01, P5-E06.

---

## P5-E05 — Advanced Reporting / Cohort Analytics

### P5-E05-S01 — Consolidated P&L by period
**JTBD:** As owner / accountant, I want a single consolidated P&L for the complex.
**AC:**
- AC1: Per-unit revenue, direct costs (GRN-based for shop), expenses (from expenses module), net.
- AC2: Period comparison: this month vs last month, this year vs last year.
- AC3: PDF + Excel exports.
- AC4: Decision refs: Spec Module 8.
**Deps:** P3-E05, P4-E01.

### P5-E05-S02 — Cohort retention by signup month
**JTBD:** As marketing, I want to see how many parents from each signup month are still active.
**AC:**
- AC1: Cohort matrix: signup month × months since signup; cell = % still active.
- AC2: "Active" definition configurable (default: at least 1 paid touchpoint in the last 30 days).
**Deps:** P3-E05.

### P5-E05-S03 — Repeat-attendance metrics for events and classes
**JTBD:** As admin, I want to know which classes keep parents coming back.
**AC:**
- AC1: Per-class table: total attendees, % who attended another class, average classes attended.
- AC2: Filterable by date.
**Deps:** P4-E05, P5-E01.

### P5-E05-S04 — Wallet float vs revenue snapshot
**JTBD:** As accountant, I want a daily report on how much customer money is sitting in wallets vs revenue earned.
**AC:**
- AC1: Daily snapshot: `customer_wallet_liability` total, segregated-account balance, prior-day delta, revenue earned that day.
- AC2: 90-day chart of float vs revenue.
**Deps:** P1-E06, P3-E05.

### P5-E05-S05 — Expenses module
**JTBD:** As accountant, I want to record expenses against business units and shared overhead.
**AC:**
- AC1: `expenses` table: date, category, business_unit_id (nullable), amount, payment_method, reference, receipt_attachment_url, recurring_template_id (nullable).
- AC2: Admin/accountant CRUD.
- AC3: Recurring expenses auto-create on the configured day.
- AC4: Expenses subtract from unit revenue in P&L.
**Deps:** S01.

### P5-E05-S06 — Tax-ready exports
**JTBD:** As accountant, I want VAT-formatted exports once eTIMS is live.
**AC:**
- AC1: Per-period: total taxable supplies, VAT charged, exempt supplies.
- AC2: PDF + Excel.
**Deps:** S01, P5-E02.

---

## P5-E06 — Marketing Site Polish

### P5-E06-S01 — Brand polish pass
**JTBD:** As marketing, I want the public site to look as good as the product feels.
**AC:**
- AC1: Photography swap (real children, real moments); design system tokens applied uniformly.
- AC2: Typography refined; weight + scale aligned with brand guidelines.
- AC3: All animations capped at 200ms; no jank.
**Deps:** Brand guidelines.

### P5-E06-S02 — SEO + performance budget tightening
**JTBD:** As marketing, I want the site to rank and load fast.
**AC:**
- AC1: Lighthouse 95+ on Performance, SEO, Accessibility.
- AC2: All public pages: meta tags, Open Graph, structured data (LocalBusiness).
- AC3: LCP < 1.5s on 3G fast.
**Deps:** S01.

### P5-E06-S03 — CMS-driven unit pages
**JTBD:** As admin (non-developer), I want to edit unit pages without a deploy.
**AC:**
- AC1: Admin → Pages → CRUD for unit pages: hero copy, image, CTA, body sections.
- AC2: Preview before publish.
- AC3: Revisions retained.
**Tech:** Lightweight CMS in DB; renders on platform public group.
**Deps:** P1-E12, P1-E10.

### P5-E06-S04 — Blog / stories (optional)
**JTBD:** As marketing, I want to publish parenting articles for SEO and parent engagement.
**AC:**
- AC1: Article model with title, slug, body (MDX), cover image, tags, author.
- AC2: Admin CRUD.
- AC3: Public list + detail pages; share buttons.
- AC4: This is flagged optional — cut if P5 is tight.
**Deps:** S03.

### P5-E06-S05 — Social proof + testimonials
**JTBD:** As marketing, I want curated feedback (P5-E04-S04) visible on the home page.
**AC:**
- AC1: Auto-pulls latest 3 published reviews from P5-E04-S04.
- AC2: Caches; updates within 1h of curation.
**Deps:** P5-E04-S04.

---

*End of P5 stories. End of phased backlog.*
