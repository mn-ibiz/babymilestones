/** @bm/payments — interfaces and primitives land with their owning P1 stories. */
export const PACKAGE = "@bm/payments" as const;

// M-Pesa (Daraja) STK push adapter (P1-E04-S01).
export {
  createMpesaAdapter,
  toMsisdn,
  MpesaConfigError,
  MpesaTransportError,
} from "./mpesa/stkPush.js";
export type {
  MpesaAdapter,
  MpesaConfig,
  DarajaTransport,
  StkPushInput,
  StkQueryInput,
  StkQueryResult,
  Charge,
  CreateMpesaAdapterOptions,
} from "./mpesa/stkPush.js";

// Paystack card top-up adapter (P1-E04-S04).
export {
  createPaystackAdapter,
  PaystackConfigError,
  PaystackTransportError,
} from "./paystack/paystack.js";
export type {
  PaystackAdapter,
  PaystackConfig,
  PaystackTransport,
  PaystackInitInput,
  PaystackCharge,
  PaystackVerifyInput,
  PaystackVerifyResult,
  PaystackAuthorization,
  CreatePaystackAdapterOptions,
} from "./paystack/paystack.js";

// Paystack webhook signature verification (P1-E04-S05).
export { verifyPaystackSignature } from "./paystack/verify.js";

// Cash top-up adapter recorded by Reception/Cashier (P1-E04-S06).
export {
  recordCashTopup,
  CASH_RECEPTION_SOURCE,
  CashTopupAmountError,
} from "./cash/topup.js";
export type { CashTopupInput, CashCharge } from "./cash/topup.js";
