import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../testing.js";
import { parents } from "./parents.js";
import { users } from "./users.js";

describe("parents table (P1-E02-S01)", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seedUser(): Promise<string> {
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: "+254712345678", pinHash: "x" })
      .returning();
    return u!.id;
  }

  it("stores a profile with required names and nullable optionals", async () => {
    const userId = await seedUser();
    const [row] = await dbh.db
      .insert(parents)
      .values({ userId, firstName: "Amina", lastName: "Otieno" })
      .returning();
    expect(row!.firstName).toBe("Amina");
    expect(row!.email).toBeNull();
    expect(row!.residentialArea).toBeNull();
    expect(row!.createdAt).toBeInstanceOf(Date);
  });

  it("stores a jsonb acquisition_source and defaults it to null (P1-E12-S03)", async () => {
    const userId = await seedUser();
    const [row] = await dbh.db
      .insert(parents)
      .values({
        userId,
        firstName: "Amina",
        lastName: "Otieno",
        acquisitionSource: { source: "whatsapp", campaign: "play-launch" },
      })
      .returning();
    expect(row!.acquisitionSource).toEqual({ source: "whatsapp", campaign: "play-launch" });

    const [u2] = await dbh.db
      .insert(users)
      .values({ phone: "+254700000000", pinHash: "x" })
      .returning();
    const [organic] = await dbh.db
      .insert(parents)
      .values({ userId: u2!.id, firstName: "B", lastName: "C" })
      .returning();
    expect(organic!.acquisitionSource).toBeNull();
  });

  it("enforces one profile per user (unique user_id)", async () => {
    const userId = await seedUser();
    await dbh.db.insert(parents).values({ userId, firstName: "A", lastName: "B" });
    await expect(
      dbh.db.insert(parents).values({ userId, firstName: "C", lastName: "D" }),
    ).rejects.toThrow();
  });

  it("rejects a profile for a non-existent user (FK)", async () => {
    await expect(
      dbh.db
        .insert(parents)
        .values({
          userId: "00000000-0000-0000-0000-000000000000",
          firstName: "A",
          lastName: "B",
        }),
    ).rejects.toThrow();
  });

  it("supports updating a profile in place", async () => {
    const userId = await seedUser();
    await dbh.db.insert(parents).values({ userId, firstName: "A", lastName: "B" });
    await dbh.db
      .update(parents)
      .set({ firstName: "Amina", email: "a@example.com" })
      .where(eq(parents.userId, userId));
    const [row] = await dbh.db.select().from(parents).where(eq(parents.userId, userId));
    expect(row!.firstName).toBe("Amina");
    expect(row!.email).toBe("a@example.com");
  });
});
