/**
 * Paystack card top-up adapter (P1-E04-S04).
 *
 * Initializes a hosted-checkout transaction (`transaction/initialize`) and
 * verifies one on return (`transaction/verify`) behind the platform's unified
 * Charge interface. The HTTP call is **injected** as a `PaystackTransport` (a
 * fetch-shaped function) so tests never touch the network — the adapter is pure
 * request-shaping + response-mapping. The Paystack secret key is supplied by
 * config (read from env in the API layer, never the DB or the client).
 *
 * This story only INITIATES + (optionally) verifies for UX confirmation. The
 * wallet credit is authoritative on the verified `charge.success` webhook
 * (P1-E04-S05). Card-on-file reuses Paystack's saved `authorization_code`.
 */

/** A fetch-shaped function. `globalThis.fetch` satisfies this in production. */
export type PaystackTransport = (url: string, init: RequestInit) => Promise<Response>;

/** Paystack credentials + endpoints. All sourced from env in the API layer. */
export interface PaystackConfig {
  /** e.g. https://api.paystack.co */
  baseUrl: string;
  /** Server-only secret key (`sk_…`). Never the public key, never client-side. */
  secretKey: string;
  /** Public HTTPS URL Paystack redirects the payer back to after checkout. */
  callbackUrl: string;
}

/** Input to initialize a hosted-checkout transaction. */
export interface PaystackInitInput {
  /** Payer email (the parent's). Paystack keys the customer + receipt on this. */
  email: string;
  /** Amount in minor units (KES cents). Paystack transacts in the smallest unit. */
  amount: number;
  /** Idempotent client reference (UUID). Echoed on verify + the webhook. */
  reference: string;
  /**
   * Optional saved authorization for a card-on-file repeat top-up (AC4). When
   * present Paystack charges the saved card via the hosted flow without a fresh
   * card entry.
   */
  authorizationCode?: string;
}

/**
 * Unified Charge result for a Paystack initiation. Mirrors the M-Pesa `Charge`
 * shape (provider-discriminated) but carries the hosted-checkout handles.
 */
export interface PaystackCharge {
  provider: "paystack";
  /** `pending` — checkout created, awaiting the payer; `failed` — Paystack rejected. */
  status: "pending" | "failed";
  /** The client reference we generated (durable handle echoed on verify/webhook). */
  reference: string;
  /** Hosted-checkout URL the client opens (AC1). Null when `failed`. */
  authorizationUrl: string | null;
  /** Paystack access code paired with the checkout URL. */
  accessCode: string | null;
  /** Present when `status === "failed"`. */
  failureReason?: string;
}

/** Input to verify a transaction on redirect-back (AC2/AC3). */
export interface PaystackVerifyInput {
  /** The reference originally passed to `init`. */
  reference: string;
}

/** A saved authorization surfaced on a successful verify (card-on-file, AC4). */
export interface PaystackAuthorization {
  authorizationCode: string;
  /** Whether Paystack flags the card as reusable for future charges. */
  reusable: boolean;
  last4: string | null;
  cardType: string | null;
}

/**
 * Result of a `transaction/verify` (AC3). UX confirmation only — the webhook
 * (S05) remains the authoritative source of truth for crediting the wallet.
 * - `success` — Paystack reports the charge succeeded.
 * - `failed`  — Paystack reports a terminal failure.
 * - `pending` — still in progress (ongoing/abandoned/queued); retry/await webhook.
 */
export interface PaystackVerifyResult {
  provider: "paystack";
  status: "success" | "failed" | "pending";
  reference: string;
  /** Amount in minor units as reported by Paystack, when present. */
  amount: number | null;
  /** Saved card authorization, present on success when the card is reusable. */
  authorization: PaystackAuthorization | null;
}

/** The Paystack adapter surface (unified Charge interface). */
export interface PaystackAdapter {
  init(input: PaystackInitInput): Promise<PaystackCharge>;
  verify(input: PaystackVerifyInput): Promise<PaystackVerifyResult>;
}

export class PaystackConfigError extends Error {}
export class PaystackTransportError extends Error {}

interface PaystackInitResponse {
  status?: boolean;
  message?: string;
  data?: {
    authorization_url?: string;
    access_code?: string;
    reference?: string;
  };
}

interface PaystackVerifyResponse {
  status?: boolean;
  message?: string;
  data?: {
    status?: string;
    reference?: string;
    amount?: number;
    currency?: string;
    authorization?: {
      authorization_code?: string;
      reusable?: boolean;
      last4?: string;
      card_type?: string;
    };
  };
}

const REQUIRED_KEYS: (keyof PaystackConfig)[] = ["baseUrl", "secretKey", "callbackUrl"];

export interface CreatePaystackAdapterOptions {
  config: PaystackConfig;
  transport: PaystackTransport;
}

/** Construct a Paystack-backed adapter. Validates config eagerly. */
export function createPaystackAdapter(opts: CreatePaystackAdapterOptions): PaystackAdapter {
  const { config, transport } = opts;

  const missing = REQUIRED_KEYS.filter((k) => !config[k] || config[k].trim() === "");
  if (missing.length > 0) {
    throw new PaystackConfigError(`Missing Paystack config: ${missing.join(", ")}`);
  }

  const authHeaders = () => ({
    Authorization: `Bearer ${config.secretKey}`,
    "content-type": "application/json",
  });

  return {
    async init(input: PaystackInitInput): Promise<PaystackCharge> {
      const body: Record<string, unknown> = {
        email: input.email,
        amount: input.amount,
        reference: input.reference,
        callback_url: config.callbackUrl,
      };
      // AC4: card-on-file — charge a previously-saved authorization.
      if (input.authorizationCode) body.authorization_code = input.authorizationCode;

      const res = await transport(`${config.baseUrl}/transaction/initialize`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new PaystackTransportError(`Paystack initialize failed (${res.status})`);
      }

      const json = (await res.json()) as PaystackInitResponse;
      if (json.status !== true || !json.data?.authorization_url) {
        return {
          provider: "paystack",
          status: "failed",
          reference: input.reference,
          authorizationUrl: null,
          accessCode: null,
          failureReason: json.message ?? "Paystack rejected the transaction",
        };
      }
      return {
        provider: "paystack",
        status: "pending",
        reference: input.reference,
        authorizationUrl: json.data.authorization_url,
        accessCode: json.data.access_code ?? null,
      };
    },

    async verify(input: PaystackVerifyInput): Promise<PaystackVerifyResult> {
      const res = await transport(
        `${config.baseUrl}/transaction/verify/${encodeURIComponent(input.reference)}`,
        { method: "GET", headers: authHeaders() },
      );
      if (!res.ok) {
        throw new PaystackTransportError(`Paystack verify failed (${res.status})`);
      }

      const json = (await res.json()) as PaystackVerifyResponse;
      const data = json.data ?? {};
      const txStatus = data.status;
      const status: PaystackVerifyResult["status"] =
        txStatus === "success" ? "success" : txStatus === "failed" ? "failed" : "pending";

      const auth = data.authorization;
      const authorization: PaystackAuthorization | null =
        status === "success" && auth?.authorization_code
          ? {
              authorizationCode: auth.authorization_code,
              reusable: auth.reusable === true,
              last4: auth.last4 ?? null,
              cardType: auth.card_type ?? null,
            }
          : null;

      return {
        provider: "paystack",
        status,
        reference: data.reference ?? input.reference,
        amount: typeof data.amount === "number" ? data.amount : null,
        authorization,
      };
    },
  };
}
