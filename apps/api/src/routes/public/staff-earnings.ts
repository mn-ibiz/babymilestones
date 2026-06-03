import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import {
  bookings,
  commissionLedger,
  commissionRunLines,
  commissionRuns,
  services,
  staff,
  type Database,
} from "@bm/db";
import {
  computeStaffEarnings,
  type EarningsLedgerEntry,
  type EarningsPayout,
} from "@bm/catalog";
import type { PublicStaffEarningsDto, PublicStaffOptionDto } from "@bm/contracts";

/**
 * Public (unauthenticated) staff-earnings viewer (P3-E02-S01). The reception PC
 * hits this with no login: it lists ACTIVE staff display-names for a dropdown and,
 * for a chosen staff member, returns month-to-date / last-month / last-payout
 * figures computed off the existing commission ledger + paid-out run lines. It
 * NEVER exposes anything beyond the display name and those three numbers — no
 * phone, no role, no parent/booking detail (AC4). Read-only; writes nothing.
 *
 * Two protections sit on this surface because it is internet-reachable without a
 * session: a per-IP rate limit (AC5, anti-scrape) and a 60s cache window (Dev
 * Notes) so a kiosk left polling does not hammer the db.
 */

export interface StaffEarningsRateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets — populated only when blocked (Retry-After). */
  retryAfter: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/** Default anti-scrape budget: 60 requests / minute / IP (a kiosk needs only a handful). */
const DEFAULT_MAX_REQUESTS = 60;
const DEFAULT_WINDOW_MS = 60 * 1000;

/**
 * Fixed-window per-IP rate limiter for the public earnings endpoint (AC5). Same
 * in-memory bucket shape as the login limiter (`@bm/auth`'s `LoginRateLimiter`),
 * keyed by IP instead of (phone, ip): an unauthenticated scraper has no phone.
 * `check` both counts and decides, since every public request consumes a slot
 * (there is no success/failure distinction here). The clock is injectable for
 * deterministic tests.
 */
export class StaffEarningsRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxRequests = DEFAULT_MAX_REQUESTS,
    private readonly windowMs = DEFAULT_WINDOW_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /** Count this request against `ip`'s window and report whether it may proceed. */
  check(ip: string): StaffEarningsRateLimitResult {
    const now = this.now();
    const bucket = this.buckets.get(ip);
    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(ip, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, retryAfter: 0 };
    }
    if (bucket.count >= this.maxRequests) {
      return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
    }
    bucket.count += 1;
    return { allowed: true, retryAfter: 0 };
  }
}

export interface PublicStaffEarningsDeps {
  db: Database;
  /** Clock injection for deterministic period boundaries. Defaults to wall clock. */
  now?: () => Date;
  /** Anti-scrape limiter (AC5). Defaults to a fresh per-IP one. */
  rateLimiter?: StaffEarningsRateLimiter;
}

/** Cache window (Dev Notes): 60s, public — kiosks and any CDN can reuse it. */
const CACHE_CONTROL = "public, max-age=60";

/**
 * Load one active staff member's earnings figures from the commission ledger +
 * confirmed payouts, then reduce to the public view-model (AC3). Returns null when
 * the id is unknown OR the staff member is inactive — an inactive staff member is
 * not offered and not viewable (mirrors the dropdown filter). No PII is read here:
 * only the ledger amounts/timestamps and the staff display name.
 */
async function loadEarnings(
  db: Database,
  staffId: string,
  now: Date,
): Promise<PublicStaffEarningsDto | null> {
  const [member] = await db
    .select({ id: staff.id, displayName: staff.displayName })
    .from(staff)
    .where(and(eq(staff.id, staffId), eq(staff.active, true)));
  if (!member) return null;

  // Join each ledger entry to its booking's service NAME (for the S02 breakdown).
  // `source='booking'` ⇒ a completed visit; a reversal nets revenue but is not a
  // visit. Only the service name crosses this boundary — no parent/child/booking
  // id (S02 AC2). The booking join is left-joined so a missing graph still nets.
  const ledgerRows = await db
    .select({
      amountCents: commissionLedger.amountCents,
      occurredAt: commissionLedger.occurredAt,
      source: commissionLedger.source,
      serviceName: services.name,
    })
    .from(commissionLedger)
    .leftJoin(bookings, eq(commissionLedger.bookingId, bookings.id))
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .where(eq(commissionLedger.staffId, staffId));
  const ledger: EarningsLedgerEntry[] = ledgerRows.map((r) => ({
    amountCents: r.amountCents,
    occurredAt: r.occurredAt,
    serviceName: r.serviceName,
    isVisit: r.source === "booking",
  }));

  const payoutRows = await db
    .select({ amountCents: commissionRunLines.amountCents, paidOutAt: commissionRuns.paidOutAt })
    .from(commissionRunLines)
    .innerJoin(commissionRuns, eq(commissionRunLines.runId, commissionRuns.id))
    .where(and(eq(commissionRunLines.staffId, staffId), isNotNull(commissionRuns.paidOutAt)));
  const payouts: EarningsPayout[] = payoutRows
    .filter((r): r is { amountCents: number; paidOutAt: Date } => r.paidOutAt !== null)
    .map((r) => ({ amountCents: r.amountCents, paidOutAt: r.paidOutAt }));

  const view = computeStaffEarnings({ ledger, payouts, now });
  return {
    staffId: member.id,
    displayName: member.displayName,
    monthToDateCents: view.monthToDateCents,
    lastMonthCents: view.lastMonthCents,
    lastPayoutCents: view.lastPayoutCents,
    lastPayoutAt: view.lastPayoutAt ? view.lastPayoutAt.toISOString() : null,
    completedVisits: view.completedVisits,
    topServicesByCount: view.topServicesByCount.map((s) => ({
      serviceName: s.serviceName,
      count: s.count,
    })),
    topServicesByRevenue: view.topServicesByRevenue.map((s) => ({
      serviceName: s.serviceName,
      revenueCents: s.revenueCents,
    })),
  };
}

export function registerPublicStaffEarnings(
  app: FastifyInstance,
  deps: PublicStaffEarningsDeps,
): void {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());
  const rateLimiter = deps.rateLimiter ?? new StaffEarningsRateLimiter();

  /** Anti-scrape gate (AC5): 429 + Retry-After once the per-IP budget is spent. */
  function gate(req: FastifyRequest, reply: FastifyReply): boolean {
    const result = rateLimiter.check(req.ip);
    if (!result.allowed) {
      reply.header("retry-after", String(result.retryAfter));
      reply.code(429).send({ error: "Too many requests. Try again shortly." });
      return false;
    }
    return true;
  }

  // Dropdown: active staff, display names only (AC2). No phone/role/PII (AC4).
  app.get("/public/staff-earnings", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!gate(req, reply)) return reply;
    const rows = await db
      .select({ id: staff.id, displayName: staff.displayName })
      .from(staff)
      .where(eq(staff.active, true))
      .orderBy(desc(staff.createdAt));
    const options: PublicStaffOptionDto[] = rows.map((r) => ({
      id: r.id,
      displayName: r.displayName,
    }));
    reply.header("cache-control", CACHE_CONTROL);
    return reply.code(200).send({ staff: options });
  });

  // Earnings for one active staff member (AC3); 404 for inactive/unknown.
  app.get(
    "/public/staff-earnings/:staffId",
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!gate(req, reply)) return reply;
      const { staffId } = req.params as { staffId: string };
      // Validate the UUID shape BEFORE querying: staff.id is a uuid column, so a
      // malformed id would make Postgres throw 22P02 → a 500 + an errorTracker
      // capture on every junk request to this public anti-scrape endpoint. Treat a
      // non-UUID as not-found so it's indistinguishable from an unknown/inactive id.
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(staffId);
      if (!isUuid) return reply.code(404).send({ error: "Staff member not found" });
      const dto = await loadEarnings(db, staffId, now());
      if (!dto) return reply.code(404).send({ error: "Staff member not found" });
      reply.header("cache-control", CACHE_CONTROL);
      return reply.code(200).send(dto);
    },
  );
}
