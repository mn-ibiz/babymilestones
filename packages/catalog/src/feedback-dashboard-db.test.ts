import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { feedback, parents, staff, users } from "@bm/db";
import {
  loadFeedbackDashboard,
  loadFeedbackResponses,
} from "./feedback-dashboard-db.js";

/**
 * P6-E04-S02 (Story 34.2) — DB read behind the feedback dashboard. DB-backed via
 * the PGlite harness. Verifies the read loads ONLY submitted feedback
 * (`submitted_at` set, with a rating) whose `submitted_at` falls in the inclusive
 * `[from, to]` window, joins the attributed staff for the display name, and rolls
 * up per unit + per staff with the min-sample guardrail (AC1/AC2). The individual-
 * response read returns the rows ANONYMISED by default and only joins the parent
 * identity when `reveal` is set (AC3).
 */
describe("loadFeedbackDashboard / loadFeedbackResponses (Story 34.2)", () => {
  let dbh: TestDb;
  let phoneSeq = 0;
  const nextPhone = () => `+25471${String(8_000_000 + phoneSeq++).padStart(7, "0")}`;

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

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
    rating: number | null;
    comment?: string | null;
    submittedAt: Date | null;
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

  it("rolls up submitted feedback in the window by unit + staff (AC1)", async () => {
    const pat = await seedParent("Pat", "Doe");
    const asha = await seedStaff("Asha");
    // 5 salon ratings for Asha (>= threshold) + one out-of-window + one pending.
    for (let i = 0; i < 5; i++) {
      await seedFeedback({
        sourceType: "salon",
        sourceId: `s${i}`,
        parentUserId: pat.userId,
        staffId: asha,
        rating: i < 4 ? 5 : 1,
        submittedAt: new Date(`2026-06-1${i}T10:00:00Z`),
      });
    }
    // Out of window (July).
    await seedFeedback({ sourceType: "salon", sourceId: "july", parentUserId: pat.userId, staffId: asha, rating: 1, submittedAt: new Date("2026-07-01T10:00:00Z") });
    // Pending (never submitted) — excluded.
    await seedFeedback({ sourceType: "salon", sourceId: "pending", parentUserId: pat.userId, staffId: asha, rating: null, submittedAt: null });

    const d = await loadFeedbackDashboard(dbh.db, { from: "2026-06-01", to: "2026-06-30" });
    expect(d.totalResponses).toBe(5);
    const salon = d.units.find((u) => u.unit === "salon")!;
    expect(salon.count).toBe(5);
    const s = d.staff.find((x) => x.staffId === asha)!;
    expect(s.staffName).toBe("Asha");
    expect(s.count).toBe(5);
    expect(s.enoughSamples).toBe(true);
    expect(s.average).toBeCloseTo((5 + 5 + 5 + 5 + 1) / 5, 5);
  });

  it("suppresses a staff average below the sample threshold (AC1 guardrail)", async () => {
    const pat = await seedParent("Pat", "Doe");
    const bree = await seedStaff("Bree");
    await seedFeedback({ sourceType: "salon", sourceId: "x1", parentUserId: pat.userId, staffId: bree, rating: 1, submittedAt: new Date("2026-06-10T10:00:00Z") });
    const d = await loadFeedbackDashboard(dbh.db, { from: "2026-06-01", to: "2026-06-30" });
    const s = d.staff.find((x) => x.staffId === bree)!;
    expect(s.count).toBe(1);
    expect(s.enoughSamples).toBe(false);
    expect(s.average).toBeNull();
  });

  it("loadFeedbackResponses returns ANONYMISED rows by default (no parent identity) (AC3)", async () => {
    const pat = await seedParent("Pat", "Doe");
    const asha = await seedStaff("Asha");
    await seedFeedback({
      sourceType: "salon",
      sourceId: "r1",
      parentUserId: pat.userId,
      staffId: asha,
      rating: 4,
      comment: "Great cut",
      submittedAt: new Date("2026-06-12T10:00:00Z"),
    });

    const rows = await loadFeedbackResponses(dbh.db, { from: "2026-06-01", to: "2026-06-30" });
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.rating).toBe(4);
    expect(r.comment).toBe("Great cut");
    expect(r.unit).toBe("salon");
    expect(r.staffName).toBe("Asha");
    // No parent identity in the default (anonymised) projection.
    expect(r.parentId).toBeUndefined();
    expect(r.parentName).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain("Pat");
  });

  it("loadFeedbackResponses with reveal joins the parent identity (AC3)", async () => {
    const pat = await seedParent("Pat", "Doe");
    const asha = await seedStaff("Asha");
    await seedFeedback({ sourceType: "salon", sourceId: "r2", parentUserId: pat.userId, staffId: asha, rating: 4, submittedAt: new Date("2026-06-12T10:00:00Z") });

    const rows = await loadFeedbackResponses(dbh.db, { from: "2026-06-01", to: "2026-06-30", reveal: true });
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.parentId).toBe(pat.userId);
    expect(r.parentName).toBe("Pat Doe");
  });

  it("loadFeedbackResponses filters by unit + staff (AC3)", async () => {
    const pat = await seedParent("Pat", "Doe");
    const asha = await seedStaff("Asha");
    const bree = await seedStaff("Bree");
    await seedFeedback({ sourceType: "salon", sourceId: "u1", parentUserId: pat.userId, staffId: asha, rating: 5, submittedAt: new Date("2026-06-12T10:00:00Z") });
    await seedFeedback({ sourceType: "coaching", sourceId: "u2", parentUserId: pat.userId, staffId: bree, rating: 3, submittedAt: new Date("2026-06-12T10:00:00Z") });

    const byUnit = await loadFeedbackResponses(dbh.db, { from: "2026-06-01", to: "2026-06-30", unit: "salon" });
    expect(byUnit.map((r) => r.unit)).toEqual(["salon"]);

    const byStaff = await loadFeedbackResponses(dbh.db, { from: "2026-06-01", to: "2026-06-30", staffId: bree });
    expect(byStaff.map((r) => r.staffName)).toEqual(["Bree"]);
  });
});
