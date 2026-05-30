import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { events } from "./events.js";
import { eventTicketTiers } from "./event-ticket-tiers.js";

/**
 * Guest ticket order (30-3 / 30-4). One order per checkout/RSVP attempt; no
 * parent/user account is created — the buyer's name/phone/email live on the
 * order (and are copied onto each issued ticket).
 *
 *   status: pending  — paid order awaiting payment confirmation
 *           paid     — payment confirmed, tickets issued
 *           free     — free RSVP, tickets issued immediately
 *           cancelled
 */
export const ticketOrders = pgTable(
  "ticket_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    tierId: uuid("tier_id")
      .notNull()
      .references(() => eventTicketTiers.id, { onDelete: "cascade" }),
    buyerName: text("buyer_name").notNull(),
    buyerPhone: text("buyer_phone").notNull(),
    buyerEmail: text("buyer_email"),
    quantity: integer("quantity").notNull(),
    amountCents: integer("amount_cents").notNull(),
    status: text("status").notNull().default("pending"),
    provider: text("provider"),
    paymentReference: text("payment_reference"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ticket_orders_event_id_idx").on(table.eventId),
    index("ticket_orders_payment_reference_idx").on(table.paymentReference),
  ],
);
