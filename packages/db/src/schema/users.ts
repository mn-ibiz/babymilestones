import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Parents and staff share one users table; phone+PIN is the credential (P1-E01-S01). */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  phone: text("phone").notNull().unique(),
  // Nullable since P1-E02-S02: a Reception walk-in account has no PIN until the
  // parent sets one (verify-via-OTP on first self-login). Self-signup/staff
  // seeds still always set this.
  pinHash: text("pin_hash"),
  // Role drives staff login + landing (P1-E01-S03); full RBAC lands in P1-E01-S06.
  role: text("role").notNull().default("parent"),
  // NULL = no PIN chosen yet (must set/verify via OTP on first self-login);
  // a timestamp records when the PIN was set (P1-E02-S02).
  pinSetAt: timestamp("pin_set_at", { withTimezone: true }),
  // NULL = active. A timestamp soft-deactivates a staff login user (P1-E10-S02):
  // no hard delete, the staff-login flow rejects them, and the deactivation
  // destroys their live sessions so access is revoked immediately.
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
