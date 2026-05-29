import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { AttributionRole } from "./services.js";

/**
 * `staff` (P1-E07-S03) — the people bookings are attributed to (stylists,
 * instructors, attendants, coaches, event staff) and, in P3, accrue commission
 * to. These are pure DATA records: they do NOT authenticate, hold no PIN, and
 * have NO association to the `users`/auth table. There is deliberately no
 * `userId` column.
 *
 * `role` reuses the {@link AttributionRole} taxonomy — the SAME values as
 * `services.attributionRoleRequired` (P1-E07-S02) — so a service requiring role
 * X can only be attributed to a staff member of role X. CHECK-constrained in
 * migration 0030 (the runtime source of truth; db has no contracts dependency).
 *
 * No hard deletes: a departed staff member is soft-retired via `active=false`
 * plus a `terminatedAt` timestamp, so booking attribution history keeps its
 * reference. Renames do NOT mutate history — bookings carry a denormalised
 * name-at-time-of-booking snapshot (Reception story S04), so editing
 * `displayName` here never rewrites past attributions. Commission rate is OUT of
 * scope here (P3-E01) — role only.
 */
export const staff = pgTable(
  "staff",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    displayName: text("display_name").notNull(),
    /** One of the attribution-role taxonomy values — CHECK-constrained in migration 0030. */
    role: text("role").$type<AttributionRole>().notNull(),
    /** Phone for the commission payout export / M-Pesa B2C (P3-E01-S05). Nullable. */
    phone: text("phone"),
    /** Soft on/off — inactive staff are not offered for new attributions. */
    active: boolean("active").notNull().default(true),
    /** When the member was retired (set alongside active=false); null while active. */
    terminatedAt: timestamp("terminated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    roleActiveIdx: index("staff_role_active_idx").on(t.role, t.active),
  }),
);

export type StaffRow = typeof staff.$inferSelect;
export type StaffInsert = typeof staff.$inferInsert;
