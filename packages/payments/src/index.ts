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

// Bank transfer top-up confirmed by an admin (P1-E04-S07).
export {
  confirmBankTransfer,
  BANK_MANUAL_SOURCE,
  BankTransferAmountError,
} from "./bank/topup.js";
export type { BankTransferConfirmInput, BankCharge } from "./bank/topup.js";

// Receipt writer interface — the single KRA/eTIMS seam (P1-E08-S02).
export {
  writeReceipt,
  defaultReceiptWriter,
  formatReceiptNumber,
  LocalReceiptWriter,
  ReceiptValidationError,
  EtimsReceiptWriter,
  EtimsNotImplementedError,
  // Live eTIMS adapter + runtime writer selector (P5-E02-S01 / S03).
  createEtimsReceiptWriter,
  defaultFetchTransport,
  EtimsConfigError,
  EtimsTransportError,
  resolveReceiptWriter,
  isEtimsEnabled,
  ETIMS_SETTING_KEY,
  // eTIMS payload builder + VAT (P5-E02-S01).
  STANDARD_VAT_RATE_BP,
  computeLineVat,
  buildEtimsInvoice,
  // eTIMS retry / dead-letter queue (P5-E02-S02).
  etimsBackoffMs,
  ETIMS_BACKOFF_CAP_MS,
  ETIMS_BACKOFF_BASE_MS,
  ETIMS_DEFAULT_MAX_ATTEMPTS,
  enqueueEtimsSubmission,
  claimDueEtimsSubmissions,
  markEtimsSubmissionSent,
  recordEtimsSubmissionFailure,
  listDeadLetters,
  requeueDeadLetter,
  // Receipt void as a reversing entry (P1-E08-S05).
  voidReceipt,
  AlreadyVoidedError,
  VoidReceiptNotFoundError,
  VoidTargetIsVoidError,
} from "./receipts/index.js";
export type {
  ReceiptWriter,
  ReceiptWriterExecutor,
  WriteReceiptPayload,
  WriteReceiptLine,
  Receipt,
  ReceiptLine,
  EtimsConfig,
  EtimsTransport,
  EtimsTransportRequestOptions,
  EtimsTransportResponse,
  EtimsAcceptance,
  CreateEtimsWriterOptions,
  ResolveReceiptWriterOptions,
  EtimsWiring,
  EtimsInvoice,
  EtimsInvoiceItem,
  EtimsInvoiceSeller,
  BuildEtimsInvoiceOptions,
  EtimsQueueRow,
  EnqueueEtimsInput,
  ClaimDueInput,
  RecordFailureResult,
  VoidReceiptInput,
  VoidReceiptResult,
} from "./receipts/index.js";
