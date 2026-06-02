import type { FastifyInstance } from "fastify";
import type { Database } from "@bm/db";
import { registerPublicEvents } from "./events.js";
import { registerPublicTickets } from "./tickets.js";
import {
  registerPublicStaffEarnings,
  StaffEarningsRateLimiter,
} from "./staff-earnings.js";
import { registerPublicCoachingNotesSummary } from "./coaching-notes-summary.js";

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
  // P5-E01-S04 (Story 31.4, AC2): the coach's CONTENT-FREE session-note summary —
  // counts + dates only, never note content (the sensitive content stays behind the
  // authenticated admin/reception path). Same kiosk surface as staff-earnings.
  registerPublicCoachingNotesSummary(app, {
    db: deps.db,
    rateLimiter: deps.staffEarningsRateLimiter,
  });
}
