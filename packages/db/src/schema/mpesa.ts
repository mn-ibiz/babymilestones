import { bigint, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { wallets } from "./wallets.js";

/**
 * M-Pesa STK push request (P1-E04-S01). One row per Daraja STK push the platform
 * initiates on a parent's behalf. Provider table — prefixed `mpesa_*`.
 *
 * Keyed by `checkoutRequestId` (UNIQUE): the handle Daraja returns and later
 * echoes on the C2B callback (P1-E04-S02), so the callback resolves exactly one
 * row idempotently. Money is integer minor units (KES cents), bigint, positive.
 *
 * State machine for THIS story: `INITIATED → STK_SENT`. The callback (S02)
 * advances to `CALLBACK_PENDING`/`SUCCEEDED`/`FAILED`; the reconciliation cron
 * (S03) consumes `CALLBACK_PENDING`. Daraja credentials live in env only — never
 * here. The wallet credit happens in S02 via `@bm/wallet`; this row only records
 * that an STK push was initiated.
 */
export const mpesaStkRequests = pgTable(
  "mpesa_stk_request",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Daraja CheckoutRequestID — durable handle echoed on the callback. UNIQUE. */
    checkoutRequestId: text("checkout_request_id").notNull().unique(),
    /** Daraja MerchantRequestID (paired with the checkout id in the response). */
    merchantRequestId: text("merchant_request_id").notNull(),
    /** Initiating parent (users.id) — the session owner, never client-supplied. */
    parentId: uuid("parent_id")
      .notNull()
      .references(() => users.id),
    /** Wallet the eventual credit (S02) lands in. Derived server-side. */
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id),
    /** Amount requested, integer cents (KES * 100). Positive. */
    amount: bigint("amount", { mode: "number" }).notNull(),
    /** Normalised payer MSISDN (+2547XXXXXXXX) the prompt was sent to. */
    phone: text("phone").notNull(),
    /**
     * `INITIATED` | `STK_SENT` | `CALLBACK_PENDING` | `SUCCEEDED` | `FAILED` —
     * CHECK-constrained in the migration. This story only writes the first two.
     */
    state: text("state").notNull().default("INITIATED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Poll the latest request for a parent (status endpoint, AC4).
    parentIdCreatedAtIdx: index("mpesa_stk_request_parent_id_created_at_idx").on(
      t.parentId,
      t.createdAt,
    ),
  }),
);

export type MpesaStkRequestRow = typeof mpesaStkRequests.$inferSelect;
export type MpesaStkRequestInsert = typeof mpesaStkRequests.$inferInsert;

/**
 * M-Pesa C2B/STK callback (P1-E04-S02). One row per Daraja STK callback we
 * receive. Provider table — prefixed `mpesa_*`.
 *
 * The handler is **idempotent on `checkoutRequestId`** (UNIQUE): the insert runs
 * `ON CONFLICT DO NOTHING`, so a callback Daraja retries (it retries on any
 * non-200) lands exactly once. The row `id` is reused as the `@bm/wallet`
 * idempotency key when crediting the top-up, layering a second idempotency
 * guarantee on top of the table UNIQUE so replays never double-credit.
 *
 * NOT FK-linked to `mpesa_stk_request`: an out-of-order callback can arrive
 * before that row commits (AC5); the handler reconciles by `checkoutRequestId`.
 * The raw payload is untrusted input, stored verbatim for forensics only.
 */
export const mpesaCallbacks = pgTable("mpesa_callback", {
  /** PK — doubles as the wallet idempotency key for the eventual credit. */
  id: uuid("id").defaultRandom().primaryKey(),
  /** Daraja CheckoutRequestID echoed on the callback. UNIQUE → ON CONFLICT DO NOTHING. */
  checkoutRequestId: text("checkout_request_id").notNull().unique(),
  /** Daraja MerchantRequestID, when present. */
  merchantRequestId: text("merchant_request_id"),
  /** Daraja ResultCode: 0 = success, non-zero = failed/cancelled. */
  resultCode: integer("result_code").notNull(),
  /** Human-readable ResultDesc (untrusted; audit only). */
  resultDesc: text("result_desc"),
  /** Full raw callback body, stored verbatim for forensics. */
  rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MpesaCallbackRow = typeof mpesaCallbacks.$inferSelect;
export type MpesaCallbackInsert = typeof mpesaCallbacks.$inferInsert;
