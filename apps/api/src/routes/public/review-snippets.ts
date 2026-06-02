import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { listLatestPublishedSnippets, HOME_TESTIMONIALS_LIMIT, type PublicReviewSnippet } from "@bm/catalog";
import type { Database } from "@bm/db";
import type { PublicReviewSnippetDto } from "@bm/contracts";

/**
 * Public (unauthenticated) review-snippets endpoint (P6-E04-S04 / Story 34.4). The
 * marketing home page reads this to render its testimonials: the CURATED, PUBLISHED
 * 5-star quotes, each under an ANONYMISED attribution label (e.g. "Parent of two,
 * Nairobi") — NEVER a real parent name (AC2).
 *
 * CRITICAL (AC2 PII-absence guarantee): the projection ({@link listLatestPublishedSnippets})
 * selects ONLY the snippet id + quote + attribution label, so a parent name, a
 * parent id, and the underlying feedback id can NEVER cross this internet-reachable
 * boundary. The label is already anonymised at curation time.
 *
 * Story 36.5 (P6-E06-S05) — social proof: this endpoint auto-pulls the LATEST 3
 * published snippets by publish recency ({@link HOME_TESTIMONIALS_LIMIT}), so a fresh
 * curation appears on the home page without any admin reorder. Combined with the ~1h
 * cache window below, a newly-published testimonial propagates within 1h (AC2).
 *
 * Two protections sit on this surface (it is internet-reachable without a session):
 * a per-IP rate limit (anti-scrape) and a ~1h cache window so a CDN / browser can
 * reuse the (rarely-changing) testimonials without hammering the db.
 */

export interface ReviewSnippetsRateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets — populated only when blocked (Retry-After). */
  retryAfter: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/** Anti-scrape budget: 60 requests / minute / IP (a home page needs only one). */
const DEFAULT_MAX_REQUESTS = 60;
const DEFAULT_WINDOW_MS = 60 * 1000;

/**
 * Fixed-window per-IP rate limiter for the public review-snippets endpoint. Same
 * in-memory bucket shape as the staff-earnings limiter, keyed by IP. `check` both
 * counts and decides (every public request consumes a slot). The clock is injectable
 * for deterministic tests.
 */
export class ReviewSnippetsRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxRequests = DEFAULT_MAX_REQUESTS,
    private readonly windowMs = DEFAULT_WINDOW_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /** Count this request against `ip`'s window and report whether it may proceed. */
  check(ip: string): ReviewSnippetsRateLimitResult {
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

export interface PublicReviewSnippetsDeps {
  db: Database;
  /** Anti-scrape limiter. Defaults to a fresh per-IP one. */
  rateLimiter?: ReviewSnippetsRateLimiter;
}

/** Cache window: 1 hour, public — testimonials change rarely; any CDN can reuse it. */
const CACHE_CONTROL = "public, max-age=3600";

export function registerPublicReviewSnippets(app: FastifyInstance, deps: PublicReviewSnippetsDeps): void {
  const { db } = deps;
  const rateLimiter = deps.rateLimiter ?? new ReviewSnippetsRateLimiter();

  function gate(req: FastifyRequest, reply: FastifyReply): boolean {
    const result = rateLimiter.check(req.ip);
    if (!result.allowed) {
      reply.header("retry-after", String(result.retryAfter));
      reply.code(429).send({ error: "Too many requests. Try again shortly." });
      return false;
    }
    return true;
  }

  // Published testimonials only — quote + anonymised attribution, NO PII (AC2).
  // The LATEST 3 by publish recency (Story 36.5 AC1) — the home-page social-proof strip.
  app.get("/public/review-snippets", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!gate(req, reply)) return reply;
    const snippets: PublicReviewSnippet[] = await listLatestPublishedSnippets(db, {
      limit: HOME_TESTIMONIALS_LIMIT,
    });
    const dto: PublicReviewSnippetDto[] = snippets.map((s) => ({
      id: s.id,
      quote: s.quote,
      attributionLabel: s.attributionLabel,
    }));
    reply.header("cache-control", CACHE_CONTROL);
    return reply.code(200).send({ snippets: dto });
  });
}
