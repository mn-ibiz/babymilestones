import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Parents and staff share one users table; phone+PIN is the credential (P1-E01-S01). */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  phone: text("phone").notNull().unique(),
  pinHash: text("pin_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
