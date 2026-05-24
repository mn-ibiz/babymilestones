import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { dataExports, parents, smsOutbox, users } from "@bm/db";
import { InMemoryExportStorage } from "@bm/export";
import { createDataExportJob } from "./data-export.js";

describe("data-export job (P1-E02-S05)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let userId: string;

  beforeEach(async () => {
    dbh = await createTestDb();
    const [u] = await dbh.db.insert(users).values({ phone: "+254712345678" }).returning();
    userId = u!.id;
    await dbh.db
      .insert(parents)
      .values({ userId, firstName: "Amina", lastName: "Otieno" });
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("registers under the name 'data-export'", () => {
    const job = createDataExportJob({ db: dbh.db, storage: new InMemoryExportStorage() });
    expect(job.name).toBe("data-export");
  });

  it("drains pending exports: stores ZIP, sets token, SMSes link", async () => {
    const storage = new InMemoryExportStorage();
    await dbh.db.insert(dataExports).values({ userId });

    await createDataExportJob({ db: dbh.db, storage }).run();

    const [row] = await dbh.db.select().from(dataExports);
    expect(row!.status).toBe("ready");
    expect(row!.downloadToken).toBeTruthy();
    expect(await storage.get(row!.storageKey!)).not.toBeNull();
    expect(await dbh.db.select().from(smsOutbox)).toHaveLength(1);
  });
});
