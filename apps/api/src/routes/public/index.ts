import type { FastifyInstance } from "fastify";
import type { Database } from "@bm/db";
import { registerPublicEvents } from "./events.js";
import { registerPublicTickets } from "./tickets.js";
import {
  registerPublicStaffEarnings,
  StaffEarningsRateLimiter,
} from "./staff-earnings.js";

export interface PublicRoutesDeps {
  db: Database;
  now?: () => Date;
  /** Anti-scrape limiter for the public staff-earnings viewer (P3-E02-S01 AC5). */
  staffEarningsRateLimiter?: StaffEarningsRateLimiter;
}

/** Public, unauthenticated API surface (P4-E05-S02 onward). */
export function registerPublicRoutes(app: FastifyInstance, deps: PublicRoutesDeps): void {
  registerPublicEvents(app, { db: deps.db, now: deps.now });
  registerPublicTickets(app, { db: deps.db, now: deps.now });
  registerPublicStaffEarnings(app, {
    db: deps.db,
    now: deps.now,
    rateLimiter: deps.staffEarningsRateLimiter,
  });
}
