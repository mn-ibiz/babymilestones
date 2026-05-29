import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { children } from "./children.js";

/**
 * Authorised pickup list per child (P2-E03-S01). Each row is one person a parent
 * has nominated to collect a child (AC1): `name`, contact `phone`, an optional
 * `photoUrl`, and their `relationship` to the child. The attendant reads this
 * list at hand-off (P2-E03-S02/S03) so a collection is known-safe.
 *
 * The parent CRUDs the list from the dashboard (AC2) — ownership (the child
 * belongs to the session parent) is enforced at the API edge. Every change is
 * audited to `audit_outbox` (AC3) by the route, in the same transaction.
 */
export const childPickupAuthorisations = pgTable(
  "child_pickup_authorisations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id),
    /** Display name of the authorised person (required). */
    name: text("name").notNull(),
    /** Contact phone — free-form (a pickup person is not a system login). */
    phone: text("phone").notNull(),
    /** Optional photo, shown on the attendant screen. */
    photoUrl: text("photo_url"),
    /** Relationship to the child (required), e.g. "Aunt", "Nanny". */
    relationship: text("relationship").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    childIdIdx: index("child_pickup_authorisations_child_id_idx").on(t.childId),
  }),
);

export type ChildPickupAuthorisationRow = typeof childPickupAuthorisations.$inferSelect;
export type ChildPickupAuthorisationInsert = typeof childPickupAuthorisations.$inferInsert;
