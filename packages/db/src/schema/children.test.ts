import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../testing.js";
import { children } from "./children.js";
import { parents } from "./parents.js";
import { users } from "./users.js";

describe("children table (P1-E02-S03)", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seedParent(phone = "+254712345678"): Promise<string> {
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "Amina", lastName: "Otieno" })
      .returning();
    return p!.id;
  }

  it("stores a child with required fields and nullable optionals", async () => {
    const parentId = await seedParent();
    const [row] = await dbh.db
      .insert(children)
      .values({ parentId, firstName: "Zola", dateOfBirth: "2024-01-15" })
      .returning();
    expect(row!.firstName).toBe("Zola");
    expect(row!.dateOfBirth).toBe("2024-01-15");
    expect(row!.lastName).toBeNull();
    expect(row!.gender).toBeNull();
    expect(row!.allergiesNotes).toBeNull();
    expect(row!.archivedAt).toBeNull();
    expect(row!.createdAt).toBeInstanceOf(Date);
  });

  it("rejects a child for a non-existent parent (FK)", async () => {
    await expect(
      dbh.db.insert(children).values({
        parentId: "00000000-0000-0000-0000-000000000000",
        firstName: "Z",
        dateOfBirth: "2024-01-15",
      }),
    ).rejects.toThrow();
  });

  it("supports soft-delete via archived_at (AC4 — row is never removed)", async () => {
    const parentId = await seedParent();
    const [row] = await dbh.db
      .insert(children)
      .values({ parentId, firstName: "Zola", dateOfBirth: "2024-01-15" })
      .returning();
    const when = new Date();
    await dbh.db.update(children).set({ archivedAt: when }).where(eq(children.id, row!.id));
    const [after] = await dbh.db.select().from(children).where(eq(children.id, row!.id));
    expect(after!.archivedAt).toBeInstanceOf(Date);
    // The row itself remains so historical bookings stay intact.
    const all = await dbh.db.select().from(children);
    expect(all).toHaveLength(1);
  });
});
