import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { auditOutbox, children, feedback, parents, reviewSnippets, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P6-E04-S04 (Story 34.4) — admin review-snippets curation API. Integration via
 * app.inject with real staff sessions (+ CSRF). The admin lists 5-star candidates +
 * curated snippets, curates one (defaulting an ANONYMISED attribution from real
 * data, AC1), edits the attribution, and PUBLISHES / UNPUBLISHES it (audited, AC3).
 * Reserved to `manage config` (admin / super_admin); enforced server-side.
 */
let seq = 0;
const nextPhone = () => `+2547${String(++seq + 20_000_000).padStart(8, "0")}`;

describe("Admin review-snippets API (P6-E04-S04)", () => {
  let dbh: TestDb;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    const csrf = decodeURIComponent(csrfCookie.split("=")[1]!);
    return { session, csrfCookie, csrf };
  };
  type Creds = Awaited<ReturnType<typeof loginStaff>>;

  const get = (url: string, creds: Creds) =>
    app.inject({ method: "GET", url, headers: { cookie: [creds.session, creds.csrfCookie].join("; ") } });
  const post = (url: string, creds: Creds, payload: unknown) =>
    app.inject({
      method: "POST",
      url,
      headers: { cookie: [creds.session, creds.csrfCookie].join("; "), "x-csrf-token": creds.csrf },
      payload: payload as object,
    });

  async function seedFiveStar(opts: {
    firstName: string;
    lastName: string;
    place: string;
    childCount: number;
    rating?: number;
    comment?: string | null;
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
        rating: opts.rating ?? 5,
        comment: opts.comment === undefined ? "Loved it here" : opts.comment,
        submittedAt: new Date("2026-06-10T10:00:00Z"),
      })
      .returning();
    return f!.id;
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000002", "7422", "super_admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000004", "7424", "treasury"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("lists 5-star candidates with a SUGGESTED anonymised attribution — never a name (AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    await seedFiveStar({ firstName: "Jane", lastName: "Wanjiru", place: "Nairobi", childCount: 2, comment: "Magic" });
    // 4-star and comment-less feedback must NOT be offered as candidates.
    await seedFiveStar({ firstName: "Bob", lastName: "Otieno", place: "Kisumu", childCount: 1, rating: 4, comment: "Ok" });
    await seedFiveStar({ firstName: "Mo", lastName: "Said", place: "Mombasa", childCount: 1, comment: null });

    const res = await get("/admin/review-snippets", creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.candidates.length).toBe(1);
    expect(body.candidates[0].comment).toBe("Magic");
    expect(body.candidates[0].suggestedAttribution).toBe("Parent of two, Nairobi");
    // The suggested attribution never carries the real name.
    expect(JSON.stringify(body.candidates)).not.toContain("Wanjiru");
  });

  it("curates a 5-star feedback, defaulting the anonymised attribution (AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const fid = await seedFiveStar({ firstName: "Jane", lastName: "Wanjiru", place: "Nairobi", childCount: 2, comment: "Magic" });
    const res = await post("/admin/review-snippets", creds, { feedbackId: fid });
    expect(res.statusCode).toBe(201);
    expect(res.json().snippet.attributionLabel).toBe("Parent of two, Nairobi");
    // Now it leaves the candidate pool.
    const after = await get("/admin/review-snippets", creds);
    expect(after.json().candidates.length).toBe(0);
    expect(after.json().snippets.length).toBe(1);
  });

  it("rejects curating a non-5-star feedback (AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const fid = await seedFiveStar({ firstName: "Bob", lastName: "Otieno", place: "Kisumu", childCount: 1, rating: 4, comment: "Ok" });
    const res = await post("/admin/review-snippets", creds, { feedbackId: fid });
    expect(res.statusCode).toBe(400);
  });

  it("accepts an attribution override at curation (privacy guarantee, AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const fid = await seedFiveStar({ firstName: "Jane", lastName: "Wanjiru", place: "Nairobi", childCount: 2, comment: "Magic" });
    const res = await post("/admin/review-snippets", creds, { feedbackId: fid, attributionLabel: "A delighted parent" });
    expect(res.json().snippet.attributionLabel).toBe("A delighted parent");
  });

  it("edits a snippet's attribution label (AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const fid = await seedFiveStar({ firstName: "Jane", lastName: "Wanjiru", place: "Nairobi", childCount: 2, comment: "Magic" });
    const created = await post("/admin/review-snippets", creds, { feedbackId: fid });
    const id = created.json().snippet.id;
    const res = await post(`/admin/review-snippets/${id}/attribution`, creds, { attributionLabel: "Parent of two, Coast" });
    expect(res.statusCode).toBe(200);
    expect(res.json().snippet.attributionLabel).toBe("Parent of two, Coast");
  });

  it("publishes a snippet and writes a review_snippet.published audit row (AC3)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const fid = await seedFiveStar({ firstName: "Jane", lastName: "Wanjiru", place: "Nairobi", childCount: 2, comment: "Magic" });
    const created = await post("/admin/review-snippets", creds, { feedbackId: fid });
    const id = created.json().snippet.id;
    const res = await post(`/admin/review-snippets/${id}/publish`, creds, {});
    expect(res.statusCode).toBe(200);
    expect(res.json().snippet.published).toBe(true);
    const rows = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "review_snippet.published"));
    expect(rows.length).toBe(1);
    expect(rows[0]!.targetId).toBe(id);
    // The audit payload never carries the parent's real name.
    expect(JSON.stringify(rows[0]!.payload)).not.toContain("Wanjiru");
  });

  it("unpublishes a snippet and writes a review_snippet.unpublished audit row (AC3)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const fid = await seedFiveStar({ firstName: "Jane", lastName: "Wanjiru", place: "Nairobi", childCount: 2, comment: "Magic" });
    const created = await post("/admin/review-snippets", creds, { feedbackId: fid });
    const id = created.json().snippet.id;
    await post(`/admin/review-snippets/${id}/publish`, creds, {});
    const res = await post(`/admin/review-snippets/${id}/unpublish`, creds, {});
    expect(res.statusCode).toBe(200);
    expect(res.json().snippet.published).toBe(false);
    const [row] = await dbh.db.select().from(reviewSnippets).where(eq(reviewSnippets.id, id));
    expect(row!.publishedAt).toBeNull();
    const rows = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "review_snippet.unpublished"));
    expect(rows.length).toBe(1);
  });

  it("reorders the snippets", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const fid = await seedFiveStar({ firstName: `P${i}`, lastName: "X", place: "Nairobi", childCount: 1, comment: `c${i}` });
      const created = await post("/admin/review-snippets", creds, { feedbackId: fid });
      ids.push(created.json().snippet.id);
    }
    const res = await post("/admin/review-snippets/reorder", creds, { orderedIds: [ids[2], ids[0], ids[1]] });
    expect(res.statusCode).toBe(200);
    const rows = await dbh.db.select().from(reviewSnippets);
    const byId = new Map(rows.map((r) => [r.id, r.displayOrder]));
    expect(byId.get(ids[2]!)).toBe(0);
  });

  it("403s a non-permitted role (treasury cannot manage config)", async () => {
    const creds = await loginStaff("+254712000004", "7424");
    const res = await get("/admin/review-snippets", creds);
    expect(res.statusCode).toBe(403);
  });

  it("403s reception (no admin grant)", async () => {
    const fid = await seedFiveStar({ firstName: "Jane", lastName: "Wanjiru", place: "Nairobi", childCount: 2, comment: "Magic" });
    const creds = await loginStaff("+254712000003", "7423");
    const res = await post("/admin/review-snippets", creds, { feedbackId: fid });
    expect(res.statusCode).toBe(403);
  });

  it("401s an unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/review-snippets" });
    expect(res.statusCode).toBe(401);
  });

  it("403s a publish without a CSRF token (state-changing)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const fid = await seedFiveStar({ firstName: "Jane", lastName: "Wanjiru", place: "Nairobi", childCount: 2, comment: "Magic" });
    const created = await post("/admin/review-snippets", creds, { feedbackId: fid });
    const id = created.json().snippet.id;
    const res = await app.inject({
      method: "POST",
      url: `/admin/review-snippets/${id}/publish`,
      headers: { cookie: [creds.session, creds.csrfCookie].join("; ") }, // no x-csrf-token header
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });
});
