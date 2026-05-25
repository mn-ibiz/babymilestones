// Barrel for the single shared Postgres schema. Domain tables are unprefixed;
// payment-provider tables are prefixed (mpesa_*, paystack_*).
export * from "./audit.js";
export * from "./users.js";
export * from "./parents.js";
export * from "./children.js";
export * from "./wallets.js";
export * from "./wallet-ledger.js";
export * from "./invoices.js";
export * from "./wallet-ledger-invoice-settlement.js";
export * from "./bookings.js";
export * from "./otp.js";
export * from "./sms.js";
export * from "./permissions.js";
export * from "./data-exports.js";
export * from "./mpesa.js";
export * from "./paystack.js";
export * from "./bank-transfer.js";
export * from "./float-accounts.js";
