import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../testing.js";
import { feedback } from "./feedback.js";
import { parents } from "./parents.js";
import { users } from "./users.js";

/**
 * P6-E04-S01 (Story 34.1) — `feedback` schema. One open invitation per completed
 * paid touchpoint; the rating (0..5) + ≤200-char comment land on submit. AC3
 * idempotency is backed by the UNIQUE (source_type, source_id) constraint. The
 * public `token` backs the SMS one-tap link.
 */
describe("feedback schema (P6-E04-S01 / Story 34.1)", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seedParent(phone = "+254700000001") {
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Amina", lastName: "Mum" });
    return u!.id;
  }

  it("inserts an open invitation (rating/submitted_at NULL, token + invited_at set)", async () => {
    const parentId = await seedParent();
    const [row] = await dbh.db
      .insert(feedback)
      .values({ sourceType: "salon", sourceId: "att-1", parentId })
      .returning();
    expect(row!.sourceType).toBe("salon");
    expect(row!.sourceId).toBe("att-1");
    expect(row!.parentId).toBe(parentId);
    expect(row!.rating).toBeNull();
    expect(row!.submittedAt).toBeNull();
    expect(row!.token).toBeTruthy();
    expect(row!.invitedAt).toBeInstanceOf(Date);
  });

  it("enforces ONE invitation per (source_type, source_id) — AC3 idempotency", async () => {
    const parentId = await seedParent();
    await dbh.db.insert(feedback).values({ sourceType: "salon", sourceId: "att-1", parentId });
    await expect(
      dbh.db.insert(feedback).values({ sourceType: "salon", sourceId: "att-1", parentId }),
    ).rejects.toThrow();
  });

  it("allows the same source_id under a different source_type", async () => {
    const parentId = await seedParent();
    await dbh.db.insert(feedback).values({ sourceType: "salon", sourceId: "x1", parentId });
    await expect(
      dbh.db.insert(feedback).values({ sourceType: "order", sourceId: "x1", parentId }),
    ).resolves.toBeDefined();
  });

  it("rejects a rating outside 0..5 (CHECK)", async () => {
    const parentId = await seedParent();
    const [row] = await dbh.db
      .insert(feedback)
      .values({ sourceType: "salon", sourceId: "att-9", parentId })
      .returning();
    await expect(
      dbh.db.update(feedback).set({ rating: 6 }).where(eq(feedback.id, row!.id)),
    ).rejects.toThrow();
    await expect(
      dbh.db.update(feedback).set({ rating: -1 }).where(eq(feedback.id, row!.id)),
    ).rejects.toThrow();
  });

  it("accepts every valid star (0..5)", async () => {
    const parentId = await seedParent();
    for (const stars of [0, 1, 2, 3, 4, 5]) {
      const [row] = await dbh.db
        .insert(feedback)
        .values({ sourceType: "salon", sourceId: `s-${stars}`, parentId, rating: stars })
        .returning();
      expect(row!.rating).toBe(stars);
    }
  });

  it("rejects a comment longer than 200 chars (CHECK)", async () => {
    const parentId = await seedParent();
    const [row] = await dbh.db
      .insert(feedback)
      .values({ sourceType: "salon", sourceId: "att-c", parentId })
      .returning();
    await expect(
      dbh.db
        .update(feedback)
        .set({ comment: "x".repeat(201) })
        .where(eq(feedback.id, row!.id)),
    ).rejects.toThrow();
  });

  it("enforces a unique public token", async () => {
    const parentId = await seedParent();
    const [a] = await dbh.db
      .insert(feedback)
      .values({ sourceType: "salon", sourceId: "t-1", parentId })
      .returning();
    await expect(
      dbh.db
        .insert(feedback)
        .values({ sourceType: "salon", sourceId: "t-2", parentId, token: a!.token }),
    ).rejects.toThrow();
  });
});
