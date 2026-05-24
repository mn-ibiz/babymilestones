import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "./testing.js";
import { audit } from "./audit.js";
import { auditOutbox } from "./schema/audit.js";

describe("audit_outbox + audit() helper (X5-S01)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("inserts a row with all fields; processed_at NULL on write (AC1, AC2)", async () => {
    const row = await audit(dbh.db, {
      actor: null,
      action: "auth.signup",
      target: { table: "users", id: "u-1" },
      payload: { ip: "127.0.0.1" },
    });
    expect(row.action).toBe("auth.signup");
    expect(row.targetTable).toBe("users");
    expect(row.targetId).toBe("u-1");
    expect(row.payload).toEqual({ ip: "127.0.0.1" });
    expect(row.processedAt).toBeNull();
    expect(row.createdAt).toBeInstanceOf(Date);

    const all = await dbh.db.select().from(auditOutbox);
    expect(all).toHaveLength(1);
  });

  it("rolls back atomically with the enclosing business transaction (AC3)", async () => {
    await expect(
      dbh.db.transaction(async (tx) => {
        await audit(tx, { action: "wallet.debit", target: { table: "wallet_ledger", id: "L1" } });
        throw new Error("boom"); // simulate the business write failing after the audit insert
      }),
    ).rejects.toThrow("boom");

    const all = await dbh.db.select().from(auditOutbox);
    expect(all).toHaveLength(0); // the audit row is the durable guarantee: it lives/dies with the TX
  });

  it("commits with the enclosing transaction", async () => {
    await dbh.db.transaction(async (tx) => {
      await audit(tx, { action: "auth.login", target: { table: "users", id: "u-2" } });
    });
    const all = await dbh.db.select().from(auditOutbox);
    expect(all).toHaveLength(1);
    expect(all[0]!.action).toBe("auth.login");
  });
});
