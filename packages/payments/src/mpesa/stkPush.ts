/**
 * M-Pesa (Safaricom Daraja) STK push adapter (P1-E04-S01).
 *
 * Builds and sends a Daraja `stkpush` request behind the platform's unified
 * Charge interface. The HTTP call is **injected** as a `DarajaTransport` (a
 * fetch-shaped function) so tests never touch the network — the adapter is pure
 * request-shaping + response-mapping. Daraja credentials are supplied by config
 * (read from env in the API layer, never the DB).
 *
 * This story only INITIATES: a successful push yields a `pending` charge holding
 * the `CheckoutRequestID`. The wallet credit lands later on the C2B callback
 * (P1-E04-S02) keyed by that same id.
 */

/** A fetch-shaped function. `globalThis.fetch` satisfies this in production. */
export type DarajaTransport = (url: string, init: RequestInit) => Promise<Response>;

/** Daraja credentials + endpoints. All sourced from env in the API layer. */
export interface MpesaConfig {
  /** e.g. https://sandbox.safaricom.co.ke or https://api.safaricom.co.ke */
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  /** BusinessShortCode (Paybill/Till). */
  shortcode: string;
  /** Lipa Na M-Pesa Online passkey. */
  passkey: string;
  /** Public HTTPS URL Daraja POSTs the result to (consumed by S02). */
  callbackUrl: string;
}

/** Input to a charge: a whole-KES amount, the payer phone, and an account ref. */
export interface StkPushInput {
  /** Whole shillings (Daraja transacts in whole KES on the STK prompt). */
  amountKes: number;
  /** Payer phone — any common KE form; normalised to the Daraja MSISDN. */
  phone: string;
  /** Opaque reference shown on the prompt / echoed back (we pass the wallet id). */
  accountRef: string;
  /** Optional description on the prompt. */
  description?: string;
}

/** Unified Charge result shared across providers (mpesa, paystack, …). */
export interface Charge {
  provider: "mpesa";
  /** `pending` — STK accepted, awaiting the payer; `failed` — Daraja rejected it. */
  status: "pending" | "failed";
  /** Daraja CheckoutRequestID — the durable handle the callback echoes. */
  checkoutRequestId: string | null;
  merchantRequestId: string | null;
  /** Present when `status === "failed"`. */
  failureReason?: string;
}

/** Input to an STK status query (P1-E04-S03): the durable checkout handle. */
export interface StkQueryInput {
  /** Daraja CheckoutRequestID returned by the original stkPush. */
  checkoutRequestId: string;
}

/**
 * Result of a Daraja `stkpushquery` (P1-E04-S03). Maps Daraja's transaction
 * status into the three outcomes the reconciliation cron acts on:
 * - `success` — the customer paid (ResultCode 0); credit via the idempotent path.
 * - `failed`  — the customer cancelled / it timed out (non-zero ResultCode); mark FAILED.
 * - `pending` — Daraja is still processing (no terminal ResultCode yet); retry later.
 */
export interface StkQueryResult {
  provider: "mpesa";
  status: "success" | "failed" | "pending";
  checkoutRequestId: string;
  /** Terminal Daraja ResultCode when known (0 = paid), else null while pending. */
  resultCode: number | null;
  resultDesc: string | null;
}

/** The provider adapter surface (extends as paystack/cash land). */
export interface MpesaAdapter {
  stkPush(input: StkPushInput): Promise<Charge>;
  /** Query the status of a previously-initiated STK push (P1-E04-S03). */
  stkQuery(input: StkQueryInput): Promise<StkQueryResult>;
}

export class MpesaConfigError extends Error {}
export class MpesaTransportError extends Error {}

interface DarajaTokenResponse {
  access_token?: string;
  expires_in?: string;
}

interface DarajaStkResponse {
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
  CustomerMessage?: string;
  errorMessage?: string;
}

interface DarajaStkQueryResponse {
  ResponseCode?: string;
  ResponseDescription?: string;
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  /** Terminal result of the STK: "0" paid, non-zero failed/cancelled. */
  ResultCode?: string;
  ResultDesc?: string;
  errorCode?: string;
  errorMessage?: string;
}

const REQUIRED_KEYS: (keyof MpesaConfig)[] = [
  "baseUrl",
  "consumerKey",
  "consumerSecret",
  "shortcode",
  "passkey",
  "callbackUrl",
];

/**
 * Normalise any common Kenyan phone form to the Daraja MSISDN `2547XXXXXXXX`
 * (12 digits, no leading `+`). Accepts `+2547…`, `2547…`, `07…`, `7…`.
 */
export function toMsisdn(phone: string): string {
  const digits = phone.replace(/\D/gu, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.startsWith("7") || digits.startsWith("1")) return `254${digits}`;
  return digits;
}

/** Daraja timestamp: `yyyyMMddHHmmss` in EAT (UTC+3). */
function darajaTimestamp(now: Date): string {
  // Daraja expects East Africa Time; shift the UTC instant by +3h and format.
  const eat = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(eat.getUTCFullYear(), 4)}${p(eat.getUTCMonth() + 1)}${p(eat.getUTCDate())}` +
    `${p(eat.getUTCHours())}${p(eat.getUTCMinutes())}${p(eat.getUTCSeconds())}`
  );
}

export interface CreateMpesaAdapterOptions {
  config: MpesaConfig;
  transport: DarajaTransport;
  /** Clock injection for deterministic timestamps in tests. */
  now?: () => Date;
}

/** Construct a Daraja-backed M-Pesa adapter. Validates config eagerly. */
export function createMpesaAdapter(opts: CreateMpesaAdapterOptions): MpesaAdapter {
  const { config, transport } = opts;
  const now = opts.now ?? (() => new Date());

  const missing = REQUIRED_KEYS.filter((k) => !config[k] || config[k].trim() === "");
  if (missing.length > 0) {
    throw new MpesaConfigError(`Missing M-Pesa config: ${missing.join(", ")}`);
  }

  async function fetchToken(): Promise<string> {
    const basic = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64");
    const res = await transport(
      `${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      { method: "GET", headers: { Authorization: `Basic ${basic}` } },
    );
    if (!res.ok) {
      throw new MpesaTransportError(`Daraja token request failed (${res.status})`);
    }
    const json = (await res.json()) as DarajaTokenResponse;
    if (!json.access_token) {
      throw new MpesaTransportError("Daraja token response missing access_token");
    }
    return json.access_token;
  }

  return {
    async stkPush(input: StkPushInput): Promise<Charge> {
      const token = await fetchToken();
      const timestamp = darajaTimestamp(now());
      const password = Buffer.from(
        `${config.shortcode}${config.passkey}${timestamp}`,
      ).toString("base64");
      const msisdn = toMsisdn(input.phone);

      const body = {
        BusinessShortCode: config.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: input.amountKes,
        PartyA: msisdn,
        PartyB: config.shortcode,
        PhoneNumber: msisdn,
        CallBackURL: config.callbackUrl,
        AccountReference: input.accountRef,
        TransactionDesc: input.description ?? "Wallet top-up",
      };

      const res = await transport(`${config.baseUrl}/mpesa/stkpush/v1/processrequest`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new MpesaTransportError(`Daraja stkpush failed (${res.status})`);
      }

      const json = (await res.json()) as DarajaStkResponse;
      // Daraja signals acceptance with ResponseCode "0".
      if (json.ResponseCode !== "0") {
        return {
          provider: "mpesa",
          status: "failed",
          checkoutRequestId: json.CheckoutRequestID ?? null,
          merchantRequestId: json.MerchantRequestID ?? null,
          failureReason:
            json.ResponseDescription ?? json.errorMessage ?? "Daraja rejected the STK push",
        };
      }
      return {
        provider: "mpesa",
        status: "pending",
        checkoutRequestId: json.CheckoutRequestID ?? null,
        merchantRequestId: json.MerchantRequestID ?? null,
      };
    },

    async stkQuery(input: StkQueryInput): Promise<StkQueryResult> {
      const token = await fetchToken();
      const timestamp = darajaTimestamp(now());
      const password = Buffer.from(
        `${config.shortcode}${config.passkey}${timestamp}`,
      ).toString("base64");

      const body = {
        BusinessShortCode: config.shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: input.checkoutRequestId,
      };

      const res = await transport(`${config.baseUrl}/mpesa/stkpushquery/v1/query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new MpesaTransportError(`Daraja stkpushquery failed (${res.status})`);
      }

      const json = (await res.json()) as DarajaStkQueryResponse;

      // Daraja only attaches a terminal ResultCode once the STK has resolved.
      // While it is still being processed it returns a non-"0" ResponseCode
      // (e.g. 500.001.1001 "transaction is being processed") and NO ResultCode.
      if (json.ResultCode === undefined || json.ResultCode === null) {
        return {
          provider: "mpesa",
          status: "pending",
          checkoutRequestId: input.checkoutRequestId,
          resultCode: null,
          resultDesc: json.ResponseDescription ?? json.errorMessage ?? null,
        };
      }

      const resultCode = Number(json.ResultCode);
      const resolved = Number.isFinite(resultCode) ? resultCode : null;
      return {
        provider: "mpesa",
        status: resolved === 0 ? "success" : "failed",
        checkoutRequestId: input.checkoutRequestId,
        resultCode: resolved,
        resultDesc: json.ResultDesc ?? json.ResponseDescription ?? null,
      };
    },
  };
}
