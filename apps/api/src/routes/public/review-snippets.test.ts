import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { children, feedback, parents, users } from "@bm/db";
import { curateReviewSnippet, publishReviewSnippet } from "@bm/catalog";
import { InMemorySessionStore } from "@bm/auth";
import { buildApp } from "../../app.js";
import { ReviewSnippetsRateLimiter } from "./review-snippets.js";

/**
 * P6-E04-S04 (Story 34.4) — public review-snippets endpoint. Unauthenticated, cached
 * (~1h TTL), rate-limited surface that returns ONLY published, curated quotes +
 * their ANONYMISED attribution for the marketing home page (AC2). It NEVER exposes a
 * parent name, a parent id, or the underlying feedback id (the PII-absence guarantee).
 */
let seq = 0;
const nextPhone = () => `+2547${String(++seq + 10_000_000).padStart(8, "0")}`;

describe("public review snippets (P6-E04-S04 / Story 34.4)", () => {
  let dbh: TestDb;
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    dbh = await createTestDb();
    app = buildApp({ db: dbh.db, sessions: new InMemorySessionStore() });
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  let adminId: string;
  async function seedAdmin(): Promise<string> {
    const [u] = await dbh.db.insert(users).values({ phone: nextPhone(), pinHash: "x", role: "admin" }).returning();
    return u!.id;
  }

  async function seedFiveStarFeedback(opts: {
    firstName: string;
    lastName: string;
    place: string;
    childCount: number;
    comment: string;
  }): Promise<string> {
    const [u] = await dbh.db.insert(users).values({ phone: nextPhone(), pinHash: "x" }).returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: opts.firstName, lastName: opts.lastName, residentialArea: opts.place })
      .returning();
    for (let i = 0; i < opts.childCount; i++) {
      await dbh.db.insert(children).values({ parentId: p!.id, firstName: `K${i}`, dateOfBirth: "2022-01-01" });
    }
    const [f] = await dbh.db
      .insert(feedback)
      .values({
        sourceType: "salon",
        sourceId: `att-${++seq}`,
        parentId: u!.id,
        rating: 5,
        comment: opts.comment,
        submittedAt: new Date("2026-06-10T10:00:00Z"),
      })
      .returning();
    return f!.id;
  }

  beforeEach(async () => {
    adminId = await seedAdmin();
  });

  it("returns ONLY published quotes + attribution; NO real name, parent id or feedback id (AC2)", async () => {
    const fid = await seedFiveStarFeedback({
      firstName: "Jane",
      lastName: "Wanjiru",
      place: "Nairobi",
      childCount: 2,
      comment: "Absolutely magical place",
    });
    const snippet = await curateReviewSnippet(dbh.db, { feedbackId: fid, actor: adminId });
    await publishReviewSnippet(dbh.db, { snippetId: snippet.id, actor: adminId });

    // A second curated-but-unpublished snippet must NOT appear publicly.
    const hiddenFid = await seedFiveStarFeedback({
      firstName: "Bob",
      lastName: "Otieno",
      place: "Mombasa",
      childCount: 1,
      comment: "Hidden draft",
    });
    await curateReviewSnippet(dbh.db, { feedbackId: hiddenFid, actor: adminId });

    const res = await app.inject({ method: "GET", url: "/public/review-snippets" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.snippets.length).toBe(1);
    const only = body.snippets[0];
    expect(only.quote).toBe("Absolutely magical place");
    expect(only.attributionLabel).toBe("Parent of two, Nairobi");

    // PII-absence guarantee: each published item carries ONLY id + quote + attribution.
    expect(Object.keys(only).sort()).toEqual(["attributionLabel", "id", "quote"]);

    // The raw payload must not contain any real name, the parent's user id, or the feedback id.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("Jane");
    expect(raw).not.toContain("Wanjiru");
    expect(raw).not.toContain("Bob");
    expect(raw).not.toContain("Hidden draft");
    expect(raw).not.toContain(fid);
  });

  it("returns an empty list when nothing is published", async () => {
    const res = await app.inject({ method: "GET", url: "/public/review-snippets" });
    expect(res.statusCode).toBe(200);
    expect(res.json().snippets).toEqual([]);
  });

  it("auto-pulls the LATEST 3 published by publish recency — a 4th older one is excluded (Story 36.5 AC1)", async () => {
    // Publish four at increasing publish times; the oldest (q0) must drop out.
    for (let i = 0; i < 4; i++) {
      const fid = await seedFiveStarFeedback({
        firstName: `P${i}`,
        lastName: "X",
        place: "Nairobi",
        childCount: 1,
        comment: `q${i}`,
      });
      const snippet = await curateReviewSnippet(dbh.db, { feedbackId: fid, actor: adminId });
      await publishReviewSnippet(dbh.db, {
        snippetId: snippet.id,
        actor: adminId,
        at: new Date(`2026-06-0${i + 1}T10:00:00Z`),
      });
    }
    const res = await app.inject({ method: "GET", url: "/public/review-snippets" });
    expect(res.statusCode).toBe(200);
    const quotes = res.json().snippets.map((s: { quote: string }) => s.quote);
    expect(quotes).toEqual(["q3", "q2", "q1"]);
  });

  it("surfaces a freshly-published snippet at the front (within the 1h cache window) (Story 36.5 AC1+AC2)", async () => {
    const oldFid = await seedFiveStarFeedback({
      firstName: "Old",
      lastName: "X",
      place: "Nairobi",
      childCount: 1,
      comment: "older",
    });
    const old = await curateReviewSnippet(dbh.db, { feedbackId: oldFid, actor: adminId });
    await publishReviewSnippet(dbh.db, { snippetId: old.id, actor: adminId, at: new Date("2026-06-01T10:00:00Z") });

    const freshFid = await seedFiveStarFeedback({
      firstName: "Fresh",
      lastName: "X",
      place: "Nairobi",
      childCount: 1,
      comment: "newest",
    });
    const fresh = await curateReviewSnippet(dbh.db, { feedbackId: freshFid, actor: adminId });
    await publishReviewSnippet(dbh.db, { snippetId: fresh.id, actor: adminId, at: new Date("2026-06-09T10:00:00Z") });

    const res = await app.inject({ method: "GET", url: "/public/review-snippets" });
    const quotes = res.json().snippets.map((s: { quote: string }) => s.quote);
    expect(quotes[0]).toBe("newest");
  });

  it("sets a public Cache-Control with a ~1h max-age (cacheable)", async () => {
    const res = await app.inject({ method: "GET", url: "/public/review-snippets" });
    const cc = res.headers["cache-control"];
    expect(cc).toContain("public");
    expect(cc).toContain("max-age=3600");
  });

  it("rate-limits abusive scraping with a 429 + Retry-After", async () => {
    const limiter = new ReviewSnippetsRateLimiter(2, 60_000);
    const limited = buildApp({ db: dbh.db, sessions: new InMemorySessionStore(), reviewSnippetsRateLimiter: limiter });
    try {
      expect((await limited.inject({ method: "GET", url: "/public/review-snippets" })).statusCode).toBe(200);
      expect((await limited.inject({ method: "GET", url: "/public/review-snippets" })).statusCode).toBe(200);
      const blocked = await limited.inject({ method: "GET", url: "/public/review-snippets" });
      expect(blocked.statusCode).toBe(429);
      expect(blocked.headers["retry-after"]).toBeTruthy();
    } finally {
      await limited.close();
    }
  });
});
