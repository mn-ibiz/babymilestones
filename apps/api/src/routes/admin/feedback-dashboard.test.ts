import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { auditOutbox, feedback, parents, staff, users } from "@bm/db";
import { eq } from "drizzle-orm";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P6-E04-S02 (Story 34.2) — admin feedback dashboard API. Integration via
 * app.inject with real staff sessions (+ CSRF). The dashboard is READ-ONLY and
 * gated to the report-reading roles. Individual responses are ANONYMISED by
 * default; DE-ANONYMISING (revealing the parent) is gated to admin / super_admin
 * and writes a `feedback.deanonymised` audit row (AC3).
 *
 *   GET /admin/feedback-dashboard?fromDate&toDate          — unit + staff aggregates (AC1/AC2).
 *   GET /admin/feedback-dashboard/responses?...            — anonymised responses (AC3).
 *   GET /admin/feedback-dashboard/responses?...&reveal=true — de-anonymised + audited (AC3).
 */

const RANGE = { fromDate: "2026-06-01", toDate: "2026-06-30" } as const;
let phoneSeq = 0;
const nextPhone = () => `+25471${String(9_000_000 + phoneSeq++).padStart(7, "0")}`;

describe("Admin feedback-dashboard API (P6-E04-S02)", () => {
  let dbh: TestDb;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { session, csrfCookie };
  };
  type Creds = Awaited<ReturnType<typeof loginStaff>>;

  const get = (url: string, creds: Creds) =>
    app.inject({ method: "GET", url, headers: { cookie: [creds.session, creds.csrfCookie].join("; ") } });

  async function seedParent(firstName: string, lastName: string) {
    const [u] = await dbh.db.insert(users).values({ phone: nextPhone(), pinHash: "x" }).returning();
    const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName, lastName }).returning();
    return { userId: u!.id, parentId: p!.id };
  }
  async function seedStaff(displayName: string) {
    const [s] = await dbh.db.insert(staff).values({ displayName, role: "stylist" }).returning();
    return s!.id;
  }
  async function seedFeedback(opts: {
    sourceType: string;
    sourceId: string;
    parentUserId: string;
    staffId?: string | null;
    rating: number;
    comment?: string | null;
    submittedAt: Date;
  }) {
    const [f] = await dbh.db
      .insert(feedback)
      .values({
        sourceType: opts.sourceType,
        sourceId: opts.sourceId,
        parentId: opts.parentUserId,
        attributedStaffId: opts.staffId ?? null,
        rating: opts.rating,
        comment: opts.comment ?? null,
        submittedAt: opts.submittedAt,
        invitedAt: new Date("2026-06-01T08:00:00Z"),
      })
      .returning();
    return f!;
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000002", "7422", "super_admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000004", "7424", "treasury"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000005", "7425", "accountant"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  async function seedRatings() {
    const pat = await seedParent("Pat", "Doe");
    const asha = await seedStaff("Asha");
    const bree = await seedStaff("Bree");
    // 5 salon ratings for Asha (>= threshold).
    for (let i = 0; i < 5; i++) {
      await seedFeedback({ sourceType: "salon", sourceId: `a${i}`, parentUserId: pat.userId, staffId: asha, rating: i < 4 ? 5 : 1, comment: i === 0 ? "Great" : null, submittedAt: new Date(`2026-06-1${i}T10:00:00Z`) });
    }
    // 2 coaching ratings for Bree (< threshold).
    await seedFeedback({ sourceType: "coaching", sourceId: "b0", parentUserId: pat.userId, staffId: bree, rating: 2, submittedAt: new Date("2026-06-12T10:00:00Z") });
    await seedFeedback({ sourceType: "coaching", sourceId: "b1", parentUserId: pat.userId, staffId: bree, rating: 4, submittedAt: new Date("2026-06-13T10:00:00Z") });
    return { pat, asha, bree };
  }

  it("returns per-unit + per-staff aggregates with the min-sample guardrail (AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const { asha, bree } = await seedRatings();
    const res = await get(`/admin/feedback-dashboard?fromDate=${RANGE.fromDate}&toDate=${RANGE.toDate}`, creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalResponses).toBe(7);
    const salon = body.units.find((u: { unit: string }) => u.unit === "salon");
    expect(salon.count).toBe(5);
    expect(salon.distribution).toEqual([0, 1, 0, 0, 0, 4]);
    const ashaStaff = body.staff.find((s: { staffId: string }) => s.staffId === asha);
    expect(ashaStaff.enoughSamples).toBe(true);
    expect(ashaStaff.average).toBeCloseTo((5 + 5 + 5 + 5 + 1) / 5, 5);
    const breeStaff = body.staff.find((s: { staffId: string }) => s.staffId === bree);
    expect(breeStaff.count).toBe(2);
    expect(breeStaff.enoughSamples).toBe(false);
    expect(breeStaff.average).toBeNull();
  });

  it("filters by date range — excludes out-of-window submissions (AC2)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const pat = await seedParent("Pat", "Doe");
    await seedFeedback({ sourceType: "salon", sourceId: "in", parentUserId: pat.userId, rating: 5, submittedAt: new Date("2026-06-15T10:00:00Z") });
    await seedFeedback({ sourceType: "salon", sourceId: "out", parentUserId: pat.userId, rating: 1, submittedAt: new Date("2026-07-15T10:00:00Z") });
    const res = await get(`/admin/feedback-dashboard?fromDate=2026-06-01&toDate=2026-06-30`, creds);
    expect(res.json().totalResponses).toBe(1);
  });

  it("400s an invalid date range (AC2)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await get(`/admin/feedback-dashboard?fromDate=2026-06-30&toDate=2026-06-01`, creds);
    expect(res.statusCode).toBe(400);
  });

  it("responses are ANONYMISED by default — no parent identity in the payload (AC3)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    await seedRatings();
    const res = await get(`/admin/feedback-dashboard/responses?fromDate=${RANGE.fromDate}&toDate=${RANGE.toDate}&unit=salon`, creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.responses.length).toBeGreaterThan(0);
    for (const r of body.responses) {
      expect(r.parentId).toBeUndefined();
      expect(r.parentName).toBeUndefined();
    }
    // Belt-and-braces: the parent's name never appears anywhere in the payload.
    expect(JSON.stringify(body)).not.toContain("Pat");
  });

  it("filters responses by staff (AC3)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const { bree } = await seedRatings();
    const res = await get(`/admin/feedback-dashboard/responses?fromDate=${RANGE.fromDate}&toDate=${RANGE.toDate}&staffId=${bree}`, creds);
    expect(res.statusCode).toBe(200);
    expect(res.json().responses.every((r: { staffName: string }) => r.staffName === "Bree")).toBe(true);
  });

  it("reveal=true returns parent identity AND writes a feedback.deanonymised audit row (AC3)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    await seedRatings();
    const res = await get(`/admin/feedback-dashboard/responses?fromDate=${RANGE.fromDate}&toDate=${RANGE.toDate}&unit=salon&reveal=true`, creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.responses[0].parentName).toBe("Pat Doe");
    expect(body.responses[0].parentId).toBeTruthy();
    // The reveal is audited.
    const rows = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "feedback.deanonymised"));
    expect(rows.length).toBe(1);
    // Audit payload carries the window + counts but never the comment text.
    expect(JSON.stringify(rows[0]!.payload)).not.toContain("Great");
  });

  it("403s a reveal for treasury — too weak a permission to de-anonymise (AC3)", async () => {
    const creds = await loginStaff("+254712000004", "7424");
    await seedRatings();
    const res = await get(`/admin/feedback-dashboard/responses?fromDate=${RANGE.fromDate}&toDate=${RANGE.toDate}&reveal=true`, creds);
    expect(res.statusCode).toBe(403);
    // No audit row written on a denied reveal.
    const rows = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "feedback.deanonymised"));
    expect(rows.length).toBe(0);
  });

  it("treasury may still read the anonymised dashboard + responses (AC3)", async () => {
    const creds = await loginStaff("+254712000004", "7424");
    await seedRatings();
    const dash = await get(`/admin/feedback-dashboard?fromDate=${RANGE.fromDate}&toDate=${RANGE.toDate}`, creds);
    expect(dash.statusCode).toBe(200);
    const resp = await get(`/admin/feedback-dashboard/responses?fromDate=${RANGE.fromDate}&toDate=${RANGE.toDate}`, creds);
    expect(resp.statusCode).toBe(200);
  });

  it("403s a non-permitted role (reception)", async () => {
    const res = await get(`/admin/feedback-dashboard?fromDate=${RANGE.fromDate}&toDate=${RANGE.toDate}`, await loginStaff("+254712000003", "7423"));
    expect(res.statusCode).toBe(403);
  });

  it("401s an unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: `/admin/feedback-dashboard?fromDate=${RANGE.fromDate}&toDate=${RANGE.toDate}` });
    expect(res.statusCode).toBe(401);
  });
});
