import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { events } from "./events";

/**
 * Event ticket tiers (Epic 30).
 * Mirrors migration 0068_event_ticket_tiers.sql.
 * price_cents = 0 denotes a free RSVP tier.
 */
export const eventTicketTiers = pgTable(
  "event_ticket_tiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priceCents: integer("price_cents").notNull().default(0),
    allotment: integer("allotment").notNull(),
    saleStartsAt: timestamp("sale_starts_at", { withTimezone: true }),
    saleEndsAt: timestamp("sale_ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("event_ticket_tiers_event_idx").on(table.eventId)],
);
