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
  ],
  /** Daily DB backup lifecycle (X8-S03) — every run + prune is recorded. */
  backup: ["backup.run.succeeded", "backup.run.failed", "backup.run.pruned"],
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
  /**
   * eTIMS (KRA) receipt integration (P5-E02). Submission lifecycle on the
   * retry/dead-letter queue (S02), the enable-flag rollback (S03), and the
   * VAT-registration metadata change (S04).
   */
  etims: [
    "etims.submission.sent",
    "etims.submission.dead_lettered",
    "etims.submission.requeued",
    "etims.flag.changed",
    "etims.vat_metadata.updated",
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
