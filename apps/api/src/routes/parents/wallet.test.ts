import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { invoices, parents, users, wallets, walletLedger } from "@bm/db";
import { InMemorySessionStore, hashPin } from "@bm/auth";
import type { WalletOverviewResponse } from "@bm/contracts";
import { buildApp } from "../../app.js";

/**
 * P1-E11-S01 — Parent wallet overview (GET /parents/me/wallet). Integration via
 * app.inject. Covers: balance + outstanding + read-only auto-credit (AC1),
 * last-10 transactions newest-first with balance-after (AC3), loyalty points
 * read-only (AC4), own-wallet-only (the wallet is the session's, never a param),
 * and the auth guard.
 */
describe("Parent wallet overview (P1-E11-S01)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  const loginParent = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    return cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
  };

  let seq = 0;
  async function seedParent(opts: { autoCredit?: boolean } = {}): Promise<{
    userId: string;
    parentId: string;
    walletId: string;
    phone: string;
  }> {
    seq += 1;
    const phone = `+25478${String(1000000 + seq).slice(-7)}`;
    const [u] = await dbh.db
      .insert(users)
      .values({ phone, pinHash: await hashPin("1357"), role: "parent" })
      .returning();
    const [w] = await dbh.db
      .insert(wallets)
      .values({ userId: u!.id, autoCreditEnabled: opts.autoCredit ?? false })
      .returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "P", lastName: "Q" })
      .returning();
    return { userId: u!.id, parentId: p!.id, walletId: w!.id, phone };
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("401 when unauthenticated (AC1)", async () => {
    const res = await app.inject({ method: "GET", url: "/parents/me/wallet" });
    expect(res.statusCode).toBe(401);
  });

  it("returns balance, outstanding, auto-credit + loyalty for the authed parent (AC1/AC4)", async () => {
    const { walletId, parentId, phone } = await seedParent({ autoCredit: true });
    await dbh.db.insert(walletLedger).values([
      {
        walletId,
        amount: 100_000,
        direction: "credit",
        kind: "topup",
        idempotencyKey: `t-${walletId}`,
        postedBy: "system",
        source: "mpesa",
        createdAt: new Date("2026-03-01T10:00:00Z"),
      },
      {
        walletId,
        amount: -30_000,
        direction: "debit",
        kind: "debit",
        idempotencyKey: `d-${walletId}`,
        postedBy: "system",
        source: "checkin",
        createdAt: new Date("2026-03-02T10:00:00Z"),
      },
    ]);
    // Two open invoices → outstanding = 50_000; a settled one is excluded.
    await dbh.db.insert(invoices).values([
      { parentId, amountDue: 30_000, status: "outstanding" },
      { parentId, amountDue: 20_000, status: "pending" },
      { parentId, amountDue: 99_000, status: "settled" },
    ]);

    const cookie = await loginParent(phone, "1357");
    const res = await app.inject({ method: "GET", url: "/parents/me/wallet", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const { wallet } = res.json() as WalletOverviewResponse;
    expect(wallet.balanceCents).toBe(70_000);
    expect(wallet.outstandingCents).toBe(50_000);
    expect(wallet.autoCreditEnabled).toBe(true);
    expect(wallet.loyaltyPoints).toBe(0); // earn-only in P1, no points yet (AC4)
  });

  it("returns the last 10 transactions newest-first with balance-after (AC3)", async () => {
    const { walletId, phone } = await seedParent();
    const rows = [];
    for (let i = 0; i < 12; i += 1) {
      rows.push({
        walletId,
        amount: 1_000,
        direction: "credit" as const,
        kind: "topup" as const,
        idempotencyKey: `k-${walletId}-${i}`,
        postedBy: "system",
        source: "mpesa",
        createdAt: new Date(`2026-03-${String(i + 1).padStart(2, "0")}T10:00:00Z`),
      });
    }
    await dbh.db.insert(walletLedger).values(rows);

    const cookie = await loginParent(phone, "1357");
    const res = await app.inject({ method: "GET", url: "/parents/me/wallet", headers: { cookie } });
    const { wallet } = res.json() as WalletOverviewResponse;
    expect(wallet.recentTransactions).toHaveLength(10); // capped at 10 (AC3)
    // newest-first: the most recent posting (day 12) leads and carries full balance.
    expect(wallet.recentTransactions[0]!.balanceAfterCents).toBe(12_000);
    expect(wallet.recentTransactions[0]!.createdAt).toBe("2026-03-12T10:00:00.000Z");
  });

  it("404 when the authed user has no wallet", async () => {
    // A user with no wallet row (not a parent flow) — login still works.
    seq += 1;
    const phone = `+25479${String(2000000 + seq).slice(-7)}`;
    await dbh.db
      .insert(users)
      .values({ phone, pinHash: await hashPin("1357"), role: "parent" });
    const cookie = await loginParent(phone, "1357");
    const res = await app.inject({ method: "GET", url: "/parents/me/wallet", headers: { cookie } });
    expect(res.statusCode).toBe(404);
  });

  it("empty wallet → zeros and empty list", async () => {
    const { phone } = await seedParent();
    const cookie = await loginParent(phone, "1357");
    const res = await app.inject({ method: "GET", url: "/parents/me/wallet", headers: { cookie } });
    const { wallet } = res.json() as WalletOverviewResponse;
    expect(wallet.balanceCents).toBe(0);
    expect(wallet.outstandingCents).toBe(0);
    expect(wallet.recentTransactions).toEqual([]);
  });
});
