import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { users } from "@bm/db";
import { savePage, publishPage } from "@bm/catalog";
import { InMemorySessionStore } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P6-E06-S03 (Story 36.3) — public CMS page endpoint. Unauthenticated, cached
 * surface returning the PUBLISHED content for a slug, for the platform per-unit
 * public pages to render. NEVER exposes a draft (AC2) — an unpublished page 404s
 * and an in-progress draft edit keeps serving the LAST published content.
 */
describe("public CMS pages (P6-E06-S03 / Story 36.3)", () => {
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

  let seq = 0;
  async function seedAdmin(): Promise<string> {
    seq += 1;
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: `+254711${String(100000 + seq).slice(-6)}`, pinHash: "x", role: "admin" })
      .returning();
    return u!.id;
  }

  const content = {
    heroCopy: "Open play sessions for little ones.",
    heroImageUrl: "https://x/play.jpg",
    ctaLabel: "Book now",
    ctaHref: "/signup",
    bodySections: [{ heading: "What we offer", body: "Soft play." }],
  };

  it("404s when no published page exists for the slug (draft must not leak)", async () => {
    const admin = await seedAdmin();
    // Saved but NOT published.
    await savePage(dbh.db, { slug: "play", ...content, updatedBy: admin });

    const res = await app.inject({ method: "GET", url: "/public/cms-pages/play" });
    expect(res.statusCode).toBe(404);
  });

  it("404s for an unknown slug", async () => {
    const res = await app.inject({ method: "GET", url: "/public/cms-pages/warehouse" });
    expect(res.statusCode).toBe(404);
  });

  it("returns the published content for a published page, with a cache header", async () => {
    const admin = await seedAdmin();
    await savePage(dbh.db, { slug: "play", ...content, updatedBy: admin });
    await publishPage(dbh.db, { slug: "play", publishedBy: admin });

    const res = await app.inject({ method: "GET", url: "/public/cms-pages/play" });
    expect(res.statusCode).toBe(200);
    expect(res.json().page.heroCopy).toBe(content.heroCopy);
    expect(res.json().page.bodySections).toHaveLength(1);
    expect(res.headers["cache-control"]).toContain("max-age");
  });

  it("keeps serving the LAST published content while a draft edit is in progress (AC2)", async () => {
    const admin = await seedAdmin();
    await savePage(dbh.db, { slug: "play", ...content, updatedBy: admin });
    await publishPage(dbh.db, { slug: "play", publishedBy: admin });
    // Edit after publish — the working row is now a draft.
    await savePage(dbh.db, { slug: "play", ...content, heroCopy: "In-progress draft.", updatedBy: admin });

    const res = await app.inject({ method: "GET", url: "/public/cms-pages/play" });
    expect(res.statusCode).toBe(200);
    // The PUBLIC still sees the published copy, not the draft.
    expect(res.json().page.heroCopy).toBe(content.heroCopy);
  });
});
