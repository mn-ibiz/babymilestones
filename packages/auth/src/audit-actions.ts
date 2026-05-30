/** Canonical audit action catalogue (P1-E07-S03 + downstream).
 *
 * Every audited mutation maps to a stable string key here. Centralising the
 * catalogue keeps the audit log queryable and the keys consistent across
 * apps/api routes and worker jobs.
 */
export const AUDIT_ACTIONS = {
  // Auth (P1-E01)
  "auth.login": "auth.login",
  "auth.logout": "auth.logout",
  "auth.pin_reset": "auth.pin_reset",
  "auth.pin_set": "auth.pin_set",
  "auth.sso_issue": "auth.sso_issue",

  // Parents & children (P1-E02)
  "parent.create": "parent.create",
  "parent.update": "parent.update",
  "parent.consent_update": "parent.consent_update",
  "child.create": "child.create",
  "child.update": "child.update",
  "child.deactivate": "child.deactivate",
  "data.export": "data.export",

  // Wallet & payments (P1-E03, P1-E04)
  "wallet.topup": "wallet.topup",
  "wallet.debit": "wallet.debit",
  "wallet.refund": "wallet.refund",
  "wallet.adjustment": "wallet.adjustment",
  "wallet.auto_credit_toggle": "wallet.auto_credit_toggle",

  // Float & reconciliation (P1-E06)
  "float.account_create": "float.account_create",
  "float.account_update": "float.account_update",
  "float.reconciliation_finalize": "float.reconciliation_finalize",

  // Services & staff (P1-E07)
  "service.create": "service.create",
  "service.update": "service.update",
  "service.price_change": "service.price_change",
  "staff.create": "staff.create",
  "staff.update": "staff.update",
  "staff.deactivate": "staff.deactivate",

  // Receipts (P1-E08)
  "receipt.issue": "receipt.issue",
  "receipt.void": "receipt.void",
  "receipt.reprint": "receipt.reprint",

  // SMS (P1-E09)
  "sms.send": "sms.send",
  "sms.template_update": "sms.template_update",

  // Admin nav & users (P2-E01)
  "admin.user_create": "admin.user_create",
  "admin.user_update": "admin.user_update",
  "admin.user_deactivate": "admin.user_deactivate",
  "admin.settings_update": "admin.settings_update",

  // Booking & scheduling (P2-E02)
  "booking.create": "booking.create",
  "booking.reschedule": "booking.reschedule",
  "booking.cancel": "booking.cancel",

  // Subscriptions (P2-E03)
  "subscription.create": "subscription.create",
  "subscription.pause": "subscription.pause",
  "subscription.resume": "subscription.resume",
  "subscription.renew": "subscription.renew",
  "subscription.cancel": "subscription.cancel",

  // POS (P2-E04)
  "pos.sale.create": "pos.sale.create",
  "pos.cashup.create": "pos.cashup.create",

  // Loyalty engine (P3-E04 — clawback, negative carry, admin adjustment).
  "loyalty.clawback": "loyalty.clawback",
  "loyalty.adjust": "loyalty.adjust",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

/**
 * Some audited actions are not 1:1 with a single mutation; these helpers build
 * the action key for parameterised cases (kept here so the catalogue stays the
 * single source of truth).
 */
export const auditActionFor = {
  /** A wallet movement audited by its ledger kind. */
  wallet: (kind: string) => `wallet.${kind}` as const,
} as const;

export type AuditActionForKey = keyof typeof auditActionFor;
