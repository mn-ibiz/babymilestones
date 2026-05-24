// Barrel for the single shared Postgres schema. Domain tables are unprefixed;
// payment-provider tables are prefixed (mpesa_*, paystack_*).
export * from "./audit.js";
export * from "./users.js";
export * from "./parents.js";
export * from "./wallets.js";
export * from "./otp.js";
export * from "./sms.js";
export * from "./permissions.js";
