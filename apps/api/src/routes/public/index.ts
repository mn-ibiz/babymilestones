import type { FastifyInstance } from "fastify";
import type { Database } from "@bm/db";
import type { SmsSender } from "@bm/sms";
import type { MpesaRouteConfig } from "../payments/mpesa/initiate.js";
import type { PaystackRouteConfig } from "../payments/paystack/init.js";
import { registerPublicEvents } from "./events.js";
import { registerPublicTickets } from "./tickets.js";

export interface PublicRoutesDeps {
  db: Database;
  /** Provider wiring for paid guest ticket checkout (P4-E05-S03). */
  mpesa?: MpesaRouteConfig;
  paystack?: PaystackRouteConfig;
  /** Optional SMS seam for e-ticket / RSVP copy (P4-E05-S03 / S04). */
  sms?: SmsSender;
  /** Public origin the e-ticket link is built from. */
  ticketBaseUrl?: string;
  now?: () => Date;
}

/** Public, unauthenticated API surface (P4-E05-S02 onward). */
export function registerPublicRoutes(app: FastifyInstance, deps: PublicRoutesDeps): void {
  registerPublicEvents(app, { db: deps.db, now: deps.now });
  registerPublicTickets(app, {
    db: deps.db,
    mpesa: deps.mpesa,
    paystack: deps.paystack,
    sms: deps.sms,
    ticketBaseUrl: deps.ticketBaseUrl,
    now: deps.now,
  });
}
