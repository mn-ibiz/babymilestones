import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { events } from "./events.js";
import { eventTicketTiers } from "./event-ticket-tiers.js";
import { ticketOrders } from "./ticket-orders.js";

/**
 * An issued ticket — one row per seat (30-3 / 30-4). Carries a unique short
 * `code` used at the door (30-5). Buyer identity is denormalised from the order
 * so the door list / e-ticket needs no account.
 *
 *   status: issued     — valid, not yet used
 *           checked_in — used at the door (idempotent guard)
 *           cancelled  — voided, seat freed
 */
export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => ticketOrders.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    tierId: uuid("tier_id")
      .notNull()
      .references(() => eventTicketTiers.id, { onDelete: "cascade" }),
    buyerName: text("buyer_name").notNull(),
    buyerPhone: text("buyer_phone").notNull(),
    buyerEmail: text("buyer_email"),
    status: text("status").notNull().default("issued"),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    checkedInBy: uuid("checked_in_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("tickets_event_id_idx").on(table.eventId),
    index("tickets_tier_id_idx").on(table.tierId),
    index("tickets_order_id_idx").on(table.orderId),
  ],
);
