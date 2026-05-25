import { z } from "zod";

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
export const serviceCreateSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(SERVICE_NAME_MAX),
  description: optionalServiceText.refine(
    (v) => v === null || v.length <= SERVICE_DESCRIPTION_MAX,
    `description must be ${SERVICE_DESCRIPTION_MAX} characters or fewer`,
  ),
  unit: z.enum(SERVICE_UNITS, { message: "Choose a service unit" }),
  attributionRoleRequired: optionalAttributionRole,
  taxTreatment: optionalTaxTreatmentCreate,
});
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
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.isActive !== undefined ||
      v.description !== null ||
      v.attributionRoleRequired !== null ||
      v.taxTreatment !== undefined,
    "at least one field is required",
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
