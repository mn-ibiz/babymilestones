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
