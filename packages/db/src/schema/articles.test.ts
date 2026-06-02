import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../testing.js";
import { articles } from "./articles.js";
import { users } from "./users.js";

/**
 * P6-E06-S04 (Story 36.4) — `articles` schema. A slugged, tagged, authored
 * markdown post with a draft/published lifecycle (AC1). Slug is unique; tags are a
 * Postgres text[]; status is CHECK-constrained to draft|published.
 */
describe("articles schema (P6-E06-S04 / Story 36.4)", () => {
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

  it("inserts a draft article with tags + cover, defaults applied (AC1)", async () => {
    const adminId = await seedAdmin();
    const [row] = await dbh.db
      .insert(articles)
      .values({
        slug: "weaning-101",
        title: "Weaning 101",
        bodyMd: "# Hello\n\nSome advice.",
        coverImageUrl: "https://cdn/x.jpg",
        tags: ["nutrition", "0-1y"],
        author: "Dr. Mary",
        createdBy: adminId,
      })
      .returning();
    expect(row!.slug).toBe("weaning-101");
    expect(row!.status).toBe("draft");
    expect(row!.publishedAt).toBeNull();
    expect(row!.tags).toEqual(["nutrition", "0-1y"]);
    expect(row!.coverImageUrl).toBe("https://cdn/x.jpg");
  });

  it("defaults tags to an empty array + cover to null", async () => {
    const adminId = await seedAdmin();
    const [row] = await dbh.db
      .insert(articles)
      .values({ slug: "no-extras", title: "T", bodyMd: "B", author: "A", createdBy: adminId })
      .returning();
    expect(row!.tags).toEqual([]);
    expect(row!.coverImageUrl).toBeNull();
  });

  it("enforces a UNIQUE slug", async () => {
    const adminId = await seedAdmin();
    await dbh.db
      .insert(articles)
      .values({ slug: "dup", title: "A", bodyMd: "B", author: "X", createdBy: adminId });
    await expect(
      dbh.db
        .insert(articles)
        .values({ slug: "dup", title: "B", bodyMd: "B", author: "Y", createdBy: adminId }),
    ).rejects.toThrow();
  });

  it("rejects an unknown status (CHECK)", async () => {
    const adminId = await seedAdmin();
    await expect(
      dbh.db
        .insert(articles)
        .values({ slug: "bad-status", title: "A", bodyMd: "B", author: "X", status: "archived", createdBy: adminId }),
    ).rejects.toThrow();
  });

  it("rejects an empty title (CHECK)", async () => {
    const adminId = await seedAdmin();
    await expect(
      dbh.db
        .insert(articles)
        .values({ slug: "empty-title", title: "   ", bodyMd: "B", author: "X", createdBy: adminId }),
    ).rejects.toThrow();
  });
});
