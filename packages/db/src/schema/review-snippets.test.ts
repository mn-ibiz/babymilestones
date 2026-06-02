import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../testing.js";
import { feedback } from "./feedback.js";
import { parents } from "./parents.js";
import { reviewSnippets } from "./review-snippets.js";
import { users } from "./users.js";

/**
 * P6-E04-S04 (Story 34.4) — `review_snippets` schema. A curated projection of a
 * 5-star {@link feedback} comment: a quote + an ANONYMISED attribution label, with
 * a publish stamp (AC2) and an optional display order. At most one snippet per
 * feedback row; cascades when the underlying feedback is deleted.
 */
describe("review_snippets schema (P6-E04-S04 / Story 34.4)", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
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

  async function seedFeedback(rating = 5, comment: string | null = "Loved it"): Promise<string> {
    seq += 1;
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: `+254700${String(100000 + seq).slice(-6)}`, pinHash: "x" })
      .returning();
    await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Amina", lastName: "Mum" });
    const [f] = await dbh.db
      .insert(feedback)
      .values({ sourceType: "salon", sourceId: `att-${seq}`, parentId: u!.id, rating, comment, submittedAt: new Date() })
      .returning();
    return f!.id;
  }

  it("curates a snippet (quote + attribution, unpublished by default)", async () => {
    const adminId = await seedAdmin();
    const feedbackId = await seedFeedback();
    const [row] = await dbh.db
      .insert(reviewSnippets)
      .values({ feedbackId, quote: "Loved it", attributionLabel: "Parent of two, Nairobi", createdBy: adminId })
      .returning();
    expect(row!.feedbackId).toBe(feedbackId);
    expect(row!.quote).toBe("Loved it");
    expect(row!.attributionLabel).toBe("Parent of two, Nairobi");
    expect(row!.publishedAt).toBeNull();
    expect(row!.displayOrder).toBeNull();
    expect(row!.createdBy).toBe(adminId);
  });

  it("enforces ONE snippet per feedback row (unique)", async () => {
    const adminId = await seedAdmin();
    const feedbackId = await seedFeedback();
    await dbh.db.insert(reviewSnippets).values({ feedbackId, quote: "A", attributionLabel: "Parent, Nairobi", createdBy: adminId });
    await expect(
      dbh.db.insert(reviewSnippets).values({ feedbackId, quote: "B", attributionLabel: "Parent, Mombasa", createdBy: adminId }),
    ).rejects.toThrow();
  });

  it("rejects a quote longer than 200 chars (CHECK)", async () => {
    const adminId = await seedAdmin();
    const feedbackId = await seedFeedback();
    await expect(
      dbh.db
        .insert(reviewSnippets)
        .values({ feedbackId, quote: "x".repeat(201), attributionLabel: "Parent, Nairobi", createdBy: adminId }),
    ).rejects.toThrow();
  });

  it("rejects an attribution label longer than 120 chars (CHECK)", async () => {
    const adminId = await seedAdmin();
    const feedbackId = await seedFeedback();
    await expect(
      dbh.db
        .insert(reviewSnippets)
        .values({ feedbackId, quote: "ok", attributionLabel: "x".repeat(121), createdBy: adminId }),
    ).rejects.toThrow();
  });

  it("cascades when the underlying feedback is deleted", async () => {
    const adminId = await seedAdmin();
    const feedbackId = await seedFeedback();
    await dbh.db.insert(reviewSnippets).values({ feedbackId, quote: "A", attributionLabel: "Parent, Nairobi", createdBy: adminId });
    await dbh.db.delete(feedback).where(eq(feedback.id, feedbackId));
    const rows = await dbh.db.select().from(reviewSnippets).where(eq(reviewSnippets.feedbackId, feedbackId));
    expect(rows.length).toBe(0);
  });
});
