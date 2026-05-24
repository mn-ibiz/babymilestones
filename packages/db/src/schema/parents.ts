import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * Parent profile (P1-E02-S01). One profile per user — `userId` is unique, FK to
 * `users` (no joint accounts in v1). Required names; email + residential area
 * are nullable free text. Email validation is permissive (RFC 5322 light) and
 * lives in the contract layer, not the DB.
 */
export const parents = pgTable("parents", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  residentialArea: text("residential_area"),
  // Consent (P1-E02-S04 AC1). Opt-in marketing SMS — defaults off; the X4 SMS
  // dispatcher reads this before any non-transactional send (AC3).
  smsMarketingOptIn: boolean("sms_marketing_opt_in").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ParentRow = typeof parents.$inferSelect;
