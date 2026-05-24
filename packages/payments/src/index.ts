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
  Charge,
  CreateMpesaAdapterOptions,
} from "./mpesa/stkPush.js";
