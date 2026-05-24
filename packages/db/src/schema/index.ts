// Barrel for the single shared Postgres schema. Domain tables are unprefixed;
// payment-provider tables are prefixed (mpesa_*, paystack_*).
export * from "./audit.js";
