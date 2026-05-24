import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, users, wallets, walletLedger } from "@bm/db";
import { createWalletStatementJob, type StatementRequest } from "./wallet-statement.js";

describe("wallet-statement job (P1-E03-S08 async path)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let walletId: string;
  let userId: string;

  beforeEach(async () => {
    dbh = await createTestDb();
    const [u] = await dbh.db.insert(users).values({ phone: "+254712345678", pinHash: "x" }).returning();
    userId = u!.id;
    const [w] = await dbh.db.insert(wallets).values({ userId }).returning();
    walletId = w!.id;
    await dbh.db.insert(walletLedger).values({
      walletId,
      amount: 100_000,
      direction: "credit",
      kind: "topup",
      idempotencyKey: "k1",
      postedBy: "system",
      source: "mpesa",
      createdAt: new Date("2024-06-01T10:00:00Z"),
    });
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("registers under the name 'wallet-statement'", () => {
    const job = createWalletStatementJob({ db: dbh.db, dequeue: () => [], deliver: () => {} });
    expect(job.name).toBe("wallet-statement");
  });

  it("renders a long-range CSV, delivers it, and audits completion", async () => {
    const req: StatementRequest = {
      walletId,
      from: "2024-01-01T00:00:00.000Z",
      to: "2026-01-01T00:00:00.000Z",
      requestedBy: userId,
    };
    const delivered: { req: StatementRequest; csv: string }[] = [];
    await createWalletStatementJob({
      db: dbh.db,
      dequeue: () => [req],
      deliver: (r, csv) => {
        delivered.push({ req: r, csv });
      },
    }).run();

    expect(delivered).toHaveLength(1);
    expect(delivered[0]!.csv).toContain("timestamp,kind,direction,amount,balance after,reference");
    expect(delivered[0]!.csv).toContain("1000.00,1000.00,mpesa");

    const completions = (await dbh.db.select().from(auditOutbox)).filter(
      (r) => r.action === "wallet.statement.export.completed",
    );
    expect(completions).toHaveLength(1);
    expect(completions[0]!.targetId).toBe(walletId);
  });
});
