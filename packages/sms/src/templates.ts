/**
 * SMS template registry (P1-E09-S01). The canonical `send({to, template, data})`
 * interface renders the body here, so callers pass structured data instead of a
 * pre-rendered string. Story 9.3 (`sms_templates`) can later move these to the
 * DB; the seam (a `template` key + `data` bag → rendered body) stays the same.
 */

import { BRAND } from "@bm/ui/brand";

/** Known template keys. Add a key here + a renderer below to register one. */
export type SmsTemplateKey =
  | "auth.reset.code"
  | "reception.receipt"
  | "receipt.reprint"
  | "wallet.topup.bank"
  | "wallet.topup.cash"
  | "wallet.refund"
  | "payment.mpesa.failed"
  | "parent.data.export.ready"
  | "booking.confirmed"
  | "subscription.confirmed"
  | "subscription.dunning"
  | "pickup.handoff"
  | "event.ticket"
  | "event.rsvp"
  | "raw";

/** Data bag passed to a template; renderers read the fields they need. */
export type SmsTemplateData = Record<string, unknown>;

type Renderer = (data: SmsTemplateData) => string;

function str(data: SmsTemplateData, key: string): string {
  const v = data[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`sms template: missing required field "${key}"`);
  }
  return v;
}

/**
 * Registered renderers. Each maps a `data` bag to a rendered body. `raw` is the
 * passthrough for callers that already computed the body (e.g. a rendered
 * thermal receipt) — it keeps everything flowing through the one `send(...)`
 * seam without re-templating already-formatted text.
 */
const RENDERERS: Record<SmsTemplateKey, Renderer> = {
  "auth.reset.code": (d) =>
    `Your ${BRAND.name} reset code is ${str(d, "code")}. It expires in 10 minutes.`,
  "reception.receipt": (d) => str(d, "body"),
  "receipt.reprint": (d) => str(d, "body"),
  "wallet.topup.bank": (d) =>
    `A bank transfer of KES ${str(d, "amountKes")} was added to your wallet.`,
  "wallet.topup.cash": (d) =>
    `A cash top-up of KES ${str(d, "amountKes")} was added to your wallet.`,
  "wallet.refund": (d) =>
    `A refund of KES ${str(d, "amountKes")} has been recorded to your wallet.`,
  "payment.mpesa.failed": (d) =>
    `Your M-Pesa top-up of KES ${str(d, "amountKes")} could not be completed. No money was deducted. Please try again.`,
  "parent.data.export.ready": (d) =>
    `Your ${BRAND.name} data export is ready. Download (valid 7 days, one-time): ${str(d, "link")}`,
  "booking.confirmed": (d) =>
    `${str(d, "childName")} is booked for ${str(d, "serviceName")} on ${str(d, "date")} at ${str(d, "time")}. — ${BRAND.name}`,
  "subscription.confirmed": (d) =>
    `${str(d, "childName")} is subscribed to ${str(d, "planName")} (${str(d, "entitlement")} sessions). — ${BRAND.name}`,
  "subscription.dunning": (d) =>
    `We couldn't renew your ${str(d, "planName")} subscription — please top up your ${BRAND.name} wallet to keep it active.`,
  "pickup.handoff": (d) => `${str(d, "childName")}'s day at ${BRAND.name}: ${str(d, "summary")}`,
  // Guest e-ticket after a paid purchase (30-3): quantity, event, and the link
  // that opens the ticket(s) / door codes. No account — the link is the proof.
  "event.ticket": (d) =>
    `Your ${str(d, "quantity")} ticket(s) for ${str(d, "eventName")} are confirmed. View your e-ticket(s): ${str(d, "link")} — ${BRAND.name}`,
  // Free-event RSVP confirmation (30-4): same shape minus the payment.
  "event.rsvp": (d) =>
    `You're confirmed for ${str(d, "eventName")} (${str(d, "quantity")} place(s)). View your pass(es): ${str(d, "link")} — ${BRAND.name}`,
  raw: (d) => str(d, "body"),
};

/** Render a template key + data bag into the SMS body. Unknown key throws. */
export function renderTemplate(template: string, data: SmsTemplateData): string {
  const renderer = RENDERERS[template as SmsTemplateKey];
  if (!renderer) {
    throw new Error(`sms template: unknown template "${template}"`);
  }
  return renderer(data);
}
