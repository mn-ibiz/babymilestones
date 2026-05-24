import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Parents and staff share one users table; phone+PIN is the credential (P1-E01-S01). */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  phone: text("phone").notNull().unique(),
  pinHash: text("pin_hash").notNull(),
  // Role drives staff login + landing (P1-E01-S03); full RBAC lands in P1-E01-S06.
  role: text("role").notNull().default("parent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
