/**
 * Audit catalogue — the canonical, typed registry of what gets audited
 * (X5-S03). This is the single source of truth for every `action` string the
 * `audit()` helper (X5-S01, `@bm/db`) is allowed to record in `audit_outbox` /
 * `audit_log`.
 *
 * Why it lives in `@bm/auth` and not `@bm/db`: `@bm/db` is the lowest layer and
 * must not import upward, so it intentionally types `audit()`'s `action` as a
 * plain `string`. This catalogue is the contract layer above it. Call sites
 * should pass `AuditAction` values (use {@link auditAction} to get a checked,
 * narrowed literal), and the `audit-actions.test.ts` completeness test asserts
 * every `action:` string emitted anywhere in the codebase is registered here —
 * keeping this file the de-facto single source of truth even across the package
 * boundary.
 *
 * AC2 — the catalogue covers, by category:
 *   - all auth events  (signup, login success/failure, logout, PIN change,
 *     password/PIN reset request+complete, staff login)
 *   - all role changes (staff create/update, role change, impersonation)
 *   - all ledger postings (wallet credit/topup, check-in debit, refund)
 *   - refund actions
 *   - settings changes (settings, SMS config, catalogue/service, auto-credit,
 *     treasury float accounts)
 *
 * AC3 — what is explicitly NOT audited: reads, list-views, and page
 * navigation. There are deliberately no `*.read`, `*.list`, or `*.view` actions
 * in this catalogue; the `auth`-layer `read`/`list` permission verbs (see
 * `rbac.ts`) gate access but never produce an audit row. Adding a read/list
 * action here is a contract violation and is asserted against in the tests.
 */

/**
 * The canonical catalogue, grouped by AC2 category. The values are the dotted
 * action names recorded in the audit log. Grouping is for documentation /
 * completeness assertions only; the flat {@link AUDIT_ACTIONS} tuple and
 * {@link AuditAction} union are derived from it.
 */
export const AUDIT_ACTION_CATALOGUE = {
  /** All authentication & credential lifecycle events. */
  auth: [
    "auth.signup",
    "auth.login.success",
    "auth.login.failure",
    "auth.logout",
    "auth.logout.all",
    "auth.staff.login",
    "auth.staff.login.failure",
    "auth.reset.requested",
    "auth.reset.completed",
    "parent.pin.change",
  ],
  /** Role / access-control changes (staff lifecycle, role edits, impersonation). */
  roleChange: [
    "admin.user.create",
    "admin.user.update",
    "admin.user.reset_pin",
    "rbac.impersonate",
  ],
  /** Wallet ledger postings (credits, debits, holds/releases). */
  ledger: [
    "wallet.checkin_debit",
    "payment.cash.topup",
    "payment.bank.record",
    "payment.bank.confirm",
    "payment.mpesa.stk.initiate",
    "payment.mpesa.callback.failed",
    "payment.mpesa.callback.orphan",
    "payment.mpesa.reconcile.succeeded",
    "payment.mpesa.reconcile.failed",
    "payment.mpesa.reconcile.expired",
    "payment.paystack.init",
    "payment.paystack.webhook.credited",
    "payment.paystack.webhook.orphan",
    "reception.topup",
    "reception.record_visit",
    "treasury.reconciliation.adjustment.post",
    "treasury.reconciliation.adjustment.approve",
    "treasury.reconciliation.adjustment.reject",
  ],
  /** Refund actions. */
  refund: ["wallet.refund"],
  /** Settings / configuration changes. */
  settings: [
    "settings.update",
    "wallet.auto_credit_toggle",
    "sms.config.create",
    "sms.config.update",
    "sms.config.delete",
    "sms.live.toggled",
    "sms.template.saved",
    "catalog.service.create",
    "catalog.service.update",
    "catalog.service.price_change",
    "catalog.schedule.create",
    "catalog.schedule.update",
    "catalog.plan.create",
    "catalog.plan.update",
    "catalog.plan.price_change",
    "catalog.staff.create",
    "catalog.staff.update",
    "treasury.float_account.create",
    "treasury.float_account.update",
    "treasury.float_account.delete",
    "woocommerce.config.update",
    "woocommerce.test_connection",
  ],
  /** Child-record lifecycle & consent. */
  child: [
    "child.created",
    "child.updated",
    "child.archived",
    "child.restored",
    "child.consent.photo",
    "parent.consent.sms",
    "parent.created_by_reception",
    "parent.profile.create",
    "parent.profile.update",
  ],
  /** Receipt lifecycle. */
  receipt: ["receipt.reprinted", "receipt.voided", "reception.receipt_sms"],
  /** Data-export lifecycle (request → generate → download). These record the
   * export *event*, not the underlying reads. */
  export: [
    "parent.data.export.requested",
    "parent.data.export.completed",
    "parent.data.export.downloaded",
    "wallet.statement.export",
    "wallet.statement.export.enqueued",
    "wallet.statement.export.completed",
    "treasury.reconciliation.export",
    "report.revenue.export",
    "report.wallet_aging.export",
    "report.dispatch.export",
    "report.pnl.export",
    "report.tax.export",
  ],
  /** Daily DB backup lifecycle (X8-S03) — every run + prune is recorded.
   * `backup.retention.updated` (P2-E06-S01) records an admin changing the
   * configurable retention policy. */
  backup: [
    "backup.run.succeeded",
    "backup.run.failed",
    "backup.run.pruned",
    "backup.retention.updated",
  ],
  /** Booking lifecycle (P2-E01) — create / reschedule / cancel a booking. */
  booking: ["booking.created", "booking.rescheduled", "booking.cancelled"],
  /** Subscription lifecycle (P2-E02) — subscribe, pause/resume, renew/dunning (cancel in S06). */
  subscription: [
    "subscription.created",
    "subscription.paused",
    "subscription.resumed",
    "subscription.renewed",
    "subscription.dunning",
    "subscription.cancel_requested",
    "subscription.cancel_reversed",
    "subscription.cancelled",
  ],
  /** Authorised pickup list per child (P2-E03-S01) — create / edit / delete. */
  pickup: ["pickup.created", "pickup.updated", "pickup.deleted"],
  /** Attendance & observations (P2-E03) — check-in, hand-off/check-out, anonymisation. */
  attendance: [
    "attendance.checked_in",
    "attendance.checked_out",
    "observation.anonymised",
  ],
  /** Kids-Only Salon counter (P3-E03-S03 / Story 25.3) — marking a salon service
   * complete (check-in reuses `attendance.checked_in`). Reassigning a booking
   * between stylists (P3-E03-S04 / Story 25.4) records `salon.booking.reassigned`. */
  salon: ["salon.service.completed", "salon.booking.reassigned"],
  /** In-store POS sales (P2-E04-S04) + end-of-day cash-up (P2-E04-S05). */
  pos: [
    "pos.sale.initiated",
    "pos.sale.paid",
    "pos.sale.failed",
    "pos.cashup.closed",
  ],
  /** Loyalty (P2-E05 + P3-E04) — points earned, redeemed, earn/redeem rate
   * change, proportional clawback on refund (P3-E04-S01) and the admin manual
   * adjustment (P3-E04-S03). */
  loyalty: [
    "loyalty.earn",
    "loyalty.redeem",
    "loyalty.rate_change",
    "loyalty.clawback",
    "loyalty.adjust",
  ],
  /** Background-jobs runner (P3-E06). A super-admin "run now" is an audited
   * mutation (AC4); a cron tick's lifecycle is recorded in `job_runs`, not the
   * audit log. The SMS-retry worker dead-lettering a message (P3-E06-S04 AC3) is
   * a state change worth a forensic trail. */
  jobs: ["job.run_now", "sms.retry.dead_lettered"],
  /** Outstanding-balance dunning (P2-E07-S02) — the daily reminder job records
   * each stub-SMS nudge it queues (day-1/day-7/day-30) for a forensic trail. */
  dunning: ["outstanding.reminder.sent"],
  /** Coaching 1:1 booking (P5-E01-S02 / Story 31.2) — the day-before reminder job
   * records each stub-SMS reminder it queues for a forensic + idempotency trail
   * (the booking itself reuses `booking.created`). P5-E01-S04 (Story 31.4):
   * recording a PRIVATE per-session coach note is a sensitive mutation worth a
   * forensic trail; the 24-month anonymisation worker records each note it clears.
   * NOTE: the note CONTENT is never put in the audit payload — only ids. */
  coaching: [
    "coaching.reminder.sent",
    "coaching.session_note.recorded",
    "coaching.session_note.anonymised",
  ],
  /** Attribution & commission ledger (P3-E01) — rate changes, ledger postings
   * (incl. refund reversals), monthly/ad-hoc runs and the payout export/mark-paid. */
  commission: [
    "commission.rate.set",
    "commission.ledger.posted",
    "commission.ledger.reversed",
    "commission.run.created",
    "commission.run.failed",
    "commission.run.export",
    "commission.run.paid_out",
  ],
  /** eTIMS (KRA) receipt integration (P5-E02). */
  etims: [
    "etims.submission.sent",
    "etims.submission.dead_lettered",
    "etims.submission.requeued",
    "etims.flag.changed",
    "etims.vat_metadata.updated",
  ],
  /** WooCommerce sync (P4-E04-S07 / Story 29.7). Pull + writeback are audited at
   * the SUMMARY level (counts, not per-item — AC6); the dead-letter actions and a
   * manual "Sync now" are admin mutations worth a forensic trail (AC4/AC7). */
  woocommerce: [
    "woocommerce.sync.pulled",
    "woocommerce.writeback.processed",
    "woocommerce.deadletter.replayed",
    "woocommerce.deadletter.resolved",
    "woocommerce.deadletter.discarded",
    "woocommerce.sync.triggered",
    // P4-E04-S02 (Story 29.2): a POS order-status transition is a mutation —
    // audited at the action level. The reversal (admin-only, AC4) is a distinct,
    // higher-trust action worth its own forensic line.
    "woocommerce.order.transition",
    "woocommerce.order.transition_reversed",
    // P4-E04-S05 (Story 29.5): a stock-mutation enqueues a Woo stock push. The
    // burst is coalesced, so we record a SINGLE summary line per drain in the
    // outbox-drain worker; this action names that enqueue side for the catalogue.
    "woocommerce.stock.push_enqueued",
    // P4-E04-S05 (Story 29.5): the admin SKU → Woo product-id mapping edit
    // (manual entry + bulk CSV import) is a mutation worth a forensic trail.
    "woocommerce.sku_mapping.updated",
    // P4-E04-S05 (Story 29.5): the nightly reconciliation run records a summary
    // line (compared count + drift count) — reads Woo for comparison only.
    "woocommerce.stock.reconciled",
  ],
  /** Non-POS stock mutations (P4-E04-S05 / Story 29.5): goods-received / restock,
   * stock-take adjustment, and a manual admin adjustment. Each adjusts the local
   * source-of-truth stock and is audited; the POS sale decrement keeps its own
   * `pos.sale.paid` line. */
  stock: ["stock.adjusted"],
  /** Feedback Engine (Epic 34 / P6-E04) — a 0–5 rating after every paid touchpoint.
   * An invitation is CREATED on a completed touchpoint (salon checkout, attendance
   * pickup, order fulfilled, …); the parent SUBMITS the rating once. Both are state
   * changes worth a forensic trail; the comment TEXT is never put in the payload.
   * P6-E04-S02 (Story 34.2): the feedback dashboard shows individual responses
   * ANONYMISED by default; an admin DE-ANONYMISING one (revealing the parent
   * behind a rating) is a sensitive identity disclosure worth a forensic line —
   * `feedback.deanonymised`. The dashboard READ itself is not audited (a read).
   * P6-E04-S03 (Story 34.3): a LOW (≤2) rating raises an in-app alert + ops SMS;
   * the cron audits `feedback.negative_alert` once per alerted feedback row, and
   * an admin DISMISSING an in-app alert is audited as `alert.dismissed`. */
  feedback: [
    "feedback.invited",
    "feedback.submitted",
    "feedback.deanonymised",
    "feedback.negative_alert",
  ],
  /** Public review snippets (Epic 34 / P6-E04-S04 / Story 34.4) — the admin curates
   * which 5-star comments to publish as anonymised testimonials on the marketing
   * home page. PUBLISHING a snippet (making it publicly visible) and UNPUBLISHING it
   * are deliberate admin acts worth a forensic trail (AC3). The audit payload carries
   * the snippet/feedback ids + the already-anonymised attribution label — NEVER the
   * parent's real name and never the quote text. Curation + reorder are not audited. */
  reviewSnippet: ["review_snippet.published", "review_snippet.unpublished"],
  /** In-app admin alerts (Epic 34 / P6-E04-S03) — the bell / alerts list. An admin
   * acknowledging (read) or DISMISSING an alert is a state change worth a trail. */
  alert: ["alert.dismissed"],
  /** Expenses module (Epic 35 / P6-E05-S05 / Story 35.5) — the FOUNDATION the
   * consolidated P&L (35.1) consumes. Recording / editing / deleting an expense
   * (or a recurring expense template) is a financial mutation worth a forensic
   * trail. The recurring-template MATERIALISATION cron creates the concrete
   * expense rows without an actor; that batch is recorded in `job_runs`, not the
   * audit log (it is not an interactive mutation), so there is no `*.materialised`
   * action here. */
  expense: [
    "expense.created",
    "expense.updated",
    "expense.deleted",
    "expense.recurring.created",
    "expense.recurring.updated",
    "expense.recurring.deleted",
  ],
  /** Events & recital ticketing (Epic 30) — event lifecycle + ticket issuance. */
  event: [
    "event.created",
    "event.updated",
    "event.published",
    "event.unpublished",
    "event.deleted",
    "ticket.order.created",
    "ticket.order.paid",
    "ticket.rsvp.created",
    "ticket.checked_in",
  ],
} as const satisfies Record<string, readonly string[]>;

/** The catalogue category keys (for completeness assertions / docs). */
export type AuditActionCategory = keyof typeof AUDIT_ACTION_CATALOGUE;

/**
 * Flat, readonly tuple of every audited action name — the single source of
 * truth derived from {@link AUDIT_ACTION_CATALOGUE}.
 */
export const AUDIT_ACTIONS = Object.values(AUDIT_ACTION_CATALOGUE).flat() as readonly AuditAction[];

/** The typed union of every valid audited action name. */
export type AuditAction =
  (typeof AUDIT_ACTION_CATALOGUE)[AuditActionCategory][number];

/** O(1) membership set built from the catalogue. */
const AUDIT_ACTION_SET: ReadonlySet<string> = new Set(
  Object.values(AUDIT_ACTION_CATALOGUE).flat(),
);

/** Runtime guard: is `value` a registered audited action? Narrows the type. */
export function isAuditAction(value: string): value is AuditAction {
  return AUDIT_ACTION_SET.has(value);
}

/**
 * Compile-time + run-time checked passthrough for an audited action name. Pass
 * the result as `audit(db, { action: auditAction("auth.signup"), ... })` so the
 * `string`-typed `audit()` helper still gets a catalogue-validated literal. The
 * generic keeps the narrowed literal type at the call site.
 */
export function auditAction<A extends AuditAction>(action: A): A {
  return action;
}
