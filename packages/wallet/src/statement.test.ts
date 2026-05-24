import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { users, wallets, walletLedger } from "@bm/db";
import {
  generateStatementCsv,
  formatCents,
  isAsyncRange,
  STATEMENT_COLUMNS,
  SYNC_RANGE_MAX_MONTHS,
} from "./statement.js";

describe("wallet statement CSV (P1-E03-S08)", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  let seq = 0;
  async function seedWallet(): Promise<string> {
    seq += 1;
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: `+25472${String(4000000 + seq).slice(-7)}`, pinHash: "x" })
      .returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    return w!.id;
  }

  async function postEntry(
    walletId: string,
    amount: number,
    kind: string,
    direction: string,
    source: string,
    key: string,
    createdAt: Date,
  ) {
    await dbh.db.insert(walletLedger).values({
      walletId,
      amount,
      direction,
      kind,
      idempotencyKey: key,
      postedBy: "system",
      source,
      createdAt,
    });
  }

  const range = (from: string, to: string) => ({ from: new Date(from), to: new Date(to) });

  describe("formatCents", () => {
    it("formats integer cents to KES with two decimals", () => {
      expect(formatCents(150_000)).toBe("1500.00");
      expect(formatCents(5)).toBe("0.05");
      expect(formatCents(0)).toBe("0.00");
      expect(formatCents(-50_000)).toBe("-500.00");
      expect(formatCents(-7)).toBe("-0.07");
    });
  });

  it("emits exactly the required columns in order (AC1)", async () => {
    const walletId = await seedWallet();
    const csv = await generateStatementCsv(dbh.db, {
      walletId,
      range: range("2026-01-01", "2026-12-31"),
    });
    const header = csv.split("\r\n")[0];
    expect(header).toBe("timestamp,kind,direction,amount,balance after,reference");
    expect(STATEMENT_COLUMNS).toEqual([
      "timestamp",
      "kind",
      "direction",
      "amount",
      "balance after",
      "reference",
    ]);
  });

  it("orders chronologically and computes a correct running balance-after (AC1)", async () => {
    const walletId = await seedWallet();
    // Insert out of order to prove ordering.
    await postEntry(walletId, -20_000, "debit", "debit", "checkin", "b", new Date("2026-03-02T10:00:00Z"));
    await postEntry(walletId, 100_000, "topup", "credit", "mpesa", "a", new Date("2026-03-01T10:00:00Z"));
    await postEntry(walletId, 50_000, "topup", "credit", "cash", "c", new Date("2026-03-03T10:00:00Z"));

    const csv = await generateStatementCsv(dbh.db, {
      walletId,
      range: range("2026-01-01", "2026-12-31"),
    });
    const lines = csv.trimEnd().split("\r\n");
    // header + 3 rows
    expect(lines).toHaveLength(4);
    // chronological order: topup 1000, debit -200, topup 500
    expect(lines[1]).toContain("1000.00,1000.00,mpesa");
    expect(lines[2]).toContain("-200.00,800.00,checkin");
    expect(lines[3]).toContain("500.00,1300.00,cash");
  });

  it("seeds running balance from postings before the window start (AC1)", async () => {
    const walletId = await seedWallet();
    // Pre-window credit of 1000 — not in the window, but seeds the balance.
    await postEntry(walletId, 100_000, "topup", "credit", "mpesa", "pre", new Date("2025-12-01T10:00:00Z"));
    // In-window debit of 200.
    await postEntry(walletId, -20_000, "debit", "debit", "checkin", "in", new Date("2026-02-01T10:00:00Z"));

    const csv = await generateStatementCsv(dbh.db, {
      walletId,
      range: range("2026-01-01", "2026-06-30"),
    });
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(2); // header + 1 in-window row
    // balance-after = 1000 (seed) - 200 = 800
    expect(lines[1]).toContain("-200.00,800.00,checkin");
  });

  it("returns a header-only CSV when the window is empty (empty case)", async () => {
    const walletId = await seedWallet();
    const csv = await generateStatementCsv(dbh.db, {
      walletId,
      range: range("2026-01-01", "2026-12-31"),
    });
    expect(csv).toBe("timestamp,kind,direction,amount,balance after,reference\r\n");
  });

  it("scopes to the requested wallet only", async () => {
    const a = await seedWallet();
    const b = await seedWallet();
    await postEntry(a, 100_000, "topup", "credit", "mpesa", "a1", new Date("2026-03-01T10:00:00Z"));
    await postEntry(b, 999_000, "topup", "credit", "mpesa", "b1", new Date("2026-03-01T10:00:00Z"));

    const csv = await generateStatementCsv(dbh.db, {
      walletId: a,
      range: range("2026-01-01", "2026-12-31"),
    });
    expect(csv).toContain("1000.00");
    expect(csv).not.toContain("9990.00");
  });

  describe("isAsyncRange (AC3)", () => {
    it("treats a ≤ 12-month range as sync", () => {
      expect(isAsyncRange(range("2026-01-01", "2026-12-31"))).toBe(false);
      expect(isAsyncRange(range("2026-01-01", "2027-01-01"))).toBe(false);
    });
    it("treats a > 12-month range as async", () => {
      expect(isAsyncRange(range("2026-01-01", "2027-01-02"))).toBe(true);
      expect(isAsyncRange(range("2024-01-01", "2026-01-01"))).toBe(true);
    });
    it("exposes the cutoff constant", () => {
      expect(SYNC_RANGE_MAX_MONTHS).toBe(12);
    });
  });
});
