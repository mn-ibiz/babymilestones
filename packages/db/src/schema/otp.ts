import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * One-time codes for PIN reset by OTP (P1-E01-S05). The 6-digit code is stored
 * hashed (never in cleartext); single-use is enforced via `consumedAt`, and the
 * code is only valid until `expiresAt` (10-minute TTL). Rows are keyed by the
 * normalised phone so an unknown phone can be handled identically (anti-enum).
 */
export const otpCodes = pgTable("otp_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  phone: text("phone").notNull(),
  /** SHA-256 of the 6-digit code — the raw code is never persisted. */
  codeHash: text("code_hash").notNull(),
  purpose: text("purpose").notNull().default("pin_reset"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OtpCodeRow = typeof otpCodes.$inferSelect;
