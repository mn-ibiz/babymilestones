import { z } from "zod";
import type { AcquisitionSource } from "./utm.js";

/** Kenyan phone, normalised to +2547XXXXXXXX. */
export const phoneSchema = z
  .string()
  .regex(/^\+2547\d{8}$/u, "Phone must be normalised to +2547XXXXXXXX");

export type Phone = z.infer<typeof phoneSchema>;

/** Staff login request (P1-E01-S03): phone + 4-digit PIN, same primitives as parents. */
export const staffLoginSchema = z.object({
  phone: z.string().min(1, "Phone is required"),
  pin: z.string().regex(/^\d{4}$/u, "PIN must be 4 digits"),
});

export type StaffLogin = z.infer<typeof staffLoginSchema>;

/** Staff login response: the resolved role and the path the client should land on. */
export const staffLoginResponseSchema = z.object({
  role: z.string(),
  redirect: z.string(),
});

export type StaffLoginResponse = z.infer<typeof staffLoginResponseSchema>;

/** PIN reset — request a code by phone (P1-E01-S05 AC1). */
export const resetRequestSchema = z.object({
  phone: z.string().min(1, "Phone is required"),
});
export type ResetRequest = z.infer<typeof resetRequestSchema>;

/** PIN reset — verify the 6-digit code (P1-E01-S05 AC2). */
export const resetVerifySchema = z.object({
  phone: z.string().min(1, "Phone is required"),
  code: z.string().regex(/^\d{6}$/u, "Code must be 6 digits"),
});
export type ResetVerify = z.infer<typeof resetVerifySchema>;

/** PIN reset — complete with token + new PIN (P1-E01-S05 AC3). */
export const resetCompleteSchema = z.object({
  token: z.string().min(1, "Token is required"),
  pin: z.string().regex(/^\d{4}$/u, "PIN must be 4 digits"),
});
export type ResetComplete = z.infer<typeof resetCompleteSchema>;

/**
 * Authenticated PIN change (P1-E11-S04 AC3). The parent must supply their
 * CURRENT PIN (re-auth) plus a new 4-digit PIN. Format only here — weakness +
 * current-PIN verification happen server-side (the API owns the hash and must
 * run an argon2 verify regardless). `newPin` must differ from `currentPin`.
 */
export const pinChangeSchema = z
  .object({
    currentPin: z.string().regex(/^\d{4}$/u, "Enter your current 4-digit PIN"),
    newPin: z.string().regex(/^\d{4}$/u, "New PIN must be 4 digits"),
  })
  .refine((v) => v.newPin !== v.currentPin, {
    message: "New PIN must be different from your current PIN",
    path: ["newPin"],
  });
export type PinChangeInput = z.infer<typeof pinChangeSchema>;

/**
 * Permissive email (RFC 5322 light) for the parent profile (P1-E02-S01 AC2).
 * Intentionally forgiving: one `@`, a non-empty local part, a dotted domain
 * with a 2+ char TLD, no spaces. We do NOT enforce the full RFC grammar.
 */
export const emailLightRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;

/** Trim then treat empty optional text as "absent" (null). */
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .optional()
  .transform((v) => v ?? null);

/**
 * Parent profile create/update (P1-E02-S01 AC1, AC2).
 * Required: first + last name. Optional: email (permissive) + residential area.
 * The same shape backs both create and full update (idempotent upsert).
 */
export const parentProfileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  // Optional: an empty/absent value collapses to null; a present value must
  // pass the permissive (RFC 5322 light) regex.
  email: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v ?? "").trim())
    .refine((v) => v === "" || emailLightRegex.test(v), { message: "Enter a valid email address" })
    .transform((v) => (v === "" ? null : v)),
  residentialArea: optionalText,
});
export type ParentProfileInput = z.infer<typeof parentProfileSchema>;

/** A persisted parent profile as returned by the API (AC4 — read back for edit). */
export interface ParentProfile {
  userId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  residentialArea: string | null;
  /** SMS marketing opt-in (P1-E02-S04 AC1) — defaults false. */
  smsMarketingOptIn: boolean;
  /**
   * Acquisition attribution (P1-E12-S03 AC2): the UTM payload that drove the
   * signup (set once at profile creation), or null for an organic signup.
   */
  acquisitionSource: AcquisitionSource | null;
}

// ---------------------------------------------------------------------------
// Consent flags (P1-E02-S04)
// ---------------------------------------------------------------------------

/**
 * Per-parent SMS marketing consent toggle (AC1, AC2). The only field the
 * consent endpoint accepts — profile names/email live on a separate route, so
 * a consent change never silently rewrites the rest of the profile.
 */
export const smsConsentSchema = z.object({
  smsMarketingOptIn: z.boolean({ message: "smsMarketingOptIn must be a boolean" }),
});
export type SmsConsentInput = z.infer<typeof smsConsentSchema>;

/** Per-child photo consent toggle (AC1, AC2). */
export const photoConsentSchema = z.object({
  photoConsent: z.boolean({ message: "photoConsent must be a boolean" }),
});
export type PhotoConsentInput = z.infer<typeof photoConsentSchema>;

/**
 * Reception walk-in registration (P1-E02-S02).
 *
 * One-screen form (AC1): phone (required), first/last name, optional email +
 * residential area. PIN is intentionally NOT part of this schema (AC3) — a
 * walk-in account is created with no credential and the parent verifies via OTP
 * on first self-login. Phone is raw here; the API normalises it server-side
 * (mirrors signup/login, which never trust a client-normalised phone).
 */
export const receptionWalkInSchema = z.object({
  phone: z.string().trim().min(1, "Phone is required"),
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v ?? "").trim())
    .refine((v) => v === "" || emailLightRegex.test(v), { message: "Enter a valid email address" })
    .transform((v) => (v === "" ? null : v)),
  residentialArea: optionalText,
});
export type ReceptionWalkInInput = z.infer<typeof receptionWalkInSchema>;

/**
 * Check-in debit request (P1-E03-S05). Reception checks a child in against a
 * pending invoice; the server debits the wallet and resolves the invoice. The
 * client supplies the invoice; the server derives the wallet from the invoice's
 * parent (never trust a client-supplied wallet id for a money movement).
 */
export const checkInSchema = z.object({
  invoiceId: z.string().uuid("invoiceId must be a UUID"),
  /** Optional caller dedup key; the server derives one from the invoice if absent. */
  idempotencyKey: z.string().trim().min(1).optional(),
});
export type CheckInInput = z.infer<typeof checkInSchema>;

/**
 * Admin refund request (P1-E03-S06). An admin records an offline refund against
 * an original debit ledger entry; the server posts a reversing `refund` entry
 * (never mutates the original — the ledger is append-only). A reason code is
 * required (AC1); the refund amount must be a positive integer of cents and may
 * not exceed the remaining-refundable amount on the original (AC4, enforced by
 * the wallet primitive). Free-text note is optional.
 */
export const refundSchema = z.object({
  originalEntryId: z.string().uuid("originalEntryId must be a UUID"),
  amount: z.number().int("amount must be integer cents").positive("amount must be positive"),
  reasonCode: z.string().trim().min(1, "A reason code is required"),
  note: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v ?? "").trim())
    .transform((v) => (v === "" ? null : v)),
  /** Optional caller dedup key; the server derives one if absent. */
  idempotencyKey: z.string().trim().min(1).optional(),
});
export type RefundRequestInput = z.infer<typeof refundSchema>;

/**
 * Per-parent auto-credit toggle (P1-E03-S07). An admin flips whether a parent's
 * wallet may go negative at check-in without prepayment. The only field the
 * endpoint accepts — a single boolean — so the toggle never rewrites anything
 * else. The check-in debit path (P1-E03-S05) reads the resulting
 * `wallets.auto_credit_enabled`.
 */
export const autoCreditToggleSchema = z.object({
  autoCreditEnabled: z.boolean({ message: "autoCreditEnabled must be a boolean" }),
});
export type AutoCreditToggleInput = z.infer<typeof autoCreditToggleSchema>;

// ---------------------------------------------------------------------------
// Reception parent search (P1-E05-S01)
// ---------------------------------------------------------------------------

/** Min query length before the search runs (one char is too broad/expensive). */
export const PARENT_SEARCH_MIN_QUERY = 2;
/** Hard cap on rows returned — keeps the response (and render) bounded (AC2). */
export const PARENT_SEARCH_LIMIT = 20;

/**
 * Reception parent search request (P1-E05-S01 AC1). A single free-text query
 * matched against phone (any format → normalised, exact/prefix) OR partial name
 * (case-insensitive substring). The query is trimmed; a query shorter than
 * {@link PARENT_SEARCH_MIN_QUERY} returns no results (the route short-circuits).
 */
export const parentSearchQuerySchema = z.object({
  q: z.string().trim().min(1, "A search query is required"),
});
export type ParentSearchQueryInput = z.infer<typeof parentSearchQuerySchema>;

/**
 * One parent search result (P1-E05-S01 AC3): name, phone last-4, wallet balance
 * (cents), outstanding amount owed (cents), and the last visit date (ISO, or
 * null if never checked in). `userId` is the stable id the UI navigates to.
 */
export interface ParentSearchResult {
  userId: string;
  firstName: string;
  lastName: string;
  /** Last 4 digits of the parent's phone — never the full number in a list view. */
  phoneLast4: string;
  /** Computed wallet balance in integer cents (credits − debits). */
  walletBalanceCents: number;
  /** Outstanding amount owed in integer cents (sum of open invoices). */
  outstandingCents: number;
  /** ISO timestamp of the most recent service visit (check-in), or null. */
  lastVisitAt: string | null;
}

/** Search response: the matched results (≤ {@link PARENT_SEARCH_LIMIT}). */
export interface ParentSearchResponse {
  results: ParentSearchResult[];
}

// ---------------------------------------------------------------------------
// POS product catalogue read (P2-E04-S02)
// ---------------------------------------------------------------------------

/** Barcode-scanner / keyed-code lookup request — exact SKU or barcode (AC1). */
export const posProductLookupQuerySchema = z.object({
  code: z.string().trim().min(1, "A product code is required").max(100, "Code is too long"),
});
export type PosProductLookupQueryInput = z.infer<typeof posProductLookupQuerySchema>;

/** Name search request (AC2) — debounced client-side; the API trims + min-length gates. */
export const posProductSearchQuerySchema = z.object({
  q: z.string().trim().min(1, "A search query is required").max(100, "Query is too long"),
});
export type PosProductSearchQueryInput = z.infer<typeof posProductSearchQuerySchema>;

/**
 * A product as the POS sees it (P2-E04-S02). Price is integer cents (KES * 100);
 * `inStock` is the derived `stockQty > 0` flag the UI uses to grey out and block
 * an out-of-stock product at checkout (AC3). `taxTreatment` rides along so the
 * cart (S03) can compute per-line tax the same way as services.
 */
export interface PosProduct {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  priceCents: number;
  stockQty: number;
  inStock: boolean;
  taxTreatment: "vat_inclusive" | "vat_exclusive" | "vat_exempt" | "zero_rated";
}

/** Lookup response: the matched product, or null when no active product matches. */
export interface PosProductLookupResponse {
  product: PosProduct | null;
}

/** Search response: the matched products (out-of-stock included, greyed by the UI). */
export interface PosProductSearchResponse {
  products: PosProduct[];
}

/**
 * Reception parent-profile header summary (P1-E05-S02 AC1). All the financial
 * facts about a parent in one shot so the front desk never has to dig: full name,
 * full phone (the header is the focused single-parent view, unlike the masked
 * search list), computed wallet balance, outstanding owed, and the current
 * auto-credit flag. Money is integer cents. `userId` is the stable id the toggle
 * + invoice modal endpoints key on.
 */
export interface ParentProfileSummary {
  userId: string;
  firstName: string;
  lastName: string;
  /** Full normalised phone (+2547XXXXXXXX) — the focused header view shows it whole. */
  phone: string;
  /** Computed wallet balance in integer cents (credits − debits). */
  walletBalanceCents: number;
  /** Outstanding amount owed in integer cents (sum of open invoices). */
  outstandingCents: number;
  /** Current value of `wallets.auto_credit_enabled` (admin-only to flip — AC1). */
  autoCreditEnabled: boolean;
}

/** Profile-header response: the summary, or 404 when the parent is unknown. */
export interface ParentProfileResponse {
  profile: ParentProfileSummary;
}

/**
 * One open (non-settled) invoice for the outstanding-amount modal (P1-E05-S02
 * AC3). Carries the remaining amount owed (cents), the booking status, and when
 * it was raised so the modal can list oldest-first (FIFO settlement order).
 */
export interface OpenInvoice {
  id: string;
  /** Remaining amount owed in integer cents. */
  amountDueCents: number;
  /** `pending` | `outstanding` | `settled_on_credit` — never `settled` here. */
  status: string;
  /** ISO timestamp the invoice was raised. */
  createdAt: string;
}

/** Open-invoices response for the modal (AC3): the list + their summed total. */
export interface OpenInvoicesResponse {
  invoices: OpenInvoice[];
  /** Sum of `amountDueCents` across the listed invoices (== header outstanding). */
  totalCents: number;
}

// ---------------------------------------------------------------------------
// Parent wallet overview (P1-E11-S01) — the parent dashboard wallet page
// ---------------------------------------------------------------------------

/**
 * The authed parent's own wallet overview (P1-E11-S01). Backs the parent
 * dashboard wallet page hero (balance + outstanding + read-only auto-credit
 * status, AC1), the last-10 transactions list (AC3), and the read-only loyalty
 * points balance (AC4 — earn-only in P1). Everything here is READ-ONLY: the
 * auto-credit flag is flipped by an admin elsewhere, and loyalty is earn-only.
 * Money is integer cents; format to KES at the edge.
 */
export interface WalletOverview {
  /** Computed wallet balance in integer cents (credits − debits). */
  balanceCents: number;
  /** Outstanding amount owed in integer cents (sum of open invoices). */
  outstandingCents: number;
  /** Current value of `wallets.auto_credit_enabled` (read-only here — admin sets). */
  autoCreditEnabled: boolean;
  /** Loyalty points balance, read-only (earn-only in P1; 0 until earning lands). */
  loyaltyPoints: number;
  /** Latest 10 wallet-ledger postings, newest-first, each with balance-after. */
  recentTransactions: RecentTransaction[];
}

/** Wallet overview response for the parent dashboard wallet page (AC1/AC3/AC4). */
export interface WalletOverviewResponse {
  wallet: WalletOverview;
}

/**
 * AC1: the outstanding amount renders red when the parent owes money (> 0) and
 * neutral otherwise. Pure rule shared by the API shaping and the header UI so
 * the "red when > 0" threshold lives in exactly one place.
 */
export function isOutstanding(outstandingCents: number): boolean {
  return outstandingCents > 0;
}

// ---------------------------------------------------------------------------
// M-Pesa STK push top-up (P1-E04-S01)
// ---------------------------------------------------------------------------

/** Min/max per single Daraja STK call, in whole KES (AC1). */
export const MPESA_STK_MIN_KES = 50;
export const MPESA_STK_MAX_KES = 70_000;

/**
 * Parent top-up via M-Pesa STK push (P1-E04-S01 AC1). The form submits a whole
 * KES amount; Daraja transacts in whole shillings (no cents on the STK prompt).
 * Bounds mirror the Daraja per-call limits: min 50, max 70,000 KES. The wallet
 * is derived server-side from the session — never accepted from the client.
 */
export const mpesaStkInitiateSchema = z.object({
  amountKes: z
    .number({ message: "Amount is required" })
    .int("Amount must be a whole number of shillings")
    .min(MPESA_STK_MIN_KES, `Minimum top-up is KES ${MPESA_STK_MIN_KES}`)
    .max(MPESA_STK_MAX_KES, `Maximum per top-up is KES ${MPESA_STK_MAX_KES}`),
});
export type MpesaStkInitiateInput = z.infer<typeof mpesaStkInitiateSchema>;

// ---------------------------------------------------------------------------
// Cash top-up by Reception (P1-E04-S06)
// ---------------------------------------------------------------------------

/** Bounds for a single counter cash top-up, in integer cents (KES). */
export const CASH_TOPUP_MIN_CENTS = 100; // KES 1.00
export const CASH_TOPUP_MAX_CENTS = 50_000_000; // KES 500,000.00

/**
 * Cash top-up recorded by Reception/Cashier (P1-E04-S06 AC1/AC2). The staff
 * actor is the session user (`posted_by`), never accepted from the client; the
 * body carries only the funded parent and the amount of cash taken at the
 * counter. Amount is integer cents (the ledger never stores floats). An optional
 * dedup key makes the recording idempotent; the server derives one if absent.
 */
export const cashTopupSchema = z.object({
  parentId: z.string().uuid("parentId must be a UUID"),
  amount: z
    .number({ message: "Amount is required" })
    .int("amount must be integer cents")
    .min(CASH_TOPUP_MIN_CENTS, `Minimum cash top-up is ${CASH_TOPUP_MIN_CENTS} cents`)
    .max(CASH_TOPUP_MAX_CENTS, `Maximum cash top-up is ${CASH_TOPUP_MAX_CENTS} cents`),
  idempotencyKey: z.string().trim().min(1).optional(),
});
export type CashTopupRequestInput = z.infer<typeof cashTopupSchema>;

// ---------------------------------------------------------------------------
// Bank transfer top-up, admin-confirmed (P1-E04-S07)
// ---------------------------------------------------------------------------

/** Bounds for a single bank transfer, in integer cents (KES) — reuse cash bounds. */
export const BANK_TRANSFER_MIN_CENTS = CASH_TOPUP_MIN_CENTS;
export const BANK_TRANSFER_MAX_CENTS = CASH_TOPUP_MAX_CENTS;
/** Max length of the bank reference / narration captured on a recorded transfer. */
export const BANK_TRANSFER_REFERENCE_MAX = 140;

/**
 * Record a pending bank transfer (P1-E04-S07 AC1). An admin enters a transfer
 * they observed; `parentId` is optional at recording time (the transfer may not
 * yet be matched to a parent). Amount is integer cents.
 */
export const bankTransferRecordSchema = z.object({
  amount: z
    .number({ message: "Amount is required" })
    .int("amount must be integer cents")
    .min(BANK_TRANSFER_MIN_CENTS, `Minimum bank transfer is ${BANK_TRANSFER_MIN_CENTS} cents`)
    .max(BANK_TRANSFER_MAX_CENTS, `Maximum bank transfer is ${BANK_TRANSFER_MAX_CENTS} cents`),
  reference: z.string().trim().min(1, "reference is required").max(BANK_TRANSFER_REFERENCE_MAX),
  parentId: z.string().uuid("parentId must be a UUID").optional(),
});
export type BankTransferRecordInput = z.infer<typeof bankTransferRecordSchema>;

/**
 * Confirm a recorded bank transfer (P1-E04-S07 AC2). The admin matches the
 * transfer to a parent (if not already matched at record time) and confirms,
 * crediting the wallet. The pending row id is the URL param; the body carries
 * only the parent match.
 */
export const bankTransferConfirmSchema = z.object({
  parentId: z.string().uuid("parentId must be a UUID"),
});
export type BankTransferConfirmRequestInput = z.infer<typeof bankTransferConfirmSchema>;

// ---------------------------------------------------------------------------
// Reception unified top-up (P1-E05-S03)
// ---------------------------------------------------------------------------

/**
 * The payment methods Reception can pick in the top-up sheet (P1-E05-S03 AC1).
 * `cash` and the two provider rails (`mpesa_stk`, `paystack_card`) are handled by
 * the reception top-up endpoint; `bank_transfer` appears in the picker but is an
 * admin-confirmed flow (P1-E04-S07) routed elsewhere — the endpoint rejects it
 * with guidance rather than silently crediting.
 */
export const RECEPTION_TOPUP_METHODS = [
  "cash",
  "mpesa_stk",
  "paystack_card",
  "bank_transfer",
] as const;
export type ReceptionTopupMethod = (typeof RECEPTION_TOPUP_METHODS)[number];

/**
 * Reception unified top-up request (P1-E05-S03 AC1, AC4). One staff endpoint that
 * dispatches by `method`: cash credits synchronously, M-Pesa STK pushes to the
 * parent's phone (credited async on callback), Paystack inits a hosted checkout.
 * The funded parent is the parent's *user* id; the wallet + payer phone/email are
 * derived server-side — never accepted from the client. The staff actor is the
 * session user (`posted_by`), never the body. Amount is integer cents (the ledger
 * never stores floats); whole-KES provider amounts are derived from it. An
 * optional dedup key makes the cash recording idempotent.
 */
export const receptionTopupSchema = z.object({
  parentId: z.string().uuid("parentId must be a UUID"),
  method: z.enum(RECEPTION_TOPUP_METHODS, { message: "Choose a payment method" }),
  amount: z
    .number({ message: "Amount is required" })
    .int("amount must be integer cents")
    .min(CASH_TOPUP_MIN_CENTS, `Minimum top-up is ${CASH_TOPUP_MIN_CENTS} cents`)
    .max(CASH_TOPUP_MAX_CENTS, `Maximum top-up is ${CASH_TOPUP_MAX_CENTS} cents`),
  idempotencyKey: z.string().trim().min(1).optional(),
});
export type ReceptionTopupInput = z.infer<typeof receptionTopupSchema>;

/** Top-up status as surfaced to the live-polling reception sheet (AC2). */
export type ReceptionTopupStatus = "settled" | "pending" | "failed";

/**
 * Reception top-up dispatch result (AC1, AC2, AC3). `status` drives the sheet:
 * `settled` (cash — receipt prints immediately, AC3), `pending` (M-Pesa STK /
 * Paystack — the sheet polls `transactionId` for live updates, AC2). The provider
 * handle is the M-Pesa `checkoutRequestId` or the Paystack `reference`;
 * `authorizationUrl` is the Paystack hosted-checkout URL when present.
 */
export interface ReceptionTopupResponse {
  method: ReceptionTopupMethod;
  status: ReceptionTopupStatus;
  /** Provider/transaction handle the sheet polls for live status (null for cash). */
  transactionId: string | null;
  /** Cash-only: the posted ledger entry id (the receipt source of truth). */
  ledgerEntryId?: string;
  /** Cash-only: true when an idempotent replay posted no new credit. */
  replayed?: boolean;
  /** Paystack-only: the hosted-checkout URL to hand to the parent. */
  authorizationUrl?: string;
}

/** Lifecycle state of an STK request as surfaced to the polling client (AC4). */
export type MpesaStkState =
  | "INITIATED"
  | "STK_SENT"
  | "CALLBACK_PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED";

/** Initiate response (AC2/AC3): the checkout handle the UI polls on. */
export interface MpesaStkInitiateResponse {
  checkoutRequestId: string;
  state: MpesaStkState;
}

/** Polling response (AC4): the current state of a parent's STK request. */
export interface MpesaStkStatusResponse {
  checkoutRequestId: string;
  state: MpesaStkState;
}

/**
 * Phone-collision lookup result (AC2). When a normalised phone already maps to
 * a user, `existing` carries a minimal reference so the Reception form can offer
 * "Open existing" or set a "Merge intent" flag. Never leaks PIN/credential.
 */
export interface PhoneCheckResult {
  available: boolean;
  existing: {
    userId: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Record a service visit (P1-E05-S04)
// ---------------------------------------------------------------------------

/** Bounds for a service rate (the visit charge), in integer cents (KES). */
export const SERVICE_RATE_MIN_CENTS = 0; // a free/promo service is allowed
export const SERVICE_RATE_MAX_CENTS = 50_000_000; // KES 500,000.00
/** Max length of the snapshotted staff display name. */
export const STAFF_NAME_SNAPSHOT_MAX = 120;

/**
 * Record a service visit (P1-E05-S04 AC1–AC4). Reception picks a service, the
 * parent's child, and the attributed staff member, then confirms. The server
 * creates a `bookings` row + a pending `invoices` row, marks the visit checked
 * in, and runs the check-in debit (P1-E03-S05) against that invoice in one
 * transaction (AC3). On insufficient balance with auto-credit off the booking
 * still proceeds and an outstanding invoice is left (AC4).
 *
 * `parentId` is the parent's *user* id (the wallet + parent profile are derived
 * server-side — never trusted from the client, mirroring the top-up flow). The
 * staff actor (`posted_by`/`actor`) is the session user, never the body.
 *
 * The services + staff catalogues are a later epic (P1-E07). For now the client
 * sends `serviceId` + `staffId` as opaque references plus the snapshot fields
 * (`staffName`, `rate`) directly. DEFERRED: load active-only services/staff from
 * the P1-E07 catalogue and snapshot server-side once that epic ships.
 */
export const recordVisitSchema = z.object({
  parentId: z.string().uuid("parentId must be a UUID"),
  childId: z.string().uuid("childId must be a UUID"),
  serviceId: z.string().uuid("serviceId must be a UUID"),
  staffId: z.string().uuid("staffId must be a UUID"),
  /** Snapshotted staff display name (AC2). */
  staffName: z
    .string()
    .trim()
    .min(1, "A staff member is required")
    .max(STAFF_NAME_SNAPSHOT_MAX, `Staff name must be ${STAFF_NAME_SNAPSHOT_MAX} characters or fewer`),
  /** Snapshotted service rate / visit charge in integer cents (AC2, AC3). */
  rate: z
    .number({ message: "A service rate is required" })
    .int("rate must be integer cents")
    .min(SERVICE_RATE_MIN_CENTS, `Rate must be at least ${SERVICE_RATE_MIN_CENTS} cents`)
    .max(SERVICE_RATE_MAX_CENTS, `Rate must be at most ${SERVICE_RATE_MAX_CENTS} cents`),
  /** Optional caller dedup key; the server derives one if absent. */
  idempotencyKey: z.string().trim().min(1).optional(),
});
export type RecordVisitInput = z.infer<typeof recordVisitSchema>;

/** Check-in outcome surfaced to the reception flow (mirrors @bm/wallet). */
export type VisitDebitOutcome = "settled" | "settled_on_credit" | "outstanding";

/**
 * Record-visit result (AC3, AC4). `bookingId`/`invoiceId` are the created rows;
 * `outcome` is the check-in resolution. `warning` is true (with copy in
 * `warningMessage`) when the wallet was insufficient and auto-credit was off —
 * the visit still proceeded but an outstanding invoice was created (AC4).
 */
export interface RecordVisitResponse {
  bookingId: string;
  invoiceId: string;
  outcome: VisitDebitOutcome;
  /** Cents actually debited (0 on the outstanding path). */
  debitedCents: number;
  /** True when the booking proceeded on an underfunded wallet (AC4). */
  warning: boolean;
  /** Human-facing warning copy when `warning` is true, else null. */
  warningMessage: string | null;
}

/**
 * AC4: the reception UI surfaces a warning (but still confirms the visit) when
 * the check-in left an outstanding invoice. Pure rule shared by the API shaping
 * and the UI so the threshold lives in one place.
 */
export function isVisitOutstanding(outcome: VisitDebitOutcome): boolean {
  return outcome === "outstanding";
}

// ---------------------------------------------------------------------------
// Paystack card top-up (P1-E04-S04)
// ---------------------------------------------------------------------------

/** Min/max per Paystack card top-up, in whole KES (AC1). */
export const PAYSTACK_MIN_KES = 50;
export const PAYSTACK_MAX_KES = 1_000_000;

/** KES → Paystack minor units (cents). Paystack transacts in the smallest unit. */
export function kesToMinorUnits(amountKes: number): number {
  return Math.round(amountKes * 100);
}

/**
 * Parent card top-up via Paystack hosted checkout (P1-E04-S04 AC1). The form
 * submits a whole KES amount; the API converts it to minor units before calling
 * Paystack. The reference (UUID) and payer email are derived server-side — never
 * accepted from the client. `saveCard` opts the parent into card-on-file (AC4),
 * reusing Paystack's saved authorization for future repeat top-ups.
 */
export const paystackInitSchema = z.object({
  amountKes: z
    .number({ message: "Amount is required" })
    .int("Amount must be a whole number of shillings")
    .min(PAYSTACK_MIN_KES, `Minimum top-up is KES ${PAYSTACK_MIN_KES}`)
    .max(PAYSTACK_MAX_KES, `Maximum per top-up is KES ${PAYSTACK_MAX_KES}`),
  /** AC4: opt-in to card-on-file (save the authorization for repeat top-ups). */
  saveCard: z.boolean().optional().default(false),
});
export type PaystackInitInputContract = z.infer<typeof paystackInitSchema>;

/** Lifecycle state of a Paystack transaction as surfaced to the client. */
export type PaystackTxState = "INITIALIZED" | "SUCCEEDED" | "FAILED" | "ABANDONED";

/** Initiate response (AC1/AC2): the hosted-checkout URL + reference to poll on. */
export interface PaystackInitResponse {
  reference: string;
  authorizationUrl: string;
  state: PaystackTxState;
}

/** Verify/poll response (AC2/AC3): the current state of a Paystack transaction. */
export interface PaystackStatusResponse {
  reference: string;
  state: PaystackTxState;
}

// ---------------------------------------------------------------------------
// Children registry (P1-E02-S03)
// ---------------------------------------------------------------------------

/** Max length of the free-text allergies/notes field (AC1). */
export const CHILD_NOTES_MAX = 500;

/** ISO calendar date YYYY-MM-DD (DOB has no time component). */
export const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/u;

/** Trim then collapse empty optional text to null. */
const optionalChildText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v ?? "").trim())
  .transform((v) => (v === "" ? null : v));

/**
 * Add/edit a child (P1-E02-S03 AC1, AC3). Required: first name + a valid
 * calendar DOB. Optional (collapse to null): last name, gender, allergies/notes
 * (≤500 chars). The same shape backs both create and edit so AC fields are
 * always preserved. `parentId` is never accepted from the client — ownership is
 * derived from the session.
 */
export const childSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: optionalChildText,
  dateOfBirth: z
    .string()
    .trim()
    .min(1, "Date of birth is required")
    .regex(isoDateRegex, "Date of birth must be YYYY-MM-DD")
    .refine((v) => {
      const d = new Date(`${v}T00:00:00.000Z`);
      // Reject impossible dates (e.g. 2025-02-30 rolls over) and future DOBs.
      return !Number.isNaN(d.getTime()) && v === d.toISOString().slice(0, 10) && d.getTime() <= Date.now();
    }, "Enter a valid past date of birth"),
  gender: optionalChildText,
  allergiesNotes: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v ?? "").trim())
    .refine((v) => v.length <= CHILD_NOTES_MAX, {
      message: `Notes must be ${CHILD_NOTES_MAX} characters or fewer`,
    })
    .transform((v) => (v === "" ? null : v)),
});
export type ChildInput = z.infer<typeof childSchema>;

/** A persisted child as returned by the API (read back for edit + selectors). */
export interface Child {
  id: string;
  firstName: string;
  lastName: string | null;
  dateOfBirth: string;
  gender: string | null;
  allergiesNotes: string | null;
  /** Per-child photography consent (P1-E02-S04 AC1) — defaults false. */
  photoConsent: boolean;
  archivedAt: string | null;
  /** Derived from DOB (AC2) — surfaced on every booking selector. */
  ageInMonths: number;
}

/**
 * Age in whole months from a DOB (AC2). Shared helper so booking selectors and
 * the registry never duplicate the calculation. Counts completed months: the
 * month boundary advances only once the day-of-month is reached. Clamps to 0
 * for same-day / future dates so callers never see a negative age.
 */
export function ageInMonths(dateOfBirth: string | Date, asOf: Date = new Date()): number {
  const dob = dateOfBirth instanceof Date ? dateOfBirth : new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(dob.getTime())) return 0;
  let months =
    (asOf.getUTCFullYear() - dob.getUTCFullYear()) * 12 +
    (asOf.getUTCMonth() - dob.getUTCMonth());
  // Not yet reached the day-of-month → the current month isn't complete.
  if (asOf.getUTCDate() < dob.getUTCDate()) months -= 1;
  return months < 0 ? 0 : months;
}

// ---------------------------------------------------------------------------
// Authorised pickup list per child (P2-E03-S01)
// ---------------------------------------------------------------------------

/** Max length for a pickup person's free-text fields (name / relationship). */
export const PICKUP_TEXT_MAX = 120;
/** Max length for a pickup person's phone + photo URL. */
export const PICKUP_PHONE_MAX = 32;
export const PICKUP_PHOTO_URL_MAX = 2048;

/** Trim then collapse an empty optional string to null. */
const optionalPickupText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v ?? "").trim())
  .transform((v) => (v === "" ? null : v));

/**
 * Add / edit an authorised pickup (P2-E03-S01 AC1). Required: `name`, `phone`,
 * `relationship`; optional `photoUrl` (collapses to null). `childId` is never
 * accepted from the client — it is taken from the route + ownership-checked
 * against the session parent. The same shape backs create + edit so every AC
 * field round-trips.
 */
export const pickupAuthorisationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(PICKUP_TEXT_MAX, `Name must be ${PICKUP_TEXT_MAX} characters or fewer`),
  phone: z
    .string()
    .trim()
    .min(1, "Phone is required")
    .max(PICKUP_PHONE_MAX, `Phone must be ${PICKUP_PHONE_MAX} characters or fewer`),
  relationship: z
    .string()
    .trim()
    .min(1, "Relationship is required")
    .max(PICKUP_TEXT_MAX, `Relationship must be ${PICKUP_TEXT_MAX} characters or fewer`),
  photoUrl: optionalPickupText.refine(
    (v) => v === null || v.length <= PICKUP_PHOTO_URL_MAX,
    `Photo URL must be ${PICKUP_PHOTO_URL_MAX} characters or fewer`,
  ),
});
export type PickupAuthorisationInput = z.infer<typeof pickupAuthorisationSchema>;

/** A persisted authorised pickup as returned by the API (read back for edit). */
export interface PickupAuthorisation {
  id: string;
  childId: string;
  name: string;
  phone: string;
  relationship: string;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Attendant check-in (P2-E03-S02)
// ---------------------------------------------------------------------------

/** Max bookings accepted in a single bulk check-in call (AC4). */
export const ATTENDANCE_BULK_MAX = 100;

/** One of today's session slots with its booking counts, for the attendant list (AC1). */
export interface AttendanceSlot {
  slotId: string;
  serviceId: string;
  serviceName: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  capacity: number;
  /** Confirmed (non-cancelled) bookings in the slot. */
  bookedCount: number;
  /** How many of those have been checked in. */
  checkedInCount: number;
}

/** A child card on the per-slot booking list (AC2). */
export interface AttendanceBookingCard {
  bookingId: string;
  childId: string;
  childName: string;
  /** Per-child photo consent (P1-E02-S04) — the UI only shows a photo when true (AC2). */
  photoConsent: boolean;
  /** How the booking was paid — `wallet` triggers a check-in debit, `subscription` is pre-covered. */
  paidVia: "wallet" | "subscription";
  /** Set once the child has been checked in (AC3), else null. */
  checkedInAt: string | null;
  /** Drop-off time captured at check-in (AC2), else null. */
  droppedOffAt: string | null;
  /** Set once the child has been handed over (S03), else null. */
  checkedOutAt: string | null;
}

/** Check-in resolution (mirrors @bm/wallet; subscription bookings resolve `covered`). */
export type CheckInOutcome = "settled" | "settled_on_credit" | "outstanding" | "covered";

/** Check in one booking (AC3). Optional drop-off time field (AC2). */
export const attendanceCheckInSchema = z.object({
  bookingId: z.string().uuid("bookingId must be a UUID"),
  /** ISO timestamp the child was dropped off (AC2). Optional. */
  droppedOffAt: z.string().datetime({ message: "droppedOffAt must be an ISO timestamp" }).optional(),
});
export type AttendanceCheckInInput = z.infer<typeof attendanceCheckInSchema>;

/** Bulk check-in (AC4): a non-empty list of booking ids. */
export const attendanceBulkCheckInSchema = z.object({
  bookingIds: z
    .array(z.string().uuid("each bookingId must be a UUID"))
    .min(1, "At least one booking is required")
    .max(ATTENDANCE_BULK_MAX, `At most ${ATTENDANCE_BULK_MAX} bookings per call`),
});
export type AttendanceBulkCheckInInput = z.infer<typeof attendanceBulkCheckInSchema>;

/** Result of checking in one booking. */
export interface AttendanceCheckInResult {
  bookingId: string;
  attendanceId: string;
  outcome: CheckInOutcome;
  /** Cents actually debited (0 for `covered` / `outstanding`). */
  debitedCents: number;
  /** True when the check-in left an outstanding invoice (underfunded + auto-credit off). */
  warning: boolean;
}

/** Per-booking outcome in a bulk check-in (AC4) — `ok` xor `error`. */
export interface AttendanceBulkResultItem {
  bookingId: string;
  ok: boolean;
  outcome: CheckInOutcome | null;
  error: string | null;
}

/**
 * AC3: the reception UI surfaces a warning (but still checks the child in) when
 * the check-in left an outstanding invoice. Pure rule shared by API + UI.
 */
export function isCheckInOutstanding(outcome: CheckInOutcome): boolean {
  return outcome === "outstanding";
}

// ---------------------------------------------------------------------------
// Pickup hand-off + free-text observations (P2-E03-S03)
// ---------------------------------------------------------------------------

/** The fixed mood picker — 5 emojis, default 😊 (AC1). */
export const OBSERVATION_MOODS = ["😄", "😊", "😐", "😟", "😢"] as const;
export type ObservationMood = (typeof OBSERVATION_MOODS)[number];
export const OBSERVATION_DEFAULT_MOOD: ObservationMood = "😊";

/** Default activity chip list (AC1: configurable — overridable via settings). */
export const OBSERVATION_ACTIVITIES_DEFAULT = [
  "Free play",
  "Story time",
  "Arts & crafts",
  "Music",
  "Outdoor play",
  "Snack",
  "Nap",
] as const;

/** Settings key the configurable activity-chip list is stored under. */
export const OBSERVATION_ACTIVITIES_SETTING_KEY = "observation_activities";

export const OBSERVATION_NOTE_MAX = 280;
export const OBSERVATION_ACTIVITIES_MAX = 20;
export const OBSERVATION_ACTIVITY_LABEL_MAX = 60;
export const ATTENDANT_NAME_MAX = 120;

/**
 * Record a pickup hand-off (P2-E03-S03 AC1/AC2): a mood (one of the 5 emojis),
 * any number of activity chips (each a short label), and a single optional
 * free-text note. `attendantName` is the operator's display name for the parent
 * feed (S04); the server falls back to the staff identifier when absent.
 */
export const handoffSchema = z.object({
  bookingId: z.string().uuid("bookingId must be a UUID"),
  mood: z.enum(OBSERVATION_MOODS),
  activities: z
    .array(
      z
        .string()
        .trim()
        .min(1, "An activity label cannot be empty")
        .max(OBSERVATION_ACTIVITY_LABEL_MAX, `Each activity must be ${OBSERVATION_ACTIVITY_LABEL_MAX} characters or fewer`),
    )
    .max(OBSERVATION_ACTIVITIES_MAX, `At most ${OBSERVATION_ACTIVITIES_MAX} activities`)
    .default([]),
  note: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v ?? "").trim())
    .refine((v) => v.length <= OBSERVATION_NOTE_MAX, `Note must be ${OBSERVATION_NOTE_MAX} characters or fewer`)
    .transform((v) => (v === "" ? null : v)),
  attendantName: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v ?? "").trim())
    .refine((v) => v.length <= ATTENDANT_NAME_MAX, `Attendant name must be ${ATTENDANT_NAME_MAX} characters or fewer`)
    .transform((v) => (v === "" ? null : v)),
});
export type HandoffInput = z.infer<typeof handoffSchema>;

/** The mood + activity options the hand-off screen renders (AC1). */
export interface ObservationOptions {
  moods: readonly string[];
  defaultMood: string;
  activities: string[];
}

/** Result of a hand-off (AC2, AC4). */
export interface HandoffResult {
  observationId: string;
  /** The receipt auto-generated for the visit (AC4). */
  receiptId: string;
  /** When the child was checked out (AC2). */
  checkedOutAt: string;
}

/**
 * Compose the one-line SMS summary the parent receives at hand-off (AC2). Pure
 * so the body is identical across API + tests: "😊 · Story time, Snack — note".
 */
export function handoffSummary(mood: string, activities: string[], note: string | null): string {
  const parts = [mood];
  if (activities.length > 0) parts.push(activities.join(", "));
  const base = parts.join(" · ");
  return note ? `${base} — ${note}` : base;
}

// ---------------------------------------------------------------------------
// Observations feed in the parent's account (P2-E03-S04)
// ---------------------------------------------------------------------------

/** Cap on observations returned in one feed page (newest-first). */
export const OBSERVATION_FEED_LIMIT = 200;

/** One entry in a child's read-only observations timeline (AC1). */
export interface ObservationFeedItem {
  id: string;
  childId: string;
  /** Mood emoji recorded at hand-off. */
  mood: string;
  /** Activity chips selected at hand-off. */
  activities: string[];
  /** Free-text note (may be null). */
  note: string | null;
  /** Attendant display name snapshot. */
  attendantName: string;
  /** The service the visit was for (for the service filter, AC2). */
  serviceId: string | null;
  serviceName: string | null;
  /** ISO timestamp the observation was recorded (the visit date, AC1). */
  date: string;
}

/** Filters for the observations feed (AC2). All optional; dates are YYYY-MM-DD. */
export interface ObservationFeedFilter {
  from?: string;
  to?: string;
  serviceId?: string;
}

/**
 * Keep only the observations matching the active feed filters (AC2). Pure so the
 * platform UI and any client-side narrowing share the server's rule. Dates are
 * compared on the calendar day (inclusive) of the observation's `date`.
 */
export function filterObservations(
  items: ObservationFeedItem[],
  filter: ObservationFeedFilter,
): ObservationFeedItem[] {
  return items.filter((o) => {
    const day = o.date.slice(0, 10);
    if (filter.from && day < filter.from) return false;
    if (filter.to && day > filter.to) return false;
    if (filter.serviceId && o.serviceId !== filter.serviceId) return false;
    return true;
  });
}

/** Kenya standard VAT rate, in basis points (16%). */
export const KENYA_VAT_RATE_BPS = 1600;

/**
 * The VAT already embedded in an amount that was charged as a single total
 * (P1-E08 line-tax). A booking charges exactly the service price, so the receipt
 * line total always equals that price; only a `vat_inclusive` service carries
 * VAT *within* it (backed out here). `vat_exempt` / `zero_rated` / `vat_exclusive`
 * charged-as-is carry no embedded VAT → 0. Integer cents, no float drift.
 */
export function inclusiveVatCents(amountCents: number, treatment: TaxTreatment): number {
  if (treatment !== "vat_inclusive") return 0;
  return Math.round((amountCents * KENYA_VAT_RATE_BPS) / (10_000 + KENYA_VAT_RATE_BPS));
}

/**
 * AC3: the profile-completion banner shows until the profile is "complete".
 * Complete = a profile row exists with both required names. Pure so it can be
 * unit-tested and shared by the API and the platform UI.
 */
export function isProfileComplete(profile: ParentProfile | null | undefined): boolean {
  if (!profile) return false;
  return profile.firstName.trim().length > 0 && profile.lastName.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Recent transactions panel (P1-E05-S05)
// ---------------------------------------------------------------------------

/** Default cap on Reception's recent-transactions panel (AC1: "last 10"). */
export const RECENT_TRANSACTIONS_LIMIT = 10;

/**
 * One recent wallet-ledger posting for the Reception panel (AC1), newest-first.
 * Carries the running balance *after* the posting (computed, never stored) so
 * staff can answer "did this go through?". Amounts are integer cents — format
 * to KES at the edge.
 */
export interface RecentTransaction {
  id: string;
  /** ISO timestamp the posting was made. */
  createdAt: string;
  /** `topup` | `debit` | `refund` | `adjustment` | `reversal`. */
  kind: string;
  /** `credit` | `debit`. */
  direction: string;
  /** Signed integer cents (credits positive, debits negative). */
  amountCents: number;
  /** Origin of the movement (e.g. `mpesa`, `cash:reception`, `checkin`, `admin`). */
  source: string;
  /** Running wallet balance (cents) after this posting. */
  balanceAfterCents: number;
}

/** Recent-transactions response: the windowed list, newest-first (AC1). */
export interface RecentTransactionsResponse {
  transactions: RecentTransaction[];
}

// ---------------------------------------------------------------------------
// Print + SMS-stub receipt from Reception (P1-E05-S06)
// ---------------------------------------------------------------------------

/**
 * A reception receipt for one wallet-ledger posting (the "transaction").
 *
 * This is the lightweight, browser-printable reception receipt (Decision 13 —
 * browser print, no native print server). It is intentionally NOT the full
 * eTIMS/KRA receipt engine (that is epic P1-E08): no tax fields, control unit,
 * or QR. The payload carries exactly what a parent needs as proof of payment:
 * who, how much, by what method, and when. Amounts are integer cents.
 */
export interface ReceiptPayload {
  /** The wallet-ledger entry id this receipt is for (the transaction id). */
  transactionId: string;
  /** Parent display name (first + last). */
  parentName: string;
  /** Parent's full normalised phone (+2547XXXXXXXX) — the SMS destination. */
  parentPhone: string;
  /** One receipt line per movement. For a single posting this has one row. */
  lineItems: ReceiptLineItem[];
  /** Net amount of the receipt in integer cents (sum of line item amounts). */
  amountCents: number;
  /** Payment/movement method, e.g. `topup`, `debit`, `refund`. */
  method: string;
  /** Origin label, e.g. `cash:reception`, `mpesa`, `checkin`. */
  source: string;
  /** ISO timestamp the posting was made (the receipt date). */
  date: string;
}

/** One line on a reception receipt. Amount is signed integer cents. */
export interface ReceiptLineItem {
  /** Human description of the movement (e.g. "Wallet top-up"). */
  description: string;
  /** Signed integer cents (credits positive, debits negative). */
  amountCents: number;
}

/** Receipt-by-transaction response (AC1, AC4): the payload, or 404 when unknown. */
export interface ReceiptResponse {
  receipt: ReceiptPayload;
}

/**
 * Human description for a receipt line, derived from the ledger entry kind.
 * Pure so the API shaping and any UI share one mapping.
 */
export function receiptLineDescription(kind: string): string {
  switch (kind) {
    case "topup":
      return "Wallet top-up";
    case "debit":
      return "Service charge";
    case "refund":
      return "Refund";
    case "reversal":
      return "Reversal";
    case "adjustment":
      return "Adjustment";
    default:
      return kind;
  }
}

/**
 * SMS receipt-copy result (AC3). `sent` is false when the parent has not
 * consented to SMS (P1-E02-S04) — the receipt copy is dropped rather than sent,
 * but the print path is unaffected.
 */
export interface ReceiptSmsResponse {
  transactionId: string;
  /** True iff the stub actually recorded an outbox row (consent satisfied). */
  sent: boolean;
  /** When not sent, the reason ("no_consent"); null on a successful send. */
  reason: "no_consent" | null;
}

// ---------------------------------------------------------------------------
// Float accounts (P1-E06-S01)
// ---------------------------------------------------------------------------

/**
 * The kinds of account that can hold customer wallet float (P1-E06-S01 AC1):
 * an M-Pesa till, a bank account, or a physical cash drawer. Reconciliation
 * (P1-E06-S02) groups the float liability by these accounts.
 */
export const FLOAT_ACCOUNT_KINDS = ["mpesa_till", "bank", "cash_drawer"] as const;
export type FloatAccountKind = (typeof FLOAT_ACCOUNT_KINDS)[number];

/** Max length of a float-account display name. */
export const FLOAT_ACCOUNT_NAME_MAX = 120;
/** Min/max opening balance (integer cents). Non-negative; a fresh account is 0. */
export const FLOAT_ACCOUNT_OPENING_MIN_CENTS = 0;
export const FLOAT_ACCOUNT_OPENING_MAX_CENTS = 50_000_000_00; // KES 50,000,000.00

/** A YYYY-MM-DD calendar date (opening date), validated to be a real date. */
const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "openingDate must be YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "openingDate is not a valid date");

/**
 * Create a float account (P1-E06-S01 AC1/AC2). Admin/treasury declares an
 * account that holds wallet float: a name, its kind, an opening balance (cents)
 * and the opening date. Opening balance defaults to 0 when omitted.
 */
export const floatAccountCreateSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(FLOAT_ACCOUNT_NAME_MAX),
  kind: z.enum(FLOAT_ACCOUNT_KINDS, { message: "Choose a float account kind" }),
  openingBalance: z
    .number()
    .int("openingBalance must be integer cents")
    .min(FLOAT_ACCOUNT_OPENING_MIN_CENTS, "openingBalance cannot be negative")
    .max(FLOAT_ACCOUNT_OPENING_MAX_CENTS, "openingBalance is too large")
    .default(0),
  openingDate: isoDateSchema,
});
export type FloatAccountCreateInput = z.infer<typeof floatAccountCreateSchema>;

/**
 * Update a float account (P1-E06-S01 AC2). All fields optional (partial patch);
 * `kind` is intentionally NOT editable after creation (it changes reconciliation
 * grouping semantics) — only the name, opening figures, and active flag. At
 * least one field must be present.
 */
export const floatAccountUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "name is required").max(FLOAT_ACCOUNT_NAME_MAX).optional(),
    openingBalance: z
      .number()
      .int("openingBalance must be integer cents")
      .min(FLOAT_ACCOUNT_OPENING_MIN_CENTS, "openingBalance cannot be negative")
      .max(FLOAT_ACCOUNT_OPENING_MAX_CENTS, "openingBalance is too large")
      .optional(),
    openingDate: isoDateSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "at least one field is required");
export type FloatAccountUpdateInput = z.infer<typeof floatAccountUpdateSchema>;

/**
 * Map a wallet top-up payment method to the float-account kind that holds the
 * cash for it (P1-E06-S01 AC3): cash → cash_drawer, the M-Pesa rails → mpesa_till,
 * card/bank → bank. Reconciliation tags each top-up's `float_account_id` from the
 * active account of the returned kind. Returns null for unknown methods.
 */
export function floatAccountKindForPaymentMethod(method: string): FloatAccountKind | null {
  switch (method) {
    case "cash":
      return "cash_drawer";
    case "mpesa":
    case "mpesa_stk":
    case "mpesa_c2b":
      return "mpesa_till";
    case "bank":
    case "bank_transfer":
    case "paystack":
    case "paystack_card":
      return "bank";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Daily reconciliation (P1-E06-S02)
// ---------------------------------------------------------------------------

/**
 * Drift threshold (AC2): when a float account's `system − real` drift exceeds
 * this magnitude (in integer cents) the reconciliation screen raises a red
 * banner. KES 100.00 == 10_000 cents. The comparison is strictly greater-than
 * on the absolute drift, so a drift of exactly KES 100 does NOT trip the banner.
 */
export const RECONCILIATION_DRIFT_THRESHOLD_CENTS = 100_00;

/** Bounds for an adjusting-entry amount (magnitude), in integer cents (KES). */
export const ADJUSTMENT_MIN_CENTS = 1; // a zero adjustment is meaningless
export const ADJUSTMENT_MAX_CENTS = 50_000_000_00; // KES 50,000,000.00
/** Max length of the free-text adjustment reason. */
export const ADJUSTMENT_REASON_MAX = 280;

/**
 * Drift for one account = `system − real` (AC2). System is the float
 * liability computed from the ledger; real is the manually-entered real-world
 * balance. Positive drift = the system thinks we hold more than we really do.
 * Pure so the API shaping and the UI share exactly one definition.
 */
export function computeDrift(systemCents: number, realCents: number): number {
  return systemCents - realCents;
}

/**
 * AC2: an account is "drifting" (red) when the magnitude of its drift exceeds
 * {@link RECONCILIATION_DRIFT_THRESHOLD_CENTS}. Strict greater-than, so an
 * exactly-on-threshold drift is still within tolerance. Pure rule shared by the
 * API and the UI so the threshold lives in exactly one place.
 */
export function isDrifting(driftCents: number): boolean {
  return Math.abs(driftCents) > RECONCILIATION_DRIFT_THRESHOLD_CENTS;
}

/**
 * AC2: the screen shows a single red banner when ANY account is drifting beyond
 * tolerance. Pure aggregate over the per-row drifts so the banner decision is
 * testable without a DOM.
 */
export function hasReconciliationDrift(driftsCents: readonly number[]): boolean {
  return driftsCents.some((d) => isDrifting(d));
}

/**
 * One reconciliation row (AC1): a float account's name, its system-tracked
 * balance (float liability from the ledger, cents), the manually-entered
 * real-world balance (cents, null until entered), the drift (`system − real`,
 * null while real is absent), and whether that drift trips the red banner.
 */
export interface ReconciliationRow {
  floatAccountId: string;
  name: string;
  kind: string;
  /** System-tracked balance in integer cents: float liability from the ledger. */
  systemCents: number;
  /** Manually-entered real-world balance in cents; null until the operator enters it. */
  realCents: number | null;
  /** `system − real` in cents; null while `realCents` is null (AC2). */
  driftCents: number | null;
  /** True when this row's drift exceeds tolerance (AC2). False while real is absent. */
  isDrifting: boolean;
}

/** Reconciliation read-model response (AC1, AC2): the rows + the banner flag. */
export interface ReconciliationResponse {
  /** The reporting day (YYYY-MM-DD) the system balances are computed as of. */
  asOf: string;
  rows: ReconciliationRow[];
  /** True when any row is drifting beyond tolerance → render the red banner (AC2). */
  hasDrift: boolean;
}

/**
 * Post an adjusting entry (P1-E06-S02 AC3). An admin records an adjustment
 * against a float account: a signed amount (cents), the account, and a required
 * reason. `posted_by` is the session admin — never accepted from the client; the
 * approver is captured at the dual-approval step (a treasury user), never here.
 * The amount must be a non-zero integer of cents within bounds.
 */
export const adjustingEntryCreateSchema = z.object({
  floatAccountId: z.string().uuid("floatAccountId must be a UUID"),
  amount: z
    .number({ message: "Amount is required" })
    .int("amount must be integer cents")
    .refine((v) => v !== 0, "amount must be non-zero")
    .refine(
      (v) => Math.abs(v) >= ADJUSTMENT_MIN_CENTS && Math.abs(v) <= ADJUSTMENT_MAX_CENTS,
      `amount magnitude must be between ${ADJUSTMENT_MIN_CENTS} and ${ADJUSTMENT_MAX_CENTS} cents`,
    ),
  reason: z.string().trim().min(1, "A reason is required").max(ADJUSTMENT_REASON_MAX),
});
export type AdjustingEntryCreateInput = z.infer<typeof adjustingEntryCreateSchema>;

/** Lifecycle of a reconciliation adjustment surfaced to the screen (AC3). */
export type AdjustmentStatus = "pending" | "approved" | "rejected";

/** A persisted adjusting entry as returned by the API (read back for the screen). */
export interface ReconciliationAdjustment {
  id: string;
  floatAccountId: string;
  /** Signed integer cents. */
  amount: number;
  reason: string;
  postedBy: string;
  approvedBy: string | null;
  status: AdjustmentStatus;
  /** Reversing-entry pattern (AC4): the prior adjustment this one reverses, if any. */
  reversesAdjustmentId: string | null;
  createdAt: string;
}

/* --------------------------------------- reconciliation CSV export (P1-E06-S04) */

/**
 * Reconciliation export request (P1-E06-S04 AC1). The accountant picks an
 * inclusive date range (YYYY-MM-DD); the export emits one CSV row per day per
 * float account across `[fromDate, toDate]`. Both bounds are validated calendar
 * dates and `fromDate <= toDate`. The range is capped to keep a single export
 * bounded.
 */
export const RECONCILIATION_EXPORT_MAX_DAYS = 366;

const exportDateSchema = z
  .string()
  .regex(isoDateRegex, "Date must be YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Date is not a valid calendar date");

export const reconciliationExportQuerySchema = z
  .object({
    fromDate: exportDateSchema,
    toDate: exportDateSchema,
  })
  .refine((v) => v.fromDate <= v.toDate, {
    message: "fromDate must be on or before toDate",
    path: ["toDate"],
  })
  .refine((v) => reconciliationExportDayCount(v.fromDate, v.toDate) <= RECONCILIATION_EXPORT_MAX_DAYS, {
    message: `Date range may not exceed ${RECONCILIATION_EXPORT_MAX_DAYS} days`,
    path: ["toDate"],
  });
export type ReconciliationExportQuery = z.infer<typeof reconciliationExportQuerySchema>;

/** Inclusive count of calendar days in `[fromDate, toDate]` (both YYYY-MM-DD). */
export function reconciliationExportDayCount(fromDate: string, toDate: string): number {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
  return Math.floor((to - from) / 86_400_000) + 1;
}

/** Every YYYY-MM-DD in `[fromDate, toDate]`, inclusive, ascending. */
export function reconciliationExportDays(fromDate: string, toDate: string): string[] {
  const count = reconciliationExportDayCount(fromDate, toDate);
  const days: string[] = [];
  const start = Date.parse(`${fromDate}T00:00:00Z`);
  for (let i = 0; i < count; i += 1) {
    days.push(new Date(start + i * 86_400_000).toISOString().slice(0, 10));
  }
  return days;
}

/**
 * One row of the reconciliation export (P1-E06-S04 AC2), in integer cents.
 *
 * - `systemCents`  — the ledger-derived float liability as of end-of-day `date`
 *   (opening balance + SUM of movements tagged to the account up to that day).
 * - `realCents`    — the real-world balance implied by approved adjustments: the
 *   system figure corrected by the cumulative approved adjustments through the
 *   day (`system + Σ approved adjustments ≤ day`).
 * - `driftCents`   — `system − real` (AC2): the still-uncorrected gap.
 * - `adjustmentsCents` — the net signed approved adjustments dated that very day.
 */
export interface ReconciliationExportRow {
  date: string;
  floatAccountId: string;
  account: string;
  systemCents: number;
  realCents: number;
  driftCents: number;
  adjustmentsCents: number;
}

/** Cents → KES decimal string, exact (no float), e.g. -12345 → "-123.45". */
export function centsToKes(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}${whole}.${String(frac).padStart(2, "0")}`;
}

/** Header columns of the reconciliation export, in order (AC2). */
export const RECONCILIATION_EXPORT_COLUMNS = [
  "date",
  "account",
  "system_balance_kes",
  "real_balance_kes",
  "drift_kes",
  "adjustments_kes",
] as const;

// ---------------------------------------------------------------------------
// Service catalogue + effective-dated prices (P1-E07-S01)
// ---------------------------------------------------------------------------

/** The service units admin can pick (AC1). CHECK-constrained in the migration too. */
export const SERVICE_UNITS = ["play", "talent", "salon", "coaching", "event"] as const;
export type ServiceUnit = (typeof SERVICE_UNITS)[number];

/**
 * Attribution roles a service may require (P1-E07-S02 AC1). A nullable ENUM on
 * `services`: when set, a booking of the service must be attributed to a `staff`
 * member of that role; when null, attribution is optional. The allowed values
 * MIRROR the `staff.role` taxonomy from P1-E07-S03 (stylist / instructor /
 * attendant / coach / event_staff) — these are staff *attribution* roles, NOT
 * the system RBAC roles (admin/reception/cashier/…). CHECK-constrained in the
 * migration too; the snapshot keeps code + DB aligned.
 */
export const ATTRIBUTION_ROLES = [
  "stylist",
  "instructor",
  "attendant",
  "coach",
  "event_staff",
] as const;
export type AttributionRole = (typeof ATTRIBUTION_ROLES)[number];

/** True when `value` is one of the allowed attribution roles (narrowing guard). */
export function isAttributionRole(value: unknown): value is AttributionRole {
  return typeof value === "string" && (ATTRIBUTION_ROLES as readonly string[]).includes(value);
}

/**
 * VAT / tax treatments a service may declare (P1-E07-S04 AC1). A non-null ENUM
 * on `services` defaulting to `vat_exempt` (KRA registration deferred — AC3),
 * consumed by the receipt engine (P1-E08) + eTIMS (P5) to compute / display
 * line-tax. CHECK-constrained in migration 0031; the snapshot keeps code + DB
 * aligned. NOT the system RBAC roles nor the attribution roles.
 */
export const TAX_TREATMENTS = [
  "vat_inclusive",
  "vat_exclusive",
  "vat_exempt",
  "zero_rated",
] as const;
export type TaxTreatment = (typeof TAX_TREATMENTS)[number];

/** The default treatment for a new service — KRA registration deferred (AC3). */
export const DEFAULT_TAX_TREATMENT: TaxTreatment = "vat_exempt";

/** True when `value` is one of the allowed tax treatments (narrowing guard). */
export function isTaxTreatment(value: unknown): value is TaxTreatment {
  return typeof value === "string" && (TAX_TREATMENTS as readonly string[]).includes(value);
}

/**
 * Coaching session formats a coaching offering may declare (P5-E01-S01 / Story
 * 31.1 AC2). A nullable ENUM on `services`: only `unit = 'coaching'` offerings
 * carry one. CHECK-constrained in migration 0096; the snapshot keeps code + DB
 * aligned. The coach is a `staff` record assigned via `attributionRoleRequired =
 * 'coach'` (P1-E07-S02; no login — AC3).
 */
export const COACHING_FORMATS = ["one_to_one", "group"] as const;
export type CoachingFormat = (typeof COACHING_FORMATS)[number];

/** True when `value` is one of the allowed coaching formats (narrowing guard). */
export function isCoachingFormat(value: unknown): value is CoachingFormat {
  return typeof value === "string" && (COACHING_FORMATS as readonly string[]).includes(value);
}

/** Max number of age-stage tags + max length of a single tag (guards typos, not policy). */
export const AGE_STAGE_TAGS_MAX = 24;
export const AGE_STAGE_TAG_MAX_LEN = 40;

/** Max length of a service display name + description. */
export const SERVICE_NAME_MAX = 120;
export const SERVICE_DESCRIPTION_MAX = 500;
/** Min/max service price (integer cents). Non-negative — a free/promo service is allowed. */
export const SERVICE_PRICE_MIN_CENTS = 0;
export const SERVICE_PRICE_MAX_CENTS = 50_000_000; // KES 500,000.00

/** Trim then collapse empty optional text to null. */
const optionalServiceText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v ?? "").trim())
  .transform((v) => (v === "" ? null : v));

/**
 * Optional attribution role (P1-E07-S02 AC1/AC3). Empty/absent collapses to null
 * (attribution optional, AC3); a present value MUST be one of {@link ATTRIBUTION_ROLES}
 * (validated against the staff-role taxonomy, AC1). Rejects free-text / RBAC roles.
 */
const optionalAttributionRole = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v ?? "").trim())
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || isAttributionRole(v), {
    message: `attributionRoleRequired must be one of: ${ATTRIBUTION_ROLES.join(", ")}`,
  });

/**
 * Optional tax treatment (P1-E07-S04 AC1/AC3). Absent/empty collapses to the
 * default `vat_exempt` (AC3); a present value MUST be one of {@link TAX_TREATMENTS}.
 * Used on create (defaults when omitted) and update (only changed when present).
 */
const optionalTaxTreatmentCreate = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v ?? "").trim())
  .transform((v) => (v === "" ? DEFAULT_TAX_TREATMENT : v))
  .refine((v) => isTaxTreatment(v), {
    message: `taxTreatment must be one of: ${TAX_TREATMENTS.join(", ")}`,
  });

/**
 * Create a service (P1-E07-S01 AC1). Required: name + unit. Optional (collapse to
 * null): description + the attribution role a booking must be attributed to. The
 * service is always created active; prices are set separately (effective-dated).
 * `taxTreatment` defaults to `vat_exempt` when omitted (P1-E07-S04 AC3).
 */
/** Largest sensible age bound in months (100 years) — guards typos, not policy. */
export const AGE_MONTHS_MAX = 1200;

/** Optional age-in-months bound (P2-E01-S02): absent or null = unbounded. */
const optionalAgeMonths = z
  .union([z.number().int("age must be a whole number of months").min(0, "age cannot be negative").max(AGE_MONTHS_MAX), z.null()])
  .optional();

/** Per-service cancellation fee in integer cents (P2-E01-S06). 0 = none. */
const cancellationFeeField = z
  .number()
  .int("cancellationFeeCents must be integer cents")
  .min(0, "cancellationFeeCents cannot be negative")
  .max(SERVICE_PRICE_MAX_CENTS, "cancellationFeeCents is too large")
  .optional();

/** Reschedule cut-off in hours before the slot (P2-E01-S05). 0–168 (≤ a week). */
const rescheduleCutoffField = z
  .number()
  .int("rescheduleCutoffHours must be a whole number of hours")
  .min(0, "rescheduleCutoffHours cannot be negative")
  .max(168, "rescheduleCutoffHours cannot exceed a week")
  .optional();

/**
 * Coaching session format field (P5-E01-S01 AC2). Empty/absent collapses to null
 * (unset, for CREATE) / undefined (untouched, for UPDATE); a present value MUST
 * be one of {@link COACHING_FORMATS}. `presentDefault` is what an absent field
 * resolves to: `null` on create, `undefined` on update.
 */
function coachingFormatField(presentDefault: null | undefined) {
  return z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v === undefined ? presentDefault : (v ?? "").trim() === "" ? null : v!.trim()))
    .refine((v) => v === undefined || v === null || isCoachingFormat(v), {
      message: `format must be one of: ${COACHING_FORMATS.join(", ")}`,
    });
}

/** Coaching session length in minutes (P5-E01-S01 AC2). Positive when set; null clears it. */
const coachingDurationField = z
  .union([
    z
      .number()
      .int("coachingDurationMinutes must be a whole number of minutes")
      .min(1, "coachingDurationMinutes must be positive")
      .max(24 * 60, "coachingDurationMinutes cannot exceed a day"),
    z.null(),
  ])
  .optional();

/**
 * Largest sensible seats-per-slot for a group coaching offering (P5-E01-S03 / Story
 * 31.3 AC1) — guards typos, not policy. A 1:1 offering is capacity 1; a group
 * offering is capacity N (> 1).
 */
export const COACHING_CAPACITY_MAX = 200;

/**
 * Group coaching capacity (P5-E01-S03 / Story 31.3 AC1): seats per generated slot.
 * Optional + integer in `[1, COACHING_CAPACITY_MAX]`; `null` clears it (an absent
 * field is left untouched on update). `1` is a 1:1 offering; `> 1` is a group.
 */
const coachingCapacityField = z
  .union([
    z
      .number()
      .int("coachingCapacity must be a whole number of seats")
      .min(1, "coachingCapacity must be at least 1")
      .max(COACHING_CAPACITY_MAX, "coachingCapacity is too large"),
    z.null(),
  ])
  .optional();

/**
 * Free-set age-stage tags for a coaching offering (P5-E01-S01 AC2): "expecting",
 * "0-3mo", ... A present (possibly empty) array is trimmed, blanks dropped,
 * duplicates removed (order-preserving) + length-bounded; `null` clears them. An
 * absent field resolves to `presentDefault` (`null` on create, `undefined` on
 * update). A free set — NOT an enum — so admin can coin new stages migration-free.
 */
function ageStageTagsField(presentDefault: null | undefined) {
  return z
    .union([z.array(z.string().trim().max(AGE_STAGE_TAG_MAX_LEN, "age-stage tag is too long")), z.null()])
    .optional()
    .transform((v) => {
      if (v === undefined) return presentDefault;
      if (v === null) return null;
      const seen = new Set<string>();
      const out: string[] = [];
      for (const raw of v) {
        const tag = raw.trim();
        if (tag === "" || seen.has(tag)) continue;
        seen.add(tag);
        out.push(tag);
      }
      return out;
    })
    .refine((v) => v == null || v.length <= AGE_STAGE_TAGS_MAX, {
      message: `at most ${AGE_STAGE_TAGS_MAX} age-stage tags`,
    });
}

/** True when a child of `ageMonths` fits a service's `[min, max]` month range (null bounds = open). */
export function slotFitsAge(
  ageMonths: number,
  ageMinMonths: number | null,
  ageMaxMonths: number | null,
): boolean {
  if (ageMinMonths !== null && ageMonths < ageMinMonths) return false;
  if (ageMaxMonths !== null && ageMonths > ageMaxMonths) return false;
  return true;
}

export const serviceCreateSchema = z
  .object({
    name: z.string().trim().min(1, "name is required").max(SERVICE_NAME_MAX),
    description: optionalServiceText.refine(
      (v) => v === null || v.length <= SERVICE_DESCRIPTION_MAX,
      `description must be ${SERVICE_DESCRIPTION_MAX} characters or fewer`,
    ),
    unit: z.enum(SERVICE_UNITS, { message: "Choose a service unit" }),
    attributionRoleRequired: optionalAttributionRole,
    taxTreatment: optionalTaxTreatmentCreate,
    ageMinMonths: optionalAgeMonths,
    ageMaxMonths: optionalAgeMonths,
    rescheduleCutoffHours: rescheduleCutoffField,
    cancellationFeeCents: cancellationFeeField,
    format: coachingFormatField(null),
    coachingDurationMinutes: coachingDurationField,
    coachingCapacity: coachingCapacityField,
    ageStageTags: ageStageTagsField(null),
  })
  .refine(
    (v) =>
      v.ageMinMonths == null || v.ageMaxMonths == null || v.ageMinMonths <= v.ageMaxMonths,
    { message: "ageMinMonths must be ≤ ageMaxMonths", path: ["ageMaxMonths"] },
  );
export type ServiceCreateInput = z.infer<typeof serviceCreateSchema>;

/**
 * Update a service (P1-E07-S01 AC1). All fields optional (partial patch); `unit`
 * is intentionally NOT editable after creation. Soft-delete is `isActive=false`
 * (no hard deletes). At least one field must be present.
 */
export const serviceUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "name is required").max(SERVICE_NAME_MAX).optional(),
    description: optionalServiceText.refine(
      (v) => v === null || v.length <= SERVICE_DESCRIPTION_MAX,
      `description must be ${SERVICE_DESCRIPTION_MAX} characters or fewer`,
    ),
    isActive: z.boolean().optional(),
    attributionRoleRequired: optionalAttributionRole,
    taxTreatment: z
      .enum(TAX_TREATMENTS, {
        message: `taxTreatment must be one of: ${TAX_TREATMENTS.join(", ")}`,
      })
      .optional(),
    ageMinMonths: optionalAgeMonths,
    ageMaxMonths: optionalAgeMonths,
    rescheduleCutoffHours: rescheduleCutoffField,
    cancellationFeeCents: cancellationFeeField,
    format: coachingFormatField(undefined),
    coachingDurationMinutes: coachingDurationField,
    coachingCapacity: coachingCapacityField,
    ageStageTags: ageStageTagsField(undefined),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.isActive !== undefined ||
      v.description !== null ||
      v.attributionRoleRequired !== null ||
      v.taxTreatment !== undefined ||
      v.ageMinMonths !== undefined ||
      v.ageMaxMonths !== undefined ||
      v.rescheduleCutoffHours !== undefined ||
      v.cancellationFeeCents !== undefined ||
      v.format !== undefined ||
      v.coachingDurationMinutes !== undefined ||
      v.coachingCapacity !== undefined ||
      v.ageStageTags !== undefined,
    "at least one field is required",
  )
  .refine(
    (v) =>
      v.ageMinMonths == null || v.ageMaxMonths == null || v.ageMinMonths <= v.ageMaxMonths,
    { message: "ageMinMonths must be ≤ ageMaxMonths", path: ["ageMaxMonths"] },
  );
export type ServiceUpdateInput = z.infer<typeof serviceUpdateSchema>;

/** A YYYY-MM-DD calendar date for a price's effective-from (validated as real). */
const serviceDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "effectiveFrom must be YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "effectiveFrom is not a valid date");

/**
 * Set a new effective-dated price (P1-E07-S01 AC2/AC3). A price change never
 * mutates an amount in place: the API closes the current open row and inserts a
 * new one starting at `effectiveFrom`. Amount is integer cents, non-negative.
 */
export const servicePriceCreateSchema = z.object({
  amountCents: z
    .number({ message: "Amount is required" })
    .int("amountCents must be integer cents")
    .min(SERVICE_PRICE_MIN_CENTS, "amountCents cannot be negative")
    .max(SERVICE_PRICE_MAX_CENTS, "amountCents is too large"),
  effectiveFrom: serviceDateSchema,
});
export type ServicePriceCreateInput = z.infer<typeof servicePriceCreateSchema>;

/* --- Subscription plans (P2-E02-S01) ------------------------------------- */

/** Billing/entitlement periods a subscription plan may use. */
export const SUBSCRIPTION_PERIODS = ["week", "month", "term"] as const;
export type SubscriptionPeriod = (typeof SUBSCRIPTION_PERIODS)[number];

export const PLAN_NAME_MAX = 120;
/** Bookings granted per period: at least 1, sane ceiling. */
export const ENTITLEMENT_MIN = 1;
export const ENTITLEMENT_MAX = 1000;

const entitlementField = z
  .number({ message: "entitlementCount is required" })
  .int("entitlementCount must be a whole number")
  .min(ENTITLEMENT_MIN, "entitlementCount must be at least 1")
  .max(ENTITLEMENT_MAX, "entitlementCount is too large");

/**
 * Create a subscription plan (P2-E02-S01 AC1). The service id comes from the
 * route path. Price is set separately (effective-dated, AC3).
 */
export const planCreateSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(PLAN_NAME_MAX),
  entitlementCount: entitlementField,
  period: z.enum(SUBSCRIPTION_PERIODS, { message: "period must be week, month or term" }),
});
export type PlanCreateInput = z.infer<typeof planCreateSchema>;

/** Update a plan (AC2). Partial patch; at least one field required. */
export const planUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "name is required").max(PLAN_NAME_MAX).optional(),
    entitlementCount: entitlementField.optional(),
    period: z.enum(SUBSCRIPTION_PERIODS, { message: "period must be week, month or term" }).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "at least one field is required");
export type PlanUpdateInput = z.infer<typeof planUpdateSchema>;

/** Set a new effective-dated plan price (AC3). Amount is integer cents, non-negative. */
export const planPriceCreateSchema = z.object({
  amountCents: z
    .number({ message: "Amount is required" })
    .int("amountCents must be integer cents")
    .min(SERVICE_PRICE_MIN_CENTS, "amountCents cannot be negative")
    .max(SERVICE_PRICE_MAX_CENTS, "amountCents is too large"),
  effectiveFrom: serviceDateSchema,
});
export type PlanPriceCreateInput = z.infer<typeof planPriceCreateSchema>;

/** A plan a parent can subscribe to, for the service-page "Subscribe" list (P2-E02-S02). */
export interface BookablePlan {
  id: string;
  name: string;
  entitlementCount: number;
  period: SubscriptionPeriod;
  /** Current effective price in integer cents, or null when none is set. */
  amountCents: number | null;
}

/** Parent subscribes a child to a plan (P2-E02-S02). */
export const subscriptionCreateSchema = z.object({
  planId: z.string().uuid("planId must be a valid id"),
  childId: z.string().uuid("childId must be a valid id"),
});
export type SubscriptionCreateInput = z.infer<typeof subscriptionCreateSchema>;

// ---------------------------------------------------------------------------
// Events & recital ticketing (Epic 30)
// ---------------------------------------------------------------------------

/**
 * The kind of happening an event represents (Epic 30). Mirrors the
 * `events.unit` CHECK in migration 0067 and the admin/public route enums.
 */
export const EVENT_UNITS = ["reading_corner", "talent_recital", "general"] as const;
export type EventUnit = (typeof EVENT_UNITS)[number];

/**
 * One ticket tier on an admin-facing event (P4-E05-S01). A named price band:
 * `priceCents` 0 denotes a free RSVP tier (story 30-4). `allotment` is the seat
 * cap for the tier; the optional sale window bounds when it may be sold.
 */
export interface EventTierDto {
  id: string;
  eventId: string;
  name: string;
  priceCents: number;
  allotment: number;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
}

/**
 * An event as returned by the admin API (P4-E05-S01) — the full record with its
 * ticket tiers. Timestamps are ISO strings; `unit` is one of {@link EVENT_UNITS}.
 */
export interface EventDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  unit: EventUnit;
  startsAt: string;
  endsAt: string;
  venue: string | null;
  capacity: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  tiers: EventTierDto[];
}

/**
 * Public (unauthenticated) view of a ticket tier (P4-E05-S02). Exposes the
 * remaining capacity and sold-out / free flags the storefront renders; `sold`
 * is 0 until ticketing lands (story 30-3).
 */
export interface PublicEventTierDto {
  id: string;
  name: string;
  priceCents: number;
  allotment: number;
  sold: number;
  remaining: number;
  soldOut: boolean;
  isFree: boolean;
}

/**
 * Public (unauthenticated) view of a published event (P4-E05-S02). Drops the
 * admin-only lifecycle fields (`published`, audit timestamps) and carries the
 * public tier projection.
 */
export interface PublicEventDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  unit: EventUnit;
  startsAt: string;
  endsAt: string;
  venue: string | null;
  capacity: number;
  tiers: PublicEventTierDto[];
}

/**
 * Public (unauthenticated) staff-earnings viewer (P3-E02-S01). The reception-PC
 * dropdown entry: an active staff member's id + display name. NO PII beyond the
 * display name — no phone, no role, no parent/booking detail (AC4).
 */
export interface PublicStaffOptionDto {
  id: string;
  displayName: string;
}

/** One service in the earnings breakdown ranked by completed-visit count (P3-E02-S02 AC1). */
export interface PublicServiceCountDto {
  serviceName: string;
  count: number;
}

/** One service in the earnings breakdown ranked by net commission revenue (P3-E02-S02 AC1). */
export interface PublicServiceRevenueDto {
  serviceName: string;
  revenueCents: number;
}

/**
 * Public (unauthenticated) earnings figures for one staff member (P3-E02-S01
 * AC3). Display name plus the three numbers: month-to-date net commission, last
 * calendar month's net, and the most recent confirmed payout (amount + ISO date,
 * both null if never paid out). Plus the earnings breakdown (P3-E02-S02 AC1)
 * scoped to the same month-to-date window: completed-visit count and the top 3
 * services by count and by revenue. Carries ONLY service names + numbers — NO
 * parent/child/booking PII (S01 AC4 / S02 AC2).
 */
export interface PublicStaffEarningsDto {
  staffId: string;
  displayName: string;
  monthToDateCents: number;
  lastMonthCents: number;
  lastPayoutCents: number | null;
  lastPayoutAt: string | null;
  /** Completed visits in the month-to-date window (P3-E02-S02 AC1). */
  completedVisits: number;
  /** Top 3 services by completed-visit count this period (P3-E02-S02 AC1). */
  topServicesByCount: PublicServiceCountDto[];
  /** Top 3 services by net commission revenue this period (P3-E02-S02 AC1). */
  topServicesByRevenue: PublicServiceRevenueDto[];
}

/** Max tickets a single guest order/RSVP may request (sane bound on a free flow). */
export const TICKET_ORDER_MAX_QUANTITY = 20;

/** Permissive email regex reused for the optional e-ticket email on a guest order. */
const ticketEmailRegex = emailLightRegex;

/**
 * Guest ticket checkout (P4-E05-S03). No account: the buyer supplies a name and
 * phone (+ optional email for the e-ticket). `tierId` selects a paid tier on the
 * event; `quantity` is the seat count. Payment provider is chosen here; a free
 * (price 0) tier is handled by the RSVP flow (30-4), not this schema.
 */
export const ticketCheckoutSchema = z.object({
  tierId: z.string().uuid("tierId must be a valid id"),
  quantity: z
    .number({ message: "quantity is required" })
    .int("quantity must be a whole number")
    .min(1, "At least one ticket is required")
    .max(TICKET_ORDER_MAX_QUANTITY, `At most ${TICKET_ORDER_MAX_QUANTITY} tickets per order`),
  buyerName: z.string().trim().min(1, "Your name is required").max(120),
  buyerPhone: z.string().trim().min(1, "A phone number is required").max(32),
  buyerEmail: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v ?? "").trim())
    .refine((v) => v === "" || ticketEmailRegex.test(v), { message: "Enter a valid email address" })
    .transform((v) => (v === "" ? null : v)),
  provider: z.enum(["mpesa", "paystack"], { message: "Choose M-Pesa or card" }),
});
export type TicketCheckoutInput = z.infer<typeof ticketCheckoutSchema>;

/**
 * Free-event RSVP (P4-E05-S04). Same buyer fields as a paid checkout minus the
 * payment provider — the selected tier must be free (price 0). Tickets are
 * issued immediately.
 */
export const ticketRsvpSchema = z.object({
  tierId: z.string().uuid("tierId must be a valid id"),
  quantity: z
    .number({ message: "quantity is required" })
    .int("quantity must be a whole number")
    .min(1, "At least one spot is required")
    .max(TICKET_ORDER_MAX_QUANTITY, `At most ${TICKET_ORDER_MAX_QUANTITY} spots per RSVP`),
  buyerName: z.string().trim().min(1, "Your name is required").max(120),
  buyerPhone: z.string().trim().min(1, "A phone number is required").max(32),
  buyerEmail: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v ?? "").trim())
    .refine((v) => v === "" || ticketEmailRegex.test(v), { message: "Enter a valid email address" })
    .transform((v) => (v === "" ? null : v)),
});
export type TicketRsvpInput = z.infer<typeof ticketRsvpSchema>;

/** One issued ticket as returned to the buyer / door list (P4-E05-S03/S05). */
export interface TicketDto {
  id: string;
  code: string;
  eventId: string;
  tierId: string;
  buyerName: string;
  buyerPhone: string;
  status: string;
  checkedInAt: string | null;
}

/** A guest ticket order as returned by the checkout/RSVP API. */
export interface TicketOrderDto {
  id: string;
  eventId: string;
  tierId: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string | null;
  quantity: number;
  amountCents: number;
  status: string;
  provider: string | null;
  paymentReference: string | null;
}

/** Door check-in: mark one ticket admitted by its code (P4-E05-S05). */
export const ticketCheckInSchema = z.object({
  code: z.string().trim().min(1, "A ticket code is required").max(64),
});
export type TicketCheckInInput = z.infer<typeof ticketCheckInSchema>;

/** One row on the staff door list (P4-E05-S05). */
export interface DoorListTicket {
  id: string;
  code: string;
  buyerName: string;
  buyerPhone: string;
  tierName: string;
  status: string;
  checkedInAt: string | null;
}

/** Door list response: the tickets plus the capacity-vs-checked-in counter (AC3). */
export interface DoorListResponse {
  eventId: string;
  eventName: string;
  total: number;
  checkedIn: number;
  tickets: DoorListTicket[];
}

/* --- Service schedules / time-slots (P2-E01-S01) ------------------------- */

/** HH:MM 24h wall-clock time (mirrors the `service_schedules` migration CHECK). */
export const SCHEDULE_TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/u;
/**
 * A generated slot is at least 5 minutes and at most a full day long. The 5-min
 * floor is a sane product minimum that also bounds how many windows one schedule
 * can materialise per day (≤ 288), keeping bulk slot inserts well within
 * Postgres' bind-parameter limit.
 */
export const SLOT_DURATION_MIN_MINUTES = 5;
export const SLOT_DURATION_MAX_MINUTES = 24 * 60;
/** Sanity ceiling on per-slot capacity (children per slot). */
export const SLOT_CAPACITY_MAX = 1000;

/** "HH:MM" → minutes since midnight. Assumes {@link SCHEDULE_TIME_REGEX} matched. */
function scheduleHmToMinutes(hm: string): number {
  const [h, m] = hm.split(":");
  return Number(h) * 60 + Number(m);
}

const scheduleTimeField = z
  .string()
  .trim()
  .regex(SCHEDULE_TIME_REGEX, "time must be HH:MM (24-hour)");
const dayOfWeekField = z
  .number({ message: "dayOfWeek is required" })
  .int("dayOfWeek must be an integer 0–6")
  .min(0, "dayOfWeek must be 0 (Sun) – 6 (Sat)")
  .max(6, "dayOfWeek must be 0 (Sun) – 6 (Sat)");
const slotDurationField = z
  .number({ message: "slotDurationMinutes is required" })
  .int("slotDurationMinutes must be a whole number of minutes")
  .min(SLOT_DURATION_MIN_MINUTES, `slotDurationMinutes must be at least ${SLOT_DURATION_MIN_MINUTES}`)
  .max(SLOT_DURATION_MAX_MINUTES, "slotDurationMinutes cannot exceed a full day");
const slotCapacityField = z
  .number({ message: "capacity is required" })
  .int("capacity must be a whole number")
  .min(0, "capacity cannot be negative")
  .max(SLOT_CAPACITY_MAX, "capacity is too large");

/**
 * Create a recurring availability schedule for a service (P2-E01-S01 AC1). The
 * service id comes from the route path, not the body. `endTime` must be strictly
 * after `startTime`, and at least one whole slot must fit in the window.
 */
export const scheduleCreateSchema = z
  .object({
    dayOfWeek: dayOfWeekField,
    startTime: scheduleTimeField,
    endTime: scheduleTimeField,
    slotDurationMinutes: slotDurationField,
    capacity: slotCapacityField,
    isActive: z.boolean().optional(),
  })
  .refine((v) => scheduleHmToMinutes(v.startTime) < scheduleHmToMinutes(v.endTime), {
    message: "endTime must be after startTime",
    path: ["endTime"],
  })
  .refine(
    (v) => v.slotDurationMinutes <= scheduleHmToMinutes(v.endTime) - scheduleHmToMinutes(v.startTime),
    { message: "slotDurationMinutes must fit within the start–end window", path: ["slotDurationMinutes"] },
  );
export type ScheduleCreateInput = z.infer<typeof scheduleCreateSchema>;

/**
 * Update a schedule (P2-E01-S01 AC4). All fields optional (partial patch); at
 * least one must be present. When both times are supplied, `endTime` must be
 * after `startTime`. Edits only affect FUTURE generated slots.
 */
export const scheduleUpdateSchema = z
  .object({
    dayOfWeek: dayOfWeekField.optional(),
    startTime: scheduleTimeField.optional(),
    endTime: scheduleTimeField.optional(),
    slotDurationMinutes: slotDurationField.optional(),
    capacity: slotCapacityField.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "at least one field is required")
  .refine(
    (v) =>
      v.startTime === undefined ||
      v.endTime === undefined ||
      scheduleHmToMinutes(v.startTime) < scheduleHmToMinutes(v.endTime),
    { message: "endTime must be after startTime", path: ["endTime"] },
  );
export type ScheduleUpdateInput = z.infer<typeof scheduleUpdateSchema>;

/* --- Slot availability browse (P2-E01-S02) ------------------------------- */

/** How many days of availability the parent browse shows (AC1 — a 7-day grid). */
export const AVAILABILITY_WINDOW_DAYS = 7;

/** A service a parent can browse + book, for the `/book` listing (P2-E01-S02). */
export interface BookableService {
  id: string;
  name: string;
  description: string | null;
  unit: ServiceUnit;
  ageMinMonths: number | null;
  ageMaxMonths: number | null;
}

/** One bookable slot in the parent browse, with display state (AC1/AC3). */
export interface AvailableSlot {
  id: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  capacity: number;
  remainingCapacity: number;
  /** Past or earlier-today — greyed out / disabled (AC3). */
  isPast: boolean;
  /** Bookable now: not past AND has remaining capacity. */
  available: boolean;
}

/** Parent availability response for a service + child over the browse window. */
export interface ServiceAvailability {
  serviceId: string;
  childId: string;
  /** First day of the grid (`YYYY-MM-DD`, server clock) — anchors the client grid. */
  windowStart: string;
  ageMonths: number;
  ageMinMonths: number | null;
  ageMaxMonths: number | null;
  /** Whether the child's age fits the service's range (AC2). When false, `slots` is empty. */
  eligible: boolean;
  slots: AvailableSlot[];
}

/* --- Booking a slot (P2-E01-S03) ----------------------------------------- */

/** Book a slot for one of the parent's children. Both ids come from the body. */
export const bookingCreateSchema = z.object({
  slotId: z.string().uuid("slotId must be a valid id"),
  childId: z.string().uuid("childId must be a valid id"),
});
export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;

/** Reschedule a booking to a different slot (P2-E01-S05). */
export const rescheduleBookingSchema = z.object({
  newSlotId: z.string().uuid("newSlotId must be a valid id"),
});
export type RescheduleBookingInput = z.infer<typeof rescheduleBookingSchema>;

/**
 * Reception books a slot on behalf of a walk-in (P2-E01-S04). `parentId` +
 * `childId` are the walk-in's profile + child; `staffId` attributes the booking
 * when the service requires a role.
 */
export const receptionBookingCreateSchema = z.object({
  parentId: z.string().uuid("parentId must be a valid id"),
  childId: z.string().uuid("childId must be a valid id"),
  slotId: z.string().uuid("slotId must be a valid id"),
  staffId: z.string().uuid("staffId must be a valid id").optional(),
});
export type ReceptionBookingCreateInput = z.infer<typeof receptionBookingCreateSchema>;

/** One row in the parent's bookings list (P2-E01-S07). */
export interface ParentBooking {
  bookingId: string;
  serviceId: string;
  serviceName: string;
  childId: string;
  childName: string;
  slotId: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  status: "confirmed" | "cancelled";
  /** The slot is in the past (ended). */
  isPast: boolean;
  /** Eligible for an online reschedule/cancel: confirmed, future, before the cut-off. */
  canModify: boolean;
}

/** Successful booking confirmation returned to the parent (P2-E01-S03). */
export interface BookingConfirmation {
  bookingId: string;
  invoiceId: string;
  slotId: string;
  serviceId: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  /** Service price snapshotted onto the pending invoice (AC3), integer KES cents. */
  amountCents: number;
}

/* --- Kids-Only Salon booking (P3-E03-S02 / Story 25.2) ------------------- */

/** How many days ahead the parent salon-slot browse window spans. */
export const SALON_AVAILABILITY_WINDOW_DAYS = 60;

/** A salon stylist a parent can pick for a service (P3-E03-S02 AC1). */
export interface SalonStylistOption {
  id: string;
  displayName: string;
}

/** A bookable salon slot in the parent browse (P3-E03-S02 AC1). */
export interface SalonSlotOption {
  id: string;
  staffId: string;
  staffName: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

/**
 * Parent salon-availability response for a service (P3-E03-S02 AC1/AC2). When a
 * `staffId` filter is supplied only that stylist's open slots are returned (AC2);
 * otherwise every stylist's open slots are listed for the "Any available" flow.
 */
export interface SalonAvailability {
  serviceId: string;
  /** First day of the browse window (`YYYY-MM-DD`, server clock). */
  windowStart: string;
  /** The stylists with at least one open slot in the window — the stylist picker. */
  stylists: SalonStylistOption[];
  /** The active stylist filter, or null for "Any available". */
  staffId: string | null;
  slots: SalonSlotOption[];
}

/**
 * Confirm a salon booking (P3-E03-S02 AC4). `salonSlotId` + `childId` are the
 * chosen slot + child. `staffId` is the picked stylist; omit it for "Any
 * available" (the server resolves the least-busy stylist's slot, AC3) — when
 * supplied it must match the slot's stylist (AC2).
 */
export const salonBookingCreateSchema = z.object({
  salonSlotId: z.string().uuid("salonSlotId must be a valid id"),
  childId: z.string().uuid("childId must be a valid id"),
  staffId: z.string().uuid("staffId must be a valid id").optional(),
});
export type SalonBookingCreateInput = z.infer<typeof salonBookingCreateSchema>;

/** Successful salon-booking confirmation returned to the parent (P3-E03-S02 AC4). */
export interface SalonBookingConfirmation {
  bookingId: string;
  invoiceId: string;
  salonSlotId: string;
  serviceId: string;
  /** The stylist the booking was attributed to (resolved — AC3/AC4). */
  staffId: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  /** Service price snapshotted onto the pending invoice (AC4), integer KES cents. */
  amountCents: number;
}

/* --- 1:1 Coaching booking (P5-E01-S02 / Story 31.2) ---------------------- */

/** How many days ahead the parent coaching-slot browse window spans. */
export const COACHING_AVAILABILITY_WINDOW_DAYS = 60;

/** A coach a parent can pick for a 1:1 coaching offering (P5-E01-S02 AC2). */
export interface CoachOption {
  id: string;
  displayName: string;
}

/** A bookable coaching slot in the parent browse (P5-E01-S02 AC2 / P5-E01-S03 AC2). */
export interface CoachingSlotOption {
  id: string;
  staffId: string;
  staffName: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  /**
   * Total seats the slot holds (P5-E01-S03 AC2). 1 for a 1:1 offering; N for a
   * group offering. Snapshotted onto the slot at generation time.
   */
  capacity: number;
  /**
   * Seats still open: `capacity − non-cancelled bookings` (P5-E01-S03 AC2). The
   * parent UI shows "X seats left"; a full slot (0) is not offered.
   */
  seatsRemaining: number;
}

/**
 * Parent coaching-availability response for an offering (P5-E01-S02 AC2). A 1:1
 * session is privately held, so the parent picks the coach EXPLICITLY: every coach
 * with an open slot is listed, and a `staffId` filter narrows the slots to just
 * that coach's open slots.
 */
export interface CoachingAvailability {
  serviceId: string;
  /** First day of the browse window (`YYYY-MM-DD`, server clock). */
  windowStart: string;
  /** The coaches with at least one open slot in the window — the coach picker. */
  coaches: CoachOption[];
  /** The active coach filter, or null when none is picked yet. */
  staffId: string | null;
  slots: CoachingSlotOption[];
}

/**
 * Confirm a 1:1 coaching booking (P5-E01-S02 AC3/AC4). `coachingSlotId` + `childId`
 * are the chosen slot + child. `staffId` is the picked coach; when supplied it must
 * match the slot's coach (AC2).
 */
export const coachingBookingCreateSchema = z.object({
  coachingSlotId: z.string().uuid("coachingSlotId must be a valid id"),
  childId: z.string().uuid("childId must be a valid id"),
  staffId: z.string().uuid("staffId must be a valid id").optional(),
});
export type CoachingBookingCreateInput = z.infer<typeof coachingBookingCreateSchema>;

/** Successful 1:1 coaching-booking confirmation returned to the parent (P5-E01-S02 AC3/AC4). */
export interface CoachingBookingConfirmation {
  bookingId: string;
  invoiceId: string;
  coachingSlotId: string;
  serviceId: string;
  /** The coach the booking was attributed to (AC2/AC4). */
  staffId: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  /** Offering price snapshotted onto the pending invoice (AC4), integer KES cents. */
  amountCents: number;
}

/* --- Coach session notes — PRIVATE (P5-E01-S04 / Story 31.4) --------------- */

/**
 * Record a PRIVATE coach session note after check-out (AC1). The note is free text
 * and ENCRYPTED AT REST server-side; this body carries only the booking + plaintext
 * note (over TLS). A reasonable upper bound guards against accidental dumps.
 */
export const coachingSessionNoteCreateSchema = z.object({
  bookingId: z.string().uuid("bookingId must be a valid id"),
  note: z
    .string()
    .trim()
    .min(1, "Note cannot be empty")
    .max(4000, "Note is too long (max 4000 characters)"),
});
export type CoachingSessionNoteCreateInput = z.infer<typeof coachingSessionNoteCreateSchema>;

/** Confirmation that a private coach note was recorded (AC1). Carries NO content back. */
export interface CoachingSessionNoteRecordedDto {
  id: string;
  bookingId: string;
}

/** A decrypted coach session note for the AUTHENTICATED admin/reception view (AC2). */
export interface CoachingSessionNoteDto {
  id: string;
  bookingId: string;
  staffId: string | null;
  staffName: string | null;
  /** Decrypted note text, or null when the row has been anonymised (AC4). */
  note: string | null;
  recordedAt: string;
  anonymised: boolean;
}

/**
 * A coach's NON-SENSITIVE session-note summary for the UNAUTHENTICATED coach viewer
 * (AC2 security decision): counts + dates only — NEVER any note content. The full
 * decrypted content requires the authenticated admin/reception path.
 */
export interface CoachingSessionNoteSummaryDto {
  staffId: string;
  staffName: string;
  /** Number of live (non-anonymised) notes recorded for this coach. */
  noteCount: number;
  /** Per-note metadata: id, booking, recorded date — no content. */
  sessions: Array<{ noteId: string; bookingId: string; recordedAt: string }>;
}

/* --- Salon counter check-in & service completion (P3-E03-S03 / Story 25.3) - */

/** One salon booking on the reception counter board (AC1). */
export interface SalonCounterBooking {
  bookingId: string;
  salonSlotId: string;
  staffId: string;
  staffName: string;
  childId: string;
  childName: string;
  /** Per-child photo consent (P1-E02-S04) — gates the completion photo (AC3). */
  photoConsent: boolean;
  serviceId: string | null;
  serviceName: string | null;
  slotDate: string;
  startTime: string;
  endTime: string;
  paidVia: "wallet" | "subscription";
  /** Set once the child has been checked in (AC2), else null. */
  checkedInAt: string | null;
  /** Set once the salon service has been marked complete (AC3), else null. */
  completedAt: string | null;
  /** The completion photo reference, when captured under consent (AC3). */
  photoRef: string | null;
}

/** An hour-bucketed group of one stylist's bookings on the board (AC1). */
export interface SalonHourGroup {
  /** The hour bucket label, `HH:00` (derived from each booking's start time). */
  hour: string;
  bookings: SalonCounterBooking[];
}

/** A stylist's column on the counter board, their bookings bucketed by hour (AC1). */
export interface SalonStylistGroup {
  staffId: string;
  staffName: string;
  hours: SalonHourGroup[];
}

/** The day's salon counter board (AC1). */
export interface SalonCounterBoard {
  /** The board date (`YYYY-MM-DD`, server clock). */
  date: string;
  stylists: SalonStylistGroup[];
}

/** The `HH:00` hour bucket a slot's start time falls in (AC1). */
export function salonHourBucket(startTime: string): string {
  return `${startTime.slice(0, 2)}:00`;
}

/**
 * Group flat salon bookings into the counter board: by stylist, then by hour
 * (AC1). Stylists keep the input order (the query orders by stylist name then
 * start time), so the board renders deterministically. Within a stylist, hours
 * ascend and bookings keep their start-time order.
 */
export function groupSalonBookingsByStylistAndHour(
  bookings: readonly SalonCounterBooking[],
  date: string,
): SalonCounterBoard {
  const stylistOrder: string[] = [];
  const byStylist = new Map<string, { staffName: string; hours: Map<string, SalonCounterBooking[]> }>();
  for (const b of bookings) {
    let entry = byStylist.get(b.staffId);
    if (!entry) {
      entry = { staffName: b.staffName, hours: new Map() };
      byStylist.set(b.staffId, entry);
      stylistOrder.push(b.staffId);
    }
    const hour = salonHourBucket(b.startTime);
    const bucket = entry.hours.get(hour) ?? [];
    bucket.push(b);
    entry.hours.set(hour, bucket);
  }
  const stylists: SalonStylistGroup[] = stylistOrder.map((staffId) => {
    const entry = byStylist.get(staffId)!;
    const hours: SalonHourGroup[] = [...entry.hours.entries()]
      .sort(([a], [c]) => (a < c ? -1 : a > c ? 1 : 0))
      .map(([hour, hb]) => ({ hour, bookings: hb }));
    return { staffId, staffName: entry.staffName, hours };
  });
  return { date, stylists };
}

/** Check a salon booking in at the counter (AC2). */
export const salonCheckInSchema = z.object({
  bookingId: z.string().uuid("bookingId must be a UUID"),
  /** ISO drop-off / arrival time captured at check-in (optional). */
  droppedOffAt: z.string().datetime({ message: "droppedOffAt must be an ISO timestamp" }).optional(),
});
export type SalonCheckInInput = z.infer<typeof salonCheckInSchema>;

/** Max length of a completion photo reference (an object-store key / id). */
export const SALON_PHOTO_REF_MAX = 512;

/**
 * Mark a salon service complete (AC3). `photoRef` is the OPTIONAL reference to a
 * captured photo — the server stores it only when the child's photo consent is
 * true (consent-gated), otherwise it is dropped.
 */
export const salonCompleteSchema = z.object({
  bookingId: z.string().uuid("bookingId must be a UUID"),
  photoRef: z.string().trim().min(1).max(SALON_PHOTO_REF_MAX).optional(),
});
export type SalonCompleteInput = z.infer<typeof salonCompleteSchema>;

/** Result of marking a salon service complete (AC3). */
export interface SalonCompleteResult {
  bookingId: string;
  attendanceId: string;
  completedAt: string;
  /** True only when a photo reference was stored (consent satisfied). */
  photoStored: boolean;
  /** True when the photo was dropped because the child has no photo consent (AC3). */
  photoSkippedNoConsent: boolean;
}

/** Max minutes a walk-in "book now" salon slot can span. */
export const SALON_WALKIN_MAX_DURATION_MIN = 240;

/**
 * Reception salon walk-in (AC4): create a parent (REUSES the P1-E02-S02 walk-in
 * shape), add a child, book a one-off salon slot for now with the chosen stylist,
 * and immediately check the child in. Names + phone identify the new family; the
 * child's `photoConsent` defaults off unless explicitly granted.
 */
export const salonWalkInSchema = z.object({
  // Parent (REUSES the walk-in fields).
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  phone: z.string().trim().min(1, "Phone is required"),
  email: z.string().trim().email("Enter a valid email").max(160).optional(),
  residentialArea: z.string().trim().max(120).optional(),
  // Child.
  childFirstName: z.string().trim().min(1, "Child first name is required").max(80),
  childLastName: z.string().trim().max(80).optional(),
  childDateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "childDateOfBirth must be YYYY-MM-DD"),
  photoConsent: z.boolean().optional(),
  // Salon visit.
  serviceId: z.string().uuid("serviceId must be a valid id"),
  staffId: z.string().uuid("staffId must be a valid id"),
  /** Slot window start, `HH:MM` (defaults to the server's current hour). */
  startTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/u, "startTime must be HH:MM").optional(),
});
export type SalonWalkInInput = z.infer<typeof salonWalkInSchema>;

/** Result of a reception salon walk-in (AC4): the new family + booking + check-in. */
export interface SalonWalkInResult {
  userId: string;
  parentId: string;
  childId: string;
  bookingId: string;
  invoiceId: string;
  salonSlotId: string;
  attendanceId: string;
  /** Check-in resolution (mirrors the attendant check-in). */
  outcome: CheckInOutcome;
}

/**
 * Reassign a salon booking to a different stylist on the day (P3-E03-S04 / Story
 * 25.4). The select-and-reassign control sends the booking + the chosen target
 * stylist; the server picks an open slot for that stylist, moves the booking,
 * updates attribution, and moves any settled commission.
 */
export const salonReassignSchema = z.object({
  bookingId: z.string().uuid("bookingId must be a UUID"),
  toStaffId: z.string().uuid("toStaffId must be a UUID"),
});
export type SalonReassignInput = z.infer<typeof salonReassignSchema>;

/** Result of reassigning a salon booking between stylists (Story 25.4). */
export interface SalonReassignResult {
  bookingId: string;
  /** The stylist the booking was attributed to before the move. */
  fromStaffId: string;
  /** The stylist the booking is attributed to after the move. */
  toStaffId: string;
  /** The salon slot the booking now occupies. */
  newSalonSlotId: string;
  /** True when the booking was already on the target stylist (no-op). */
  unchanged: boolean;
  /** True when settled commission was moved old → new (AC4). */
  commissionMoved: boolean;
}

/* --- Salon-specific reporting tile + drill-down (P3-E03-S05 / Story 25.5) - */

/**
 * One stylist's slice of the salon day in the drill-down (AC2). Mirrors
 * `@bm/catalog`'s `SalonStylistDayStats` — kept here as the transport contract.
 */
export interface SalonStylistDayStatsDto {
  staffId: string;
  staffName: string;
  /** Non-cancelled salon bookings attributed to this stylist on the day. */
  bookings: number;
  /** Of those, how many were no-shows (slot passed + never checked in). */
  noShows: number;
  /** Total invoiced revenue (cents) for this stylist's bookings on the day. */
  revenueCents: number;
}

/**
 * The salon-report API response (P3-E03-S05): the headline tile totals (AC1) and
 * the per-stylist drill-down (AC2). Returned by `GET /admin/salon-report`. The
 * shape is identical to `@bm/catalog`'s `SalonDayReport` (all primitives, already
 * serialisable) — this is the wire contract the admin tile + drill-down read.
 */
export interface SalonDayReportDto {
  /** The report date (`YYYY-MM-DD`). */
  date: string;
  /** Total non-cancelled salon bookings on the day (AC1). */
  bookings: number;
  /** Total no-shows on the day (AC1). */
  noShows: number;
  /** Total invoiced revenue (cents) on the day (AC1). */
  revenueCents: number;
  /** Per-stylist breakdown, ordered by stylist name then id (AC2). */
  stylists: SalonStylistDayStatsDto[];
}

/** Format integer KES cents for the salon tile, e.g. `KES 7,500.00`. */
export function formatSalonRevenue(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const major = Math.trunc(abs / 100);
  const minor = String(abs % 100).padStart(2, "0");
  return `${sign}KES ${major.toLocaleString("en-KE")}.${minor}`;
}

/** A render-ready stat for the tile: a label + its formatted value. */
export interface SalonTileStat {
  label: string;
  value: string;
}

/** The headline tile view-model (AC1): the three at-a-glance figures. */
export interface SalonReportTileViewModel {
  date: string;
  stats: SalonTileStat[];
  /** True when the day has no salon bookings (renders an empty state). */
  isEmpty: boolean;
}

/**
 * Shape the salon report into the headline tile view-model (AC1): bookings,
 * no-shows, and revenue as render-ready label/value pairs. Pure + framework-free
 * so it unit-tests without React — and so the operational dashboard (Epic 27) can
 * reuse the exact tile shaping.
 */
export function salonReportTileViewModel(report: SalonDayReportDto): SalonReportTileViewModel {
  return {
    date: report.date,
    isEmpty: report.bookings === 0,
    stats: [
      { label: "Bookings", value: report.bookings.toLocaleString("en-KE") },
      { label: "No-shows", value: report.noShows.toLocaleString("en-KE") },
      { label: "Revenue", value: formatSalonRevenue(report.revenueCents) },
    ],
  };
}

/** A render-ready per-stylist drill-down row (AC2). */
export interface SalonStylistDrillRow {
  staffId: string;
  staffName: string;
  bookings: string;
  noShows: string;
  revenue: string;
}

/**
 * Shape the per-stylist breakdown into render-ready drill-down rows (AC2). The
 * server already orders the stylists by name; this only formats the figures.
 */
export function salonReportDrillRows(report: SalonDayReportDto): SalonStylistDrillRow[] {
  return report.stylists.map((s) => ({
    staffId: s.staffId,
    staffName: s.staffName,
    bookings: s.bookings.toLocaleString("en-KE"),
    noShows: s.noShows.toLocaleString("en-KE"),
    revenue: formatSalonRevenue(s.revenueCents),
  }));
}

/* --- Daily operations dashboard (P3-E05-S01 / Story 27.1) ---------------- */

/** Today's revenue for one service unit (always present; zero when none). */
export interface OperationsUnitRevenueDto {
  unit: ServiceUnit;
  revenueCents: number;
}

/** Today's revenue: the grand total + the per-unit breakdown (AC1). */
export interface OperationsRevenueDto {
  totalCents: number;
  /** One row per unit, in {@link SERVICE_UNITS} order; sums to {@link totalCents}. */
  byUnit: OperationsUnitRevenueDto[];
}

/** One staff member in the top-staff-today ranking (AC1). */
export interface OperationsTopStaffDto {
  staffId: string;
  staffName: string;
  bookings: number;
  revenueCents: number;
}

/**
 * The daily-operations dashboard API response (P3-E05-S01). The five tile data
 * points (AC1) returned by `GET /admin/operations-dashboard`. Identical shape to
 * `@bm/catalog`'s `OperationsDashboard` (all primitives, serialisable) — this is
 * the wire contract the admin dashboard tiles read.
 */
export interface OperationsDashboardDto {
  /** The report date (`YYYY-MM-DD`). */
  date: string;
  /** Today's revenue: total + per-unit (AC1). */
  revenue: OperationsRevenueDto;
  /** Non-cancelled bookings today (AC1). */
  bookingsCount: number;
  /** In-progress sessions (checked in, not yet out / completed) (AC1). */
  activeSessions: number;
  /** Centre-wide outstanding balance, integer cents (AC1). */
  outstandingCents: number;
  /** Top staff today by attributed revenue (AC1). */
  topStaff: OperationsTopStaffDto[];
}

/** Human label for a service unit, used by the dashboard + drill-down. */
export function serviceUnitLabel(unit: ServiceUnit): string {
  switch (unit) {
    case "play":
      return "Play";
    case "talent":
      return "Talent";
    case "salon":
      return "Salon";
    case "coaching":
      return "Coaching";
    case "event":
      return "Event";
  }
}

/**
 * Drill-down route for a per-unit revenue figure (AC2). The salon unit reuses the
 * existing salon-report surface; every other unit clicks through to the generic
 * per-unit revenue drill-down on the operations dashboard.
 */
export function unitRevenueHref(unit: ServiceUnit): string {
  return unit === "salon" ? "/salon-report" : `/operations/revenue?unit=${unit}`;
}

/** One headline tile: a stable key, a label, a formatted value, and a drill-down. */
export interface OperationsTile {
  key: "revenue" | "bookings" | "activeSessions" | "outstanding" | "topStaff";
  label: string;
  value: string;
  /** Drill-down route the tile's number clicks through to (AC2). */
  href: string;
}

/** A render-ready per-unit revenue row (AC1/AC2). */
export interface OperationsUnitRevenueRow {
  unit: ServiceUnit;
  label: string;
  value: string;
  href: string;
}

/** The dashboard view-model: the five tiles + the per-unit revenue breakdown. */
export interface OperationsDashboardViewModel {
  date: string;
  tiles: OperationsTile[];
  revenueByUnit: OperationsUnitRevenueRow[];
}

/**
 * Shape the operations dashboard into the five headline tiles (AC1) — each
 * carrying the drill-down route its number clicks through to (AC2) — plus the
 * per-unit revenue breakdown. Pure + framework-free so it unit-tests without
 * React and the page renders the identical tiles. Revenue reuses
 * {@link formatSalonRevenue} (the shared KES formatter).
 */
export function operationsDashboardTiles(
  dto: OperationsDashboardDto,
): OperationsDashboardViewModel {
  const top = dto.topStaff[0];
  return {
    date: dto.date,
    tiles: [
      {
        key: "revenue",
        label: "Today's revenue",
        value: formatSalonRevenue(dto.revenue.totalCents),
        href: "/operations/revenue",
      },
      {
        key: "bookings",
        label: "Bookings today",
        value: dto.bookingsCount.toLocaleString("en-KE"),
        href: "/operations/bookings",
      },
      {
        key: "activeSessions",
        label: "Active sessions",
        value: dto.activeSessions.toLocaleString("en-KE"),
        href: "/reception/attendance",
      },
      {
        key: "outstanding",
        label: "Outstanding balances",
        value: formatSalonRevenue(dto.outstandingCents),
        href: "/treasury/reconciliation",
      },
      {
        key: "topStaff",
        label: "Top staff today",
        value: top ? top.staffName : "—",
        href: "/staff-earnings",
      },
    ],
    revenueByUnit: dto.revenue.byUnit.map((u) => ({
      unit: u.unit,
      label: serviceUnitLabel(u.unit),
      value: formatSalonRevenue(u.revenueCents),
      href: unitRevenueHref(u.unit),
    })),
  };
}

/** A render-ready top-staff drill-down row (AC1/AC2). */
export interface OperationsTopStaffRow {
  staffId: string;
  staffName: string;
  bookings: string;
  revenue: string;
  /** Drill-down to the staff-earnings surface (AC2). */
  href: string;
}

/** Shape the top-staff ranking into render-ready drill-down rows (AC1/AC2). */
export function operationsTopStaffRows(dto: OperationsDashboardDto): OperationsTopStaffRow[] {
  return dto.topStaff.map((s) => ({
    staffId: s.staffId,
    staffName: s.staffName,
    bookings: s.bookings.toLocaleString("en-KE"),
    revenue: formatSalonRevenue(s.revenueCents),
    href: "/staff-earnings",
  }));
}

/* --- Revenue by unit, by period (P3-E05-S02 / Story 27.2) ----------------- */

/**
 * Revenue-by-period request (Story 27.2 AC1/AC2). The owner picks an inclusive
 * date range (`YYYY-MM-DD`); the report returns the per-unit NET revenue series
 * over `[fromDate, toDate]` plus the period-over-period delta, and the CSV export
 * uses the SAME filter (AC2). Both bounds are validated calendar dates and
 * `fromDate <= toDate`. Reuses the shared {@link exportDateSchema}.
 */
export const revenueByPeriodQuerySchema = z
  .object({
    fromDate: exportDateSchema,
    toDate: exportDateSchema,
  })
  .refine((v) => v.fromDate <= v.toDate, {
    message: "fromDate must be on or before toDate",
    path: ["toDate"],
  });
export type RevenueByPeriodQuery = z.infer<typeof revenueByPeriodQuerySchema>;

/** Net revenue for one unit over the selected period (always present). */
export interface RevenueByPeriodUnitDto {
  unit: ServiceUnit;
  revenueCents: number;
}

/** Period-over-period delta for one unit (this period − previous). */
export interface RevenueByPeriodDeltaDto {
  unit: ServiceUnit;
  deltaCents: number;
}

/**
 * The revenue-by-unit-by-period API response (Story 27.2). NET revenue per unit
 * for the selected period (refunds excluded, AC3), the preceding equal-length
 * period, and the delta — per unit + total. Identical shape to `@bm/catalog`'s
 * `RevenueByPeriod` (all primitives, serialisable).
 */
export interface RevenueByPeriodDto {
  from: string;
  to: string;
  /** This period's net revenue per unit (chart series), in SERVICE_UNITS order. */
  byUnit: RevenueByPeriodUnitDto[];
  totalCents: number;
  /** The preceding equal-length period's net revenue per unit. */
  previousByUnit: RevenueByPeriodUnitDto[];
  previousTotalCents: number;
  /** Per-unit delta (this − previous), in SERVICE_UNITS order. */
  deltaByUnit: RevenueByPeriodDeltaDto[];
  totalDeltaCents: number;
}

/** Header columns of the revenue-by-period CSV export, in order (AC2). */
export const REVENUE_BY_PERIOD_EXPORT_COLUMNS = [
  "unit",
  "revenue_kes",
  "previous_revenue_kes",
  "delta_kes",
] as const;

/**
 * Render the report as an RFC-4180 CSV using the same date-range filter (AC2/AC3):
 * a header row, then one NET-revenue row per unit (current, previous, delta as KES
 * decimals), then a closing `Total` row. Refunds are already excluded upstream so
 * every figure is net. Lines are CRLF-joined with a trailing CRLF.
 */
export function revenueByPeriodToCsv(report: RevenueByPeriodDto): string {
  const prevByUnit = new Map(report.previousByUnit.map((u) => [u.unit, u.revenueCents]));
  const deltaByUnit = new Map(report.deltaByUnit.map((u) => [u.unit, u.deltaCents]));
  const lines: string[] = [REVENUE_BY_PERIOD_EXPORT_COLUMNS.join(",")];
  for (const u of report.byUnit) {
    lines.push(
      [
        csvField(serviceUnitLabel(u.unit)),
        centsToKes(u.revenueCents),
        centsToKes(prevByUnit.get(u.unit) ?? 0),
        centsToKes(deltaByUnit.get(u.unit) ?? 0),
      ].join(","),
    );
  }
  lines.push(
    [
      "Total",
      centsToKes(report.totalCents),
      centsToKes(report.previousTotalCents),
      centsToKes(report.totalDeltaCents),
    ].join(","),
  );
  return lines.join("\r\n") + "\r\n";
}

/** Up / down / flat — drives the delta arrow + colour on the chart legend. */
export type RevenueDeltaDirection = "up" | "down" | "flat";

/** Format a signed delta as a KES decimal with an explicit + / − sign. */
function formatDelta(cents: number): string {
  if (cents === 0) return "KES 0.00";
  const sign = cents > 0 ? "+" : "-";
  return `${sign}${formatSalonRevenue(Math.abs(cents))}`;
}

function deltaDirection(cents: number): RevenueDeltaDirection {
  return cents > 0 ? "up" : cents < 0 ? "down" : "flat";
}

/** One chart-series point: a unit with its formatted value + delta (AC1). */
export interface RevenueSeriesPoint {
  unit: ServiceUnit;
  label: string;
  /** Formatted net revenue, e.g. `KES 35.00`. */
  value: string;
  /** Raw net revenue cents — for the chart's numeric axis. */
  revenueCents: number;
  /** Formatted period-over-period delta, e.g. `+KES 25.00`. */
  deltaValue: string;
  /** Raw delta cents. */
  deltaCents: number;
  deltaDirection: RevenueDeltaDirection;
}

/** The headline total + its period-over-period delta (AC1). */
export interface RevenueTotalView {
  value: string;
  previousValue: string;
  deltaValue: string;
  deltaCents: number;
  deltaDirection: RevenueDeltaDirection;
}

/** The revenue-by-period view-model: a chart series + the headline total (AC1). */
export interface RevenueByPeriodViewModel {
  from: string;
  to: string;
  series: RevenueSeriesPoint[];
  total: RevenueTotalView;
}

/**
 * Shape the report into the chart series + headline total (Story 27.2 AC1). Pure +
 * framework-free so it unit-tests without React and the admin page renders the
 * identical figures. Every unit is present (zero-filled) so the chart is stable;
 * deltas carry an explicit sign + a direction for the up/down arrow. Revenue reuses
 * {@link formatSalonRevenue} (the shared KES formatter).
 */
export function revenueByPeriodViewModel(report: RevenueByPeriodDto): RevenueByPeriodViewModel {
  const deltaByUnit = new Map(report.deltaByUnit.map((u) => [u.unit, u.deltaCents]));
  return {
    from: report.from,
    to: report.to,
    series: report.byUnit.map((u) => {
      const deltaCents = deltaByUnit.get(u.unit) ?? 0;
      return {
        unit: u.unit,
        label: serviceUnitLabel(u.unit),
        value: formatSalonRevenue(u.revenueCents),
        revenueCents: u.revenueCents,
        deltaValue: formatDelta(deltaCents),
        deltaCents,
        deltaDirection: deltaDirection(deltaCents),
      };
    }),
    total: {
      value: formatSalonRevenue(report.totalCents),
      previousValue: formatSalonRevenue(report.previousTotalCents),
      deltaValue: formatDelta(report.totalDeltaCents),
      deltaCents: report.totalDeltaCents,
      deltaDirection: deltaDirection(report.totalDeltaCents),
    },
  };
}

/** The export endpoint URL carrying the same date-range filter (AC2). */
export function revenueByPeriodExportUrl(values: { fromDate: string; toDate: string }): string {
  const params = new URLSearchParams({ fromDate: values.fromDate, toDate: values.toDate });
  return `/admin/revenue-by-period/export?${params.toString()}`;
}

/** Suggested download filename for the revenue CSV. */
export function revenueByPeriodFilename(values: { fromDate: string; toDate: string }): string {
  return `revenue_by_unit_${values.fromDate}_to_${values.toDate}.csv`;
}

/* --- Daily dispatch report (P4-E04-S04 / Story 29.4) --------------------- */

/**
 * Daily dispatch report request (Story 29.4 AC4). Shop ops pick ONE calendar day
 * (`YYYY-MM-DD`); the report covers the WooCommerce-originated orders for that day.
 * The date is OPTIONAL on the wire — absent means "today" (resolved server-side via
 * {@link resolveDispatchDate}). When present it must be a valid calendar date.
 */
export const dailyDispatchQuerySchema = z.object({
  date: exportDateSchema.optional(),
});
export type DailyDispatchQuery = z.infer<typeof dailyDispatchQuerySchema>;

/** Resolve the report date: the supplied `YYYY-MM-DD`, or today (UTC) when absent (AC4). */
export function resolveDispatchDate(date: string | undefined, now: Date = new Date()): string {
  return date ?? now.toISOString().slice(0, 10);
}

/** The six POS workflow statuses, in canonical ladder order (counts are zero-filled). */
export const DISPATCH_STATUS_ORDER = [
  "new",
  "packing",
  "ready",
  "dispatched",
  "fulfilled",
  "cancelled",
] as const;
export type DispatchReportStatus = (typeof DISPATCH_STATUS_ORDER)[number];

/** One status bucket of the report (always present, zero-filled). */
export interface DispatchStatusCountDto {
  status: DispatchReportStatus;
  count: number;
}

/**
 * The daily dispatch report API response (Story 29.4). Status counts + total value
 * (KES cents) + pack/dispatch averages (whole seconds, null when no order qualifies)
 * + the sync-health (dead-letter) count. Identical shape to `@bm/catalog`'s
 * `DailyDispatchReport` (all primitives, serialisable).
 */
export interface DailyDispatchReportDto {
  date: string;
  countsByStatus: DispatchStatusCountDto[];
  totalOrders: number;
  totalValueCents: number;
  avgPackSeconds: number | null;
  avgDispatchSeconds: number | null;
  syncHealthCount: number;
}

/** Header columns of the daily dispatch CSV export, in order (AC3). */
export const DAILY_DISPATCH_EXPORT_COLUMNS = ["metric", "value"] as const;

/** Human label for a workflow status, capitalised. */
function dispatchStatusLabel(status: DispatchReportStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Whole seconds → minutes with one decimal, e.g. 900 → "15.0"; null → "n/a". */
function secondsToMinutes(seconds: number | null): string {
  if (seconds === null) return "n/a";
  return (seconds / 60).toFixed(1);
}

/**
 * Render the report as an RFC-4180 CSV (AC3): a `metric,value` header, then one row
 * per local_status count, then the total-orders / total-value (KES) / pack-time /
 * dispatch-time rows, and finally the sync-health row. Labels are escaped; lines are
 * CRLF-joined with a trailing CRLF. Null averages render as `n/a`.
 */
export function dailyDispatchToCsv(report: DailyDispatchReportDto): string {
  const lines: string[] = [DAILY_DISPATCH_EXPORT_COLUMNS.join(",")];
  const countByStatus = new Map(report.countsByStatus.map((c) => [c.status, c.count]));
  for (const status of DISPATCH_STATUS_ORDER) {
    lines.push([csvField(dispatchStatusLabel(status)), String(countByStatus.get(status) ?? 0)].join(","));
  }
  lines.push(["Total orders", String(report.totalOrders)].join(","));
  lines.push([csvField("Total value (KES)"), centsToKes(report.totalValueCents)].join(","));
  lines.push([csvField("Average pack time (min)"), secondsToMinutes(report.avgPackSeconds)].join(","));
  lines.push([csvField("Average dispatch time (min)"), secondsToMinutes(report.avgDispatchSeconds)].join(","));
  lines.push([csvField("Sync health: stuck writebacks"), String(report.syncHealthCount)].join(","));
  return lines.join("\r\n") + "\r\n";
}

/** The 29.7 dead-letter admin view the sync-health row links to (AC5). */
export const DISPATCH_DEAD_LETTER_HREF = "/woocommerce-sync";

/** One row of the status-count table. */
export interface DispatchStatusRow {
  status: DispatchReportStatus;
  label: string;
  count: number;
}

/** The sync-health row: the stuck-writeback count + the dead-letter view link (AC5). */
export interface DispatchSyncHealth {
  count: number;
  href: string;
}

/** The daily dispatch view-model: the status table + formatted headline figures (AC2/AC5). */
export interface DailyDispatchViewModel {
  date: string;
  rows: DispatchStatusRow[];
  totalOrders: number;
  /** Formatted total value, e.g. `KES 1234.56`. */
  totalValue: string;
  /** Formatted average pack time, e.g. `15.0 min` / `n/a`. */
  avgPack: string;
  /** Formatted average dispatch time, e.g. `20.0 min` / `n/a`. */
  avgDispatch: string;
  syncHealth: DispatchSyncHealth;
}

/**
 * Shape the report into the status table + headline figures (Story 29.4 AC2/AC5).
 * Pure + framework-free so it unit-tests without React and the admin page renders
 * the identical figures. Every status is present; averages render as minutes (one
 * decimal) or `n/a`; the sync-health row carries the dead-letter view link.
 */
export function dailyDispatchViewModel(report: DailyDispatchReportDto): DailyDispatchViewModel {
  const countByStatus = new Map(report.countsByStatus.map((c) => [c.status, c.count]));
  const fmtAvg = (s: number | null) => (s === null ? "n/a" : `${secondsToMinutes(s)} min`);
  return {
    date: report.date,
    rows: DISPATCH_STATUS_ORDER.map((status) => ({
      status,
      label: dispatchStatusLabel(status),
      count: countByStatus.get(status) ?? 0,
    })),
    totalOrders: report.totalOrders,
    totalValue: `KES ${centsToKes(report.totalValueCents)}`,
    avgPack: fmtAvg(report.avgPackSeconds),
    avgDispatch: fmtAvg(report.avgDispatchSeconds),
    syncHealth: { count: report.syncHealthCount, href: DISPATCH_DEAD_LETTER_HREF },
  };
}

/** The export endpoint URL carrying the date filter (AC3/AC4). */
export function dailyDispatchExportUrl(values: { date: string }): string {
  const params = new URLSearchParams({ date: values.date });
  return `/admin/daily-dispatch/export?${params.toString()}`;
}

/** Suggested download filename for the dispatch CSV. */
export function dailyDispatchFilename(values: { date: string }): string {
  return `daily_dispatch_${values.date}.csv`;
}

/* --- Top-staff leaderboard (P3-E05-S03 / Story 27.3) --------------------- */

/** Human label for a staff attribution role, used by the leaderboard surface. */
export function attributionRoleLabel(role: AttributionRole): string {
  switch (role) {
    case "stylist":
      return "Stylist";
    case "instructor":
      return "Instructor";
    case "attendant":
      return "Attendant";
    case "coach":
      return "Coach";
    case "event_staff":
      return "Event staff";
  }
}

/**
 * Top-staff-leaderboard request (Story 27.3 AC1/AC2). The admin picks an inclusive
 * date range (`YYYY-MM-DD`) and, optionally, a single attribution role to filter
 * the roster by (AC2). Both bounds are validated calendar dates with
 * `fromDate <= toDate`. An empty/absent role string means "all roles" (no filter).
 * Reuses the shared {@link exportDateSchema}.
 */
export const staffLeaderboardQuerySchema = z
  .object({
    fromDate: exportDateSchema,
    toDate: exportDateSchema,
    role: z
      .union([z.enum(ATTRIBUTION_ROLES), z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? undefined : v)),
  })
  .refine((v) => v.fromDate <= v.toDate, {
    message: "fromDate must be on or before toDate",
    path: ["toDate"],
  });
export type StaffLeaderboardQuery = z.infer<typeof staffLeaderboardQuerySchema>;

/** One staff member's leaderboard slice over the period (AC1). */
export interface StaffLeaderboardRowDto {
  staffId: string;
  staffName: string;
  role: AttributionRole;
  /** Total attributed revenue (cents) over the period. */
  revenueCents: number;
  /** Count of services performed. */
  serviceCount: number;
  /** Average ticket (revenue ÷ service count), integer cents; 0 when no services. */
  avgTicketCents: number;
}

/**
 * The top-staff-leaderboard API response (Story 27.3). Per-staff revenue, service
 * count, and average ticket over the selected period, ranked by revenue (AC1).
 * Identical shape to `@bm/catalog`'s `StaffLeaderboard` (all primitives,
 * serialisable).
 */
export interface StaffLeaderboardDto {
  from: string;
  to: string;
  rows: StaffLeaderboardRowDto[];
}

/** A staff member's commission totals over the period (drill-down, AC3). */
export interface StaffCommissionTotalsDto {
  netCents: number;
  accruedCents: number;
  reversedCents: number;
  entryCount: number;
}

/** The per-staff commission drill-down API response (Story 27.3 AC3). */
export interface StaffCommissionDrilldownDto {
  staffId: string;
  staffName: string;
  role: AttributionRole;
  from: string;
  to: string;
  totals: StaffCommissionTotalsDto;
}

/** A render-ready leaderboard row: formatted metrics + the drill-down href (AC1/AC3). */
export interface StaffLeaderboardRow {
  staffId: string;
  staffName: string;
  roleLabel: string;
  revenue: string;
  serviceCount: string;
  avgTicket: string;
  /** Drill-down to this staff member's commission totals for the same period (AC3). */
  href: string;
}

/** The per-staff commission drill-down link for the same period (AC3). */
export function staffCommissionDrilldownHref(
  staffId: string,
  range: { from: string; to: string },
): string {
  const params = new URLSearchParams({ fromDate: range.from, toDate: range.to });
  return `/operations/leaderboard/${encodeURIComponent(staffId)}?${params.toString()}`;
}

/**
 * Shape the leaderboard into render-ready rows in server (ranked) order (AC1/AC3).
 * Pure + framework-free so it unit-tests without React and the admin page renders
 * the identical figures. Revenue + average ticket reuse {@link formatSalonRevenue}
 * (the shared KES formatter); each row carries a drill-down href to its commission
 * totals over the same period (AC3).
 */
export function staffLeaderboardRows(dto: StaffLeaderboardDto): StaffLeaderboardRow[] {
  return dto.rows.map((r) => ({
    staffId: r.staffId,
    staffName: r.staffName,
    roleLabel: attributionRoleLabel(r.role),
    revenue: formatSalonRevenue(r.revenueCents),
    serviceCount: r.serviceCount.toLocaleString("en-KE"),
    avgTicket: formatSalonRevenue(r.avgTicketCents),
    href: staffCommissionDrilldownHref(r.staffId, { from: dto.from, to: dto.to }),
  }));
}

/** One option in the role-filter control (AC2). */
export interface StaffLeaderboardRoleOption {
  /** Empty string = "all roles" (no filter); otherwise an attribution role. */
  value: "" | AttributionRole;
  label: string;
}

/** The role-filter options: an "all roles" entry then every attribution role (AC2). */
export function staffLeaderboardRoleOptions(): StaffLeaderboardRoleOption[] {
  return [
    { value: "", label: "All roles" },
    ...ATTRIBUTION_ROLES.map((role) => ({ value: role, label: attributionRoleLabel(role) })),
  ];
}

/** The per-staff commission drill-down view-model: formatted totals (AC3). */
export interface StaffCommissionDrilldownView {
  staffId: string;
  staffName: string;
  roleLabel: string;
  from: string;
  to: string;
  netCommission: string;
  accruedCommission: string;
  reversedCommission: string;
  entryCount: number;
}

/** Shape the per-staff commission drill-down into formatted totals (AC3). Pure. */
export function staffCommissionDrilldownView(
  dto: StaffCommissionDrilldownDto,
): StaffCommissionDrilldownView {
  return {
    staffId: dto.staffId,
    staffName: dto.staffName,
    roleLabel: attributionRoleLabel(dto.role),
    from: dto.from,
    to: dto.to,
    netCommission: formatSalonRevenue(dto.totals.netCents),
    accruedCommission: formatSalonRevenue(dto.totals.accruedCents),
    reversedCommission: formatSalonRevenue(dto.totals.reversedCents),
    entryCount: dto.totals.entryCount,
  };
}

/* --- Staff data records (P1-E07-S03) ------------------------------------- */

/** Max length of a staff display name. */
export const STAFF_NAME_MAX = 120;

/**
 * Staff role enum (P1-E07-S03 AC1). REUSES the {@link ATTRIBUTION_ROLES}
 * taxonomy so a staff member's role aligns 1:1 with the attribution role a
 * service may require (P1-E07-S02). These are NOT system RBAC roles.
 */
export const STAFF_ROLES = ATTRIBUTION_ROLES;
export type StaffRole = AttributionRole;

/**
 * Create a staff member (P1-E07-S03 AC1/AC2). Required: a non-empty display name
 * and a role from the constrained taxonomy. Staff are created active; there is NO
 * auth association (no PIN, no phone). Commission rate is out of scope (P3-E01).
 */
export const staffCreateSchema = z.object({
  displayName: z.string().trim().min(1, "Name is required").max(STAFF_NAME_MAX),
  role: z.enum(STAFF_ROLES, { message: `role must be one of: ${STAFF_ROLES.join(", ")}` }),
});
export type StaffCreateInput = z.infer<typeof staffCreateSchema>;

/**
 * Update a staff member (P1-E07-S03 AC2/AC4). All fields optional (partial
 * patch). `active` toggles soft-retirement (the API stamps/clears
 * `terminatedAt`). A rename mutates only the live row — past attributions keep
 * their name-at-time snapshot (AC4). At least one field must be present.
 */
export const staffUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1, "Name is required").max(STAFF_NAME_MAX).optional(),
    role: z.enum(STAFF_ROLES, { message: `role must be one of: ${STAFF_ROLES.join(", ")}` }).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (v) => v.displayName !== undefined || v.role !== undefined || v.active !== undefined,
    "at least one field is required",
  );
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;

/** RFC-4180 escape: quote a field if it has a comma, quote, CR or LF. */
function csvField(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value;
}

/**
 * Render the export rows as an RFC-4180 CSV (AC1/AC2): a header row of
 * {@link RECONCILIATION_EXPORT_COLUMNS} followed by one line per row, amounts as
 * KES decimal strings. Rows are emitted in caller order; lines are CRLF-joined.
 */
export function reconciliationRowsToCsv(rows: readonly ReconciliationExportRow[]): string {
  const lines: string[] = [RECONCILIATION_EXPORT_COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.date,
        csvField(r.account),
        centsToKes(r.systemCents),
        centsToKes(r.realCents),
        centsToKes(r.driftCents),
        centsToKes(r.adjustmentsCents),
      ].join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// SMS provider config (P1-E09-S02)
// ---------------------------------------------------------------------------

/** Max length of a registered sender ID (alphanumeric IDs are ≤11; allow headroom). */
export const SMS_SENDER_ID_MAX = 32;
/** Max length of the api_key_ref env-var NAME. */
export const SMS_API_KEY_REF_MAX = 128;

/**
 * Valid env-var / secret-reference NAME for the API key (AC1/AC2). This is the
 * NAME of the variable that holds the key at runtime — never the key itself —
 * so it is constrained to a conventional env-var token (letters, digits,
 * underscore; not starting with a digit). This shape check also stops a caller
 * accidentally pasting a literal secret into the ref field.
 */
const apiKeyRefSchema = z
  .string()
  .trim()
  .min(1, "An API key reference (env var name) is required")
  .max(SMS_API_KEY_REF_MAX)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/u, "API key reference must be an env var name (e.g. SMS_API_KEY)");

/**
 * Provider URL shape gate (AC3, part 1): a syntactically valid HTTPS URL. The
 * SSRF host check (RFC1918 / loopback / link-local / metadata) lives in
 * `@bm/sms` `checkProviderUrlSafety` and is applied by the API route as a second
 * gate — kept out of `@bm/contracts` so this package stays dependency-light.
 */
const providerUrlSchema = z
  .string()
  .trim()
  .min(1, "API URL is required")
  .refine((v) => {
    try {
      return new URL(v).protocol === "https:";
    } catch {
      return false;
    }
  }, "API URL must be a valid HTTPS URL");

/** Create an SMS provider config (AC1). Always created inactive unless `isActive`. */
export const smsConfigCreateSchema = z.object({
  senderId: z.string().trim().min(1, "Sender ID is required").max(SMS_SENDER_ID_MAX),
  apiUrl: providerUrlSchema,
  apiKeyRef: apiKeyRefSchema,
  isActive: z.boolean().optional(),
});
export type SmsConfigCreateInput = z.infer<typeof smsConfigCreateSchema>;

/**
 * Update an SMS provider config (AC1). Partial patch; at least one field must be
 * present. `isActive` toggles the single-active row (AC4). The raw API key is
 * never accepted or returned — only the env-var reference.
 */
export const smsConfigUpdateSchema = z
  .object({
    senderId: z.string().trim().min(1, "Sender ID is required").max(SMS_SENDER_ID_MAX).optional(),
    apiUrl: providerUrlSchema.optional(),
    apiKeyRef: apiKeyRefSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.senderId !== undefined ||
      v.apiUrl !== undefined ||
      v.apiKeyRef !== undefined ||
      v.isActive !== undefined,
    "at least one field is required",
  );
export type SmsConfigUpdateInput = z.infer<typeof smsConfigUpdateSchema>;

/** Public (secret-free) shape of an sms_config row returned by the API (AC2). */
export interface SmsConfigPublic {
  id: string;
  senderId: string;
  apiUrl: string;
  /** Env-var NAME holding the key — never the key value. */
  apiKeyRef: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Public shape of a registered SMS template (P1-E09-S03). The admin read-only
 * view (AC3) consumes this. `body` carries `{placeholder}` tokens; `version` +
 * `isActive` expose the versioning so an operator can see what is live.
 */
export interface SmsTemplatePublic {
  id: string;
  key: string;
  language: string;
  version: number;
  body: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/* --- Staff login users (P1-E10-S02) -------------------------------------- */

/**
 * System staff login roles (P1-E10-S02). These are the RBAC roles a staff
 * LOGIN user may hold — every role in the `@bm/auth` taxonomy EXCEPT `parent`
 * (parents are not created from the admin console). Mirrored here (rather than
 * imported from `@bm/auth`, which pulls the native argon2 binding into the Next
 * bundle) — kept in lockstep with `@bm/auth.STAFF_ROLES` by the contracts test.
 *
 * NOTE: distinct from {@link STAFF_ROLES} (the attribution-role taxonomy for
 * booking *data records*, P1-E07-S03). These are auth/RBAC roles for *logins*.
 */
export const SYSTEM_STAFF_ROLES = [
  "reception",
  "cashier",
  "packer",
  "accountant",
  "treasury",
  "admin",
  "super_admin",
] as const;
export type SystemStaffRole = (typeof SYSTEM_STAFF_ROLES)[number];

/** True when `value` is a creatable staff login role. */
export function isSystemStaffRole(value: unknown): value is SystemStaffRole {
  return typeof value === "string" && (SYSTEM_STAFF_ROLES as readonly string[]).includes(value);
}

const systemStaffRoleSchema = z.enum(SYSTEM_STAFF_ROLES, {
  message: `role must be one of: ${SYSTEM_STAFF_ROLES.join(", ")}`,
});

/** Optional 4-digit initial/reset PIN. When omitted the API auto-generates one. */
const optionalPinSchema = z
  .string()
  .regex(/^\d{4}$/u, "PIN must be 4 digits")
  .optional();

/**
 * Create a staff login user (P1-E10-S02 AC1). Phone (a valid KE mobile — the API
 * normalises it), a system staff role, and an optional initial PIN (auto-
 * generated + returned once for the super-admin when omitted). No `parent` role.
 */
export const adminUserCreateSchema = z.object({
  phone: z.string().min(1, "Phone is required"),
  role: systemStaffRoleSchema,
  pin: optionalPinSchema,
});
export type AdminUserCreateInput = z.infer<typeof adminUserCreateSchema>;

/**
 * Edit a staff login user (P1-E10-S02 AC2). All fields optional (partial patch):
 * change `role` (which invalidates the user's sessions, 1-6 AC4) and/or toggle
 * `active` (soft deactivate/reactivate; deactivation also invalidates sessions).
 * At least one field must be present.
 */
export const adminUserUpdateSchema = z
  .object({
    role: systemStaffRoleSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (v) => v.role !== undefined || v.active !== undefined,
    "at least one field is required",
  );
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;

/** Public shape of a staff login user — never includes the PIN hash (AC: no leakage). */
export interface AdminUserPublic {
  id: string;
  phone: string;
  role: SystemStaffRole;
  active: boolean;
  deactivatedAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Audit log viewer (P1-E10-S03)
// ---------------------------------------------------------------------------

/** Default page size for the audit-log list endpoint. */
export const AUDIT_LOG_DEFAULT_LIMIT = 50;
/** Hard upper bound on a single audit-log page (protects the query + payload). */
export const AUDIT_LOG_MAX_LIMIT = 200;

/** Coerce a query-string scalar (string | string[] | undefined) to a trimmed string. */
function firstQueryValue(raw: unknown): string | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

const auditLimitSchema = z.coerce
  .number()
  .int("limit must be an integer")
  .min(1, "limit must be at least 1")
  .max(AUDIT_LOG_MAX_LIMIT, `limit may not exceed ${AUDIT_LOG_MAX_LIMIT}`)
  .default(AUDIT_LOG_DEFAULT_LIMIT);

const auditOffsetSchema = z.coerce
  .number()
  .int("offset must be an integer")
  .min(0, "offset must be at least 0")
  .default(0);

/**
 * Filters for the read-only audit-log query (AC1). Every field is optional — an
 * empty query lists the most-recent events. `actor` is a user id; `action` is a
 * dotted action name (exact match); `targetId` matches the audited record id;
 * `fromDate`/`toDate` bound the event time (inclusive, by calendar day, UTC).
 * Pagination (AC2) via `limit`/`offset`. Unknown keys are dropped.
 */
export const auditLogQuerySchema = z
  .object({
    actor: z.preprocess(firstQueryValue, z.string().uuid("actor must be a user id").optional()),
    action: z.preprocess(firstQueryValue, z.string().max(200).optional()),
    targetId: z.preprocess(firstQueryValue, z.string().max(200).optional()),
    fromDate: z.preprocess(firstQueryValue, exportDateSchema.optional()),
    toDate: z.preprocess(firstQueryValue, exportDateSchema.optional()),
    limit: z.preprocess((v) => (firstQueryValue(v) ?? undefined), auditLimitSchema),
    offset: z.preprocess((v) => (firstQueryValue(v) ?? undefined), auditOffsetSchema),
  })
  .refine((v) => v.fromDate === undefined || v.toDate === undefined || v.fromDate <= v.toDate, {
    message: "fromDate must be on or before toDate",
    path: ["toDate"],
  });
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

/** One audit event as returned to the viewer (read-only projection of the row). */
export interface AuditLogEvent {
  id: string;
  actorUserId: string | null;
  action: string;
  targetTable: string | null;
  targetId: string | null;
  createdAt: string;
}

/** Header columns of the audit-log CSV export, in order (AC2). */
export const AUDIT_LOG_EXPORT_COLUMNS = [
  "time",
  "actor",
  "action",
  "target_table",
  "target_id",
] as const;

/**
 * Render audit events as an RFC-4180 CSV (AC2): a header row of
 * {@link AUDIT_LOG_EXPORT_COLUMNS} followed by one line per event. Rows are
 * emitted in caller order (newest-first); lines are CRLF-joined and the file
 * ends with a trailing CRLF, mirroring the reconciliation export.
 */
export function auditLogEventsToCsv(events: readonly AuditLogEvent[]): string {
  const lines: string[] = [AUDIT_LOG_EXPORT_COLUMNS.join(",")];
  for (const e of events) {
    lines.push(
      [
        e.createdAt,
        csvField(e.actorUserId ?? ""),
        csvField(e.action),
        csvField(e.targetTable ?? ""),
        csvField(e.targetId ?? ""),
      ].join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

/* ------------------------------------------------- settings sub-app (P1-E10-S04) */

/**
 * General app-setting section keys backed by the generic `settings` key/value
 * table (P1-E10-S04). Sections with a dedicated table of their own — SMS
 * provider config and float accounts — are NOT listed here; the Settings area
 * links to those existing surfaces instead of storing them.
 */
export const SETTING_KEYS = ["loyalty", "branding", "receipt_branding", "etims"] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/** Narrow an arbitrary string to a known general-settings section key. */
export function isSettingKey(value: string): value is SettingKey {
  return (SETTING_KEYS as readonly string[]).includes(value);
}

/** Hex colour (3- or 6-digit, leading #) used by branding sections. */
export const hexColourSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/u, "Must be a hex colour like #1a2b3c");

/**
 * Loyalty rates (AC1). `earnRatePer100` = loyalty points earned per KES 100
 * spent; `redeemValuePerPoint` = KES value of one point at redemption. Both
 * non-negative; redemption capped at 100% so a point can never be worth more
 * than face value here.
 */
export const loyaltySettingsSchema = z.object({
  earnRatePer100: z.number().min(0, "Earn rate must be ≥ 0").max(1000),
  redeemValuePerPoint: z.number().min(0, "Redeem value must be ≥ 0").max(100),
});
export type LoyaltySettings = z.infer<typeof loyaltySettingsSchema>;

/** Branding: store name + logo URL + primary/secondary colours (AC1). */
export const brandingSettingsSchema = z.object({
  storeName: z.string().trim().min(1, "Store name is required").max(120),
  logoUrl: z.string().trim().url("Logo must be a valid URL").max(2048).optional(),
  primaryColour: hexColourSchema,
  secondaryColour: hexColourSchema.optional(),
});
export type BrandingSettings = z.infer<typeof brandingSettingsSchema>;

/** Receipt branding: header/footer lines + whether to show the logo (AC1). */
export const receiptBrandingSettingsSchema = z.object({
  headerLine: z.string().trim().max(120).optional(),
  footerLine: z.string().trim().max(240).optional(),
  showLogo: z.boolean(),
});
export type ReceiptBrandingSettings = z.infer<typeof receiptBrandingSettingsSchema>;

/**
 * eTIMS (KRA) settings (P5-E02). `enabled` is the runtime writer-swap flag
 * (P5-E02-S03): OFF (default) keeps the LocalReceiptWriter, ON selects the live
 * EtimsReceiptWriter. The tax-registration metadata (P5-E02-S04) — the company
 * KRA PIN, VAT registration number and registered address — is recorded once
 * here and printed in the receipt footer block. All metadata fields are optional
 * (an unregistered business leaves them blank) and trimmed.
 */
export const etimsSettingsSchema = z.object({
  enabled: z.boolean(),
  pin: z.string().trim().max(20).optional(),
  vatRegistrationNumber: z.string().trim().max(40).optional(),
  registeredAddress: z.string().trim().max(240).optional(),
});
export type EtimsSettings = z.infer<typeof etimsSettingsSchema>;

/** Per-key validator map: each general settings section to its payload schema. */
export const SETTING_SCHEMAS = {
  loyalty: loyaltySettingsSchema,
  branding: brandingSettingsSchema,
  receipt_branding: receiptBrandingSettingsSchema,
  etims: etimsSettingsSchema,
} as const satisfies Record<SettingKey, z.ZodTypeAny>;

/** Default payload for a general settings section before an admin first saves it. */
export const SETTING_DEFAULTS: { [K in SettingKey]: z.infer<(typeof SETTING_SCHEMAS)[K]> } = {
  loyalty: { earnRatePer100: 0, redeemValuePerPoint: 0 },
  branding: { storeName: "Baby Milestones", primaryColour: "#000000" },
  receipt_branding: { showLogo: false },
  etims: { enabled: false },
};

/**
 * Validate a setting payload against the schema for `key`. Returns the parsed
 * (typed) value or the first issue's message — the API maps this onto a 400.
 */
export function parseSettingValue(
  key: SettingKey,
  value: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string; field?: string } {
  const parsed = SETTING_SCHEMAS[key].safeParse(value ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? "Invalid input", field: first?.path[0] as string };
  }
  return { ok: true, value: parsed.data as Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// Loyalty Engine: clawback + negative carry (P3-E04)
// ---------------------------------------------------------------------------

/** Loyalty ledger entry kinds (mirrors the DB CHECK on loyalty_ledger.kind). */
export const LOYALTY_KINDS = ["earn", "redeem", "clawback", "adjustment"] as const;
export type LoyaltyKind = (typeof LOYALTY_KINDS)[number];

/** Bounds for a single manual loyalty adjustment (integer points, ± goodwill). */
export const LOYALTY_ADJUST_MIN_POINTS = -1_000_000;
export const LOYALTY_ADJUST_MAX_POINTS = 1_000_000;
export const LOYALTY_ADJUST_REASON_MAX = 280;

/**
 * Proportional loyalty clawback on refund (P3-E04-S01 AC1). Of the points
 * originally earned on a transaction, claw back the fraction that was refunded:
 * `round(earnedPoints × refundedMinor / originalMinor)`, clamped to
 * `[0, earnedPoints]`.
 *
 * Pure integer arithmetic — no floating point, so no drift at any scale. The
 * round-half-up is computed from the integer quotient + remainder rather than
 * `Math.round(a/b)`, which would re-introduce float error for large operands.
 */
export function loyaltyClawbackPoints(
  earnedPoints: number,
  refundedMinor: number,
  originalMinor: number,
): number {
  if (earnedPoints <= 0 || refundedMinor <= 0 || originalMinor <= 0) return 0;
  const numerator = earnedPoints * refundedMinor;
  const quotient = Math.floor(numerator / originalMinor);
  const remainder = numerator - quotient * originalMinor;
  const rounded = 2 * remainder >= originalMinor ? quotient + 1 : quotient;
  if (rounded <= 0) return 0;
  if (rounded >= earnedPoints) return earnedPoints;
  return rounded;
}

/**
 * Split a fresh earn against a (possibly negative) running balance (P3-E04-S02
 * AC1/AC2). Future earnings repay any negative carry FIRST; only the remainder
 * is spendable. Returns the portion applied to the carry and the spendable
 * remainder. All integer points.
 *
 * Example: balance −80, earn 100 → { appliedToCarry: 80, spendable: 20 }.
 *          balance  10, earn 100 → { appliedToCarry: 0,  spendable: 100 }.
 */
export function splitEarnAgainstCarry(
  balance: number,
  earnedPoints: number,
): { appliedToCarry: number; spendable: number } {
  if (earnedPoints <= 0) return { appliedToCarry: 0, spendable: 0 };
  if (balance >= 0) return { appliedToCarry: 0, spendable: earnedPoints };
  const deficit = -balance;
  const appliedToCarry = Math.min(deficit, earnedPoints);
  return { appliedToCarry, spendable: earnedPoints - appliedToCarry };
}

/**
 * Points a parent may actually redeem (P3-E04-S04 AC1): the raw balance minus
 * any points pending clawback (a refund initiated but not yet finalised).
 * Never negative — a fully-eroded balance redeems 0.
 */
export function availableToRedeem(balance: number, pendingClawback: number): number {
  const available = balance - Math.max(0, pendingClawback);
  return available > 0 ? available : 0;
}

/**
 * Total points still provisionally pending clawback for a parent (P3-E04-S04):
 * the sum of `pending_clawback` over the parent's earn rows. Negative entries
 * are ignored (a settled/never-pending row carries 0). Pure integer reducer —
 * the redemption surface subtracts this from the balance (see
 * {@link availableToRedeem}).
 */
export function sumPendingClawback(
  rows: ReadonlyArray<{ pendingClawback: number }>,
): number {
  let total = 0;
  for (const r of rows) {
    if (r.pendingClawback > 0) total += r.pendingClawback;
  }
  return total;
}

/** Direction of an admin manual loyalty adjustment (P3-E04-S03). */
export type LoyaltyAdjustmentDirection = "credit" | "debit";

/** Input to {@link loyaltyAdjustmentDelta}. */
export interface LoyaltyAdjustmentDeltaInput {
  amount: number;
  direction: LoyaltyAdjustmentDirection;
}

/**
 * Signed points delta for an admin manual loyalty adjustment (P3-E04-S03): a
 * positive `amount` credited or debited per `direction`. `amount` must be a
 * positive integer (no fractional points); a credit yields `+amount`, a debit
 * `-amount`. Throws on a non-positive or fractional amount.
 */
export function loyaltyAdjustmentDelta(input: LoyaltyAdjustmentDeltaInput): number {
  const { amount, direction } = input;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("loyaltyAdjustmentDelta: amount must be a positive integer");
  }
  return direction === "debit" ? -amount : amount;
}

/**
 * Admin manual loyalty adjustment (P3-E04-S03 AC1/AC2). A signed integer points
 * delta (+ credit / − debit) plus a required free-text reason. `parentId` comes
 * from the route, never the body. The acting admin is the session user.
 */
export const loyaltyAdjustSchema = z.object({
  points: z
    .number({ message: "Points is required" })
    .int("points must be an integer")
    .min(LOYALTY_ADJUST_MIN_POINTS, "points adjustment is too large")
    .max(LOYALTY_ADJUST_MAX_POINTS, "points adjustment is too large")
    .refine((v) => v !== 0, "points adjustment cannot be zero"),
  reason: z
    .string()
    .trim()
    .min(1, "A reason is required")
    .max(LOYALTY_ADJUST_REASON_MAX, `Reason must be ${LOYALTY_ADJUST_REASON_MAX} characters or fewer`),
});
export type LoyaltyAdjustInput = z.infer<typeof loyaltyAdjustSchema>;

// ---------------------------------------------------------------------------
// WhatsApp deep-link + UTM acquisition attribution (P1-E12-S03)
// ---------------------------------------------------------------------------
export * from "./utm.js";

// ---------------------------------------------------------------------------
// POS pricing math (P2-E04) — shared by the API (authoritative) + the POS cart
// ---------------------------------------------------------------------------
export * from "./pricing.js";

// ---------------------------------------------------------------------------
// WooCommerce REST payload + credential-config contracts (P4-E04-S06 / 29.6)
// ---------------------------------------------------------------------------
export * from "./woocommerce.js";

// ---------------------------------------------------------------------------
// POS "Online orders" view-model — local mirror → cards (P4-E04-S01 / 29.1)
// ---------------------------------------------------------------------------
export * from "./woocommerce-orders.js";

// ---------------------------------------------------------------------------
// Packing-slip view-model — local mirror → printable slip (P4-E04-S03 / 29.3)
// ---------------------------------------------------------------------------
export * from "./packing-slip.js";

// ---------------------------------------------------------------------------
// POS order-status transition state machine + local→Woo mapping (P4-E04-S02 / 29.2)
// ---------------------------------------------------------------------------
export * from "./order-transitions.js";

// ---------------------------------------------------------------------------
// POS payment / sale (P2-E04-S04)
// ---------------------------------------------------------------------------

/** The four POS payment methods (AC1). */
export const POS_SALE_METHODS = ["cash", "mpesa", "paystack", "wallet"] as const;
export type PosSaleMethod = (typeof POS_SALE_METHODS)[number];

/** Receipt series for in-store POS sales. */
export const POS_RECEIPT_SERIES = "POS-2026";

/** Overall-discount wire schema (mirrors the {@link OverallDiscount} union). */
export const overallDiscountSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("pct"), value: z.number().min(0).max(100) }),
  z.object({ kind: z.literal("kes"), valueCents: z.number().int().min(0) }),
]);

/** One requested sale line — product id + quantity + per-line discount %. */
export const posSaleLineSchema = z.object({
  productId: z.string().uuid("Invalid product id"),
  qty: z.number().int().positive("Quantity must be at least 1").max(1000, "Quantity is too large"),
  lineDiscountPct: z.number().min(0).max(100).default(0),
});
export type PosSaleLineInput = z.infer<typeof posSaleLineSchema>;

/**
 * Create-sale request (P2-E04-S04). The server recomputes all money from the DB
 * product prices — `lines` carry only ids/qty/discount, never client prices.
 * `customerPhone` is required for `mpesa` (STK target) and `wallet` (parent
 * lookup); `cashTenderedCents` is required for `cash` (change calculation).
 */
export const posSaleRequestSchema = z.object({
  method: z.enum(POS_SALE_METHODS),
  lines: z.array(posSaleLineSchema).min(1, "A sale needs at least one line"),
  overallDiscount: overallDiscountSchema.default({ kind: "none" }),
  customerPhone: z.string().optional(),
  cashTenderedCents: z.number().int().min(0).optional(),
  /** Per-attempt idempotency key — a replayed create returns the existing sale. */
  idempotencyKey: z.string().uuid().optional(),
});
export type PosSaleRequest = z.infer<typeof posSaleRequestSchema>;

export type PosSaleStatus = "pending" | "paid" | "failed" | "cancelled";

/**
 * Create-sale / confirm-sale / status response. `status` drives the cashier UI:
 * `paid` shows the receipt (+ change for cash); `pending` shows the live panel
 * (M-Pesa STK / Paystack) keyed by `checkoutRequestId` / `authorizationUrl`;
 * `failed` shows `failureReason` (AC7).
 */
export interface PosSaleResponse {
  saleId: string;
  status: PosSaleStatus;
  method: PosSaleMethod;
  totalCents: number;
  /** Cash only — change due (tendered − total) and the drawer instruction (AC2). */
  changeCents?: number;
  drawerMessage?: string;
  /** M-Pesa only — the STK checkout handle to poll (AC3). */
  checkoutRequestId?: string;
  /** Paystack only — the hosted-checkout URL to open / show as a QR (AC4). */
  authorizationUrl?: string | null;
  /** Set once paid — the human receipt number. */
  receiptNumber?: string;
  /** Set when failed — a distinct, human reason (AC7). */
  failureReason?: string;
}

// ---------------------------------------------------------------------------
// POS end-of-day cash-up (P2-E04-S05)
// ---------------------------------------------------------------------------

/** A cash variance over this (KES 500) requires a reason (AC3). */
export const POS_CASHUP_VARIANCE_THRESHOLD_CENTS = 50_000;

/** True when |variance| exceeds the threshold, so a reason is mandatory (AC3). */
export function cashupReasonRequired(varianceCents: number): boolean {
  return Math.abs(varianceCents) > POS_CASHUP_VARIANCE_THRESHOLD_CENTS;
}

/** Expected takings by method since the cashier's last cash-up (AC1). */
export interface PosCashupExpected {
  expectedCashCents: number;
  expectedMpesaCents: number;
  expectedPaystackCents: number;
}

/** Close-the-till request (AC2/AC3): the counted cash + an optional reason. */
export const posCashupRequestSchema = z.object({
  countedCashCents: z.number().int().min(0, "Counted cash cannot be negative"),
  reason: z.string().trim().max(500).optional(),
});
export type PosCashupRequest = z.infer<typeof posCashupRequestSchema>;

/** Cash-up result: the expected sums, the counted cash, and the computed variance. */
export interface PosCashupResponse extends PosCashupExpected {
  id: string;
  countedCashCents: number;
  varianceCents: number;
  reason: string | null;
  /** The reconciliation adjustment posted for a non-zero variance (P1-E06). */
  reconciliationAdjustmentId: string | null;
}

// ---------------------------------------------------------------------------
// Loyalty Redemption UI + Engine (P2-E05)
// ---------------------------------------------------------------------------
export type LoyaltyLedgerDirection = "earn" | "redeem";

/** A single loyalty ledger movement, as surfaced to the parent app (P2-E05-S04). */
export interface LoyaltyHistoryItem {
  id: string;
  direction: LoyaltyLedgerDirection;
  points: number;
  sourceType: string;
  sourceId: string | null;
  date: string; // ISO 8601
}

/** Parent loyalty summary: balance + lifetime totals (P2-E05-S04 AC1). */
export interface LoyaltyBalanceResponse {
  balance: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  history: LoyaltyHistoryItem[];
}

/**
 * Full parent loyalty account payload from `GET /parents/me/loyalty`: the S04
 * balance/totals/history plus the S03 redemption `quote` for the checkout toggle.
 */
export interface LoyaltyAccountResponse extends LoyaltyBalanceResponse {
  quote: LoyaltyRedemptionQuote;
}

/**
 * Effective loyalty rates (P2-E05-S02).
 *  earnRate   — KES of qualifying spend per 1 point (default 100)
 *  redeemRate — KES value of 1 point at redemption (default 1)
 */
export interface LoyaltyRates {
  earnRate: number;
  redeemRate: number;
}

/** Redemption quote shown at checkout: "Use X points (save KES Y)" (P2-E05-S03 AC1). */
export interface LoyaltyRedemptionQuote {
  /** Points currently available to redeem (the balance). */
  availablePoints: number;
  /** Cash value (cents) of redeeming `availablePoints` at the current rate. */
  maxDiscountCents: number;
  redeemRate: number;
}

/** Request to redeem points at parent checkout (P2-E05-S03). */
export interface RedeemPointsRequest {
  points: number;
  idempotencyKey: string;
}

/** Result of a redemption (P2-E05-S03). */
export interface RedeemPointsResponse {
  redeemedPoints: number;
  discountCents: number;
  balance: number;
}

// ---------------------------------------------------------------------------
// Backup retention (P2-E06 — Decision 35)
// ---------------------------------------------------------------------------
// Admin-configurable policy for how many database backups we keep. Persisted as
// one JSON row in the `settings` table under `BACKUP_RETENTION_SETTING_KEY`. The
// pruner (21-2) reads the effective policy and never deletes the most-recent
// successful backup, nor anything inside the grace window.
export const backupRetentionPolicySchema = z.object({
  // Recent daily backups to keep. At least one is always retained as a baseline
  // recovery point.
  dailyKeep: z.number().int().min(1),
  // Monthly backups (the latest successful backup in each calendar month) to
  // keep, beyond the daily set. 0 disables the monthly tier.
  monthlyKeep: z.number().int().min(0),
  // Grace window in days: any backup younger than this is never pruned,
  // regardless of the keep counts.
  graceDays: z.number().int().min(0),
});
export type BackupRetentionPolicy = z.infer<typeof backupRetentionPolicySchema>;

/** Well-known `settings` key under which the retention policy is persisted. */
export const BACKUP_RETENTION_SETTING_KEY = "backup.retention";

/** Defaults applied when no policy has been saved (mirrors the fixed P1 window). */
export const DEFAULT_BACKUP_RETENTION_POLICY: BackupRetentionPolicy = {
  dailyKeep: 30,
  monthlyKeep: 12,
  graceDays: 7,
};

/* --- Wallet aging report (P3-E05-S04 / Story 27.4) ----------------------- */

/**
 * Wallet-aging-report request (Story 27.4). The accountant optionally pins the
 * report to a specific `asOf` calendar date (`YYYY-MM-DD`); absent, the server
 * uses "now". The CSV export takes the SAME (optional) filter (AC3). Reuses the
 * shared {@link exportDateSchema} for the date validation.
 */
export const walletAgingQuerySchema = z.object({
  asOf: exportDateSchema.optional(),
});
export type WalletAgingQuery = z.infer<typeof walletAgingQuerySchema>;

/** One parent's outstanding slice within a single aging bucket (AC2). */
export interface WalletAgingRowDto {
  parentId: string;
  /** Profile-link key — the row clicks through to `/parents/:userId/...` (AC2). */
  userId: string;
  parentName: string;
  /** Summed outstanding for this parent within this bucket, integer cents. */
  amountCents: number;
}

/** One aging bucket with its per-parent rows + total (AC1/AC2). */
export interface WalletAgingBucketDto {
  key: string;
  label: string;
  minDays: number;
  maxDays: number | null;
  rows: WalletAgingRowDto[];
  totalCents: number;
}

/**
 * The wallet-aging-report API response (Story 27.4). Outstanding balances bucketed
 * by age (0–7 / 8–30 / 31–60 / 61–90 / 90+ days, AC1) with a per-parent row under
 * each bucket (AC2). Identical shape to `@bm/catalog`'s `WalletAgingReport` (all
 * primitives, serialisable).
 */
export interface WalletAgingReportDto {
  /** The report instant as an ISO string. */
  asOf: string;
  buckets: WalletAgingBucketDto[];
  /** Grand total outstanding across every bucket, integer cents. */
  totalCents: number;
}

/** Header columns of the wallet-aging CSV export, in order (AC3). */
export const WALLET_AGING_EXPORT_COLUMNS = [
  "bucket",
  "parent",
  "outstanding_kes",
] as const;

/**
 * Render the aging report as an RFC-4180 CSV (AC3): a column header, then for each
 * non-empty bucket one line per parent row (`bucket label, parent name, KES
 * outstanding`), then a closing `Total` row for the grand total. Parent names are
 * RFC-4180 escaped. Lines are CRLF-joined with a trailing CRLF — the same shape as
 * the revenue / reconciliation exports.
 */
export function walletAgingToCsv(report: WalletAgingReportDto): string {
  const lines: string[] = [WALLET_AGING_EXPORT_COLUMNS.join(",")];
  for (const bucket of report.buckets) {
    for (const row of bucket.rows) {
      lines.push(
        [csvField(bucket.label), csvField(row.parentName), centsToKes(row.amountCents)].join(","),
      );
    }
  }
  lines.push(["Total", "", centsToKes(report.totalCents)].join(","));
  return lines.join("\r\n") + "\r\n";
}

/** The parent-profile link target for an aging row (AC2) — reuses the wallet statement surface. */
export function walletAgingParentProfileHref(userId: string): string {
  return `/parents/${userId}/statement`;
}

/** A render-ready aging row: formatted amount + the parent-profile href (AC2). */
export interface WalletAgingRowView {
  parentId: string;
  parentName: string;
  /** Formatted outstanding, e.g. `KES 15.00`. */
  amount: string;
  amountCents: number;
  /** Click-through to the parent's profile / statement (AC2). */
  href: string;
}

/** A render-ready aging bucket: its label + per-parent rows + formatted total. */
export interface WalletAgingBucketView {
  key: string;
  label: string;
  rows: WalletAgingRowView[];
  /** Formatted bucket total, e.g. `KES 20.00`. */
  total: string;
  totalCents: number;
}

/** The wallet-aging view-model: every bucket with its per-parent rows (AC1/AC2). */
export interface WalletAgingViewModel {
  asOf: string;
  buckets: WalletAgingBucketView[];
  /** Formatted grand total. */
  total: string;
  totalCents: number;
}

/**
 * Shape the aging report into render-ready buckets + rows (Story 27.4 AC1/AC2).
 * Pure + framework-free so it unit-tests without React and the admin page renders
 * the identical figures. Every bucket is present in display order; each row carries
 * a click-through href to the parent's profile/statement (AC2). Amounts reuse
 * {@link formatSalonRevenue} (the shared KES formatter).
 */
export function walletAgingViewModel(report: WalletAgingReportDto): WalletAgingViewModel {
  return {
    asOf: report.asOf,
    buckets: report.buckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      rows: bucket.rows.map((row) => ({
        parentId: row.parentId,
        parentName: row.parentName,
        amount: formatSalonRevenue(row.amountCents),
        amountCents: row.amountCents,
        href: walletAgingParentProfileHref(row.userId),
      })),
      total: formatSalonRevenue(bucket.totalCents),
      totalCents: bucket.totalCents,
    })),
    total: formatSalonRevenue(report.totalCents),
    totalCents: report.totalCents,
  };
}

/** The CSV export endpoint URL carrying the same (optional) `asOf` filter (AC3). */
export function walletAgingExportUrl(values: { asOf?: string }): string {
  if (!values.asOf) return "/admin/wallet-aging/export";
  const params = new URLSearchParams({ asOf: values.asOf });
  return `/admin/wallet-aging/export?${params.toString()}`;
}

/** Suggested download filename for the aging CSV. */
export function walletAgingFilename(values: { asOf: string }): string {
  return `wallet_aging_${values.asOf}.csv`;
}

/* --- Peak-hours heatmap (P3-E05-S05 / Story 27.5) ------------------------ */

/**
 * The longest range the peak-hours heatmap accepts: 12 months, as an inclusive day
 * count (366 to allow a leap year — same cap the reconciliation export uses, AC3).
 * Ranges longer than this are rejected by {@link peakHoursHeatmapQuerySchema}.
 */
export const PEAK_HOURS_MAX_DAYS = 366;

/** Inclusive count of calendar days in `[fromDate, toDate]` (both `YYYY-MM-DD`, UTC). */
export function peakHoursRangeDayCount(fromDate: string, toDate: string): number {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
  return Math.floor((to - from) / 86_400_000) + 1;
}

/**
 * Peak-hours-heatmap request (Story 27.5 AC1/AC2/AC3). The admin picks an inclusive
 * date range (`YYYY-MM-DD`) and, optionally, a single service unit to filter by
 * (AC2 — an empty/absent unit means "all units"). Both bounds are validated
 * calendar dates with `fromDate <= toDate`, and the range is capped at 12 months
 * (AC3 — {@link PEAK_HOURS_MAX_DAYS}). Reuses the shared {@link exportDateSchema}.
 */
export const peakHoursHeatmapQuerySchema = z
  .object({
    fromDate: exportDateSchema,
    toDate: exportDateSchema,
    unit: z
      .union([z.enum(SERVICE_UNITS), z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? undefined : v)),
  })
  .refine((v) => v.fromDate <= v.toDate, {
    message: "fromDate must be on or before toDate",
    path: ["toDate"],
  })
  .refine((v) => peakHoursRangeDayCount(v.fromDate, v.toDate) <= PEAK_HOURS_MAX_DAYS, {
    message: "Date range may not exceed 12 months",
    path: ["toDate"],
  });
export type PeakHoursHeatmapQuery = z.infer<typeof peakHoursHeatmapQuerySchema>;

/** The single hottest weekday+hour cell (null when no sessions fell in the range). */
export interface PeakHoursCellDto {
  /** 0=Sun … 6=Sat (UTC). */
  weekday: number;
  /** 0 … 23 (UTC). */
  hour: number;
  count: number;
}

/**
 * The peak-hours-heatmap API response (Story 27.5). A 7×24 weekday×hour grid of
 * active-session counts over the selected range (AC1), the unit it was filtered by
 * (null = all units, AC2), the total, and the hottest cell. Identical grid shape to
 * `@bm/catalog`'s `PeakHoursHeatmap`, plus the echoed `unit` filter.
 */
export interface PeakHoursHeatmapDto {
  from: string;
  to: string;
  /** The unit this grid was filtered to, or null for all units (AC2). */
  unit: ServiceUnit | null;
  /** 7×24 grid: `cells[weekday][hour]` = active sessions in that bucket (AC1). */
  cells: number[][];
  totalSessions: number;
  peak: PeakHoursCellDto | null;
}

/** Weekday row labels in heatmap order (0=Sun … 6=Sat), for the grid + peak label. */
export const HEATMAP_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Number of intensity buckets (0 = empty, 1..N shade hotter) for the grid cells. */
export const HEATMAP_INTENSITY_LEVELS = 4;

/** A render-ready cell: its hour, raw count, and a 0..N intensity bucket. */
export interface PeakHoursCellView {
  hour: number;
  count: number;
  /** 0 when empty; 1..{@link HEATMAP_INTENSITY_LEVELS} scaled against the peak. */
  intensity: number;
}

/** A render-ready weekday row: its label + 24 cells. */
export interface PeakHoursRowView {
  weekday: number;
  label: string;
  cells: PeakHoursCellView[];
}

/** The peak-hours-heatmap view-model: a labelled 7×24 grid + the peak summary (AC1). */
export interface PeakHoursHeatmapViewModel {
  from: string;
  to: string;
  rows: PeakHoursRowView[];
  totalSessions: number;
  /** Human peak label e.g. `Wed 10:00 (4 sessions)`, or null when empty. */
  peakLabel: string | null;
}

/** Format an hour-of-day (0..23) as a `HH:00` 24-hour clock label. */
function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/**
 * Map a raw cell count to a 0..{@link HEATMAP_INTENSITY_LEVELS} intensity bucket,
 * scaled against the grid's peak so the hottest cell is always full intensity and
 * empty cells are 0. Pure — drives the cell's shade on the rendered heatmap.
 */
function cellIntensity(count: number, peakCount: number): number {
  if (count <= 0 || peakCount <= 0) return 0;
  const scaled = Math.ceil((count / peakCount) * HEATMAP_INTENSITY_LEVELS);
  return Math.min(HEATMAP_INTENSITY_LEVELS, Math.max(1, scaled));
}

/**
 * Shape the heatmap into a labelled 7×24 grid + peak summary (Story 27.5 AC1). Pure
 * + framework-free so it unit-tests without React and the admin page renders the
 * identical grid. Every weekday row + every hour cell is present (zero-filled) so
 * the grid is stable; each cell carries a 0..N intensity bucket scaled against the
 * peak for shading; the peak label names the hottest weekday+hour (null when empty).
 */
export function peakHoursHeatmapViewModel(dto: PeakHoursHeatmapDto): PeakHoursHeatmapViewModel {
  const peakCount = dto.peak?.count ?? 0;
  const rows: PeakHoursRowView[] = HEATMAP_WEEKDAY_LABELS.map((label, weekday) => ({
    weekday,
    label,
    cells: Array.from({ length: 24 }, (_unused, hour) => {
      const count = dto.cells[weekday]?.[hour] ?? 0;
      return { hour, count, intensity: cellIntensity(count, peakCount) };
    }),
  }));

  const peakLabel = dto.peak
    ? `${HEATMAP_WEEKDAY_LABELS[dto.peak.weekday] ?? "?"} ${hourLabel(dto.peak.hour)} (${dto.peak.count.toLocaleString("en-KE")} sessions)`
    : null;

  return { from: dto.from, to: dto.to, rows, totalSessions: dto.totalSessions, peakLabel };
}

/** The peak-hours-heatmap API URL carrying the date range + optional unit filter. */
export function peakHoursHeatmapUrl(values: { fromDate: string; toDate: string; unit?: string }): string {
  const params = new URLSearchParams({ fromDate: values.fromDate, toDate: values.toDate });
  if (values.unit) params.set("unit", values.unit);
  return `/admin/peak-hours-heatmap?${params.toString()}`;
}
