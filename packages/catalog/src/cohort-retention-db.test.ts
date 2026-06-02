import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { parents, users, wallets, walletLedger } from "@bm/db";
import { loadCohortRetention } from "./cohort-retention-db.js";

/**
 * Story 35.2 — DB read behind the cohort-retention matrix. DB-backed via the PGlite
 * harness. Verifies the read derives each parent's SIGNUP month from
 * `parents.created_at`, restricts the cohorts to `[fromMonth, toMonth]`, and derives
 * each parent's ACTIVE-month set from the default paid-touchpoint signal — wallet
 * `debit` ledger entries (real money spent on a service) — then hands the projection
 * to the pure {@link aggregateCohortRetention} reducer (AC1/AC2). The active signal is
 * overridable; the default is verified here.
 */
describe("loadCohortRetention (Story 35.2)", () => {
  let dbh: TestDb;
  let phoneSeq = 0;
  let keySeq = 0;
  const nextPhone = () => `+25470${String(2_000_000 + phoneSeq++).padStart(7, "0")}`;
  const nextKey = () => `cr-test:${keySeq++}`;

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  /** `YYYY-MM` (+ optional day) → a midday UTC instant in that month. */
  const at = (month: string, day = 15) => new Date(`${month}-${String(day).padStart(2, "0")}T12:00:00.000Z`);

  async function seedParent(opts: { signup: Date; firstName?: string }) {
    const [u] = await dbh.db.insert(users).values({ phone: nextPhone(), pinHash: "x" }).returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({
        userId: u!.id,
        firstName: opts.firstName ?? "P",
        lastName: "Test",
        createdAt: opts.signup,
      })
      .returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    return { parentId: p!.id, userId: u!.id, walletId: w!.id };
  }

  /** Post a wallet `debit` (a paid touchpoint) at the given instant. */
  async function seedDebit(walletId: string, createdAt: Date, amountCents = 1000) {
    await dbh.db.insert(walletLedger).values({
      walletId,
      amount: -amountCents,
      direction: "debit",
      kind: "debit",
      idempotencyKey: nextKey(),
      postedBy: "system",
      source: "checkin",
      createdAt,
    });
  }

  it("derives signup month from parents.created_at and active months from wallet debits (AC1/AC2)", async () => {
    // Parent signed up in Jan; paid in Jan (offset 0) + Mar (offset 2), not Feb.
    const a = await seedParent({ signup: at("2026-01"), firstName: "Ann" });
    await seedDebit(a.walletId, at("2026-01"));
    await seedDebit(a.walletId, at("2026-03"));

    const m = await loadCohortRetention(dbh.db, {
      fromMonth: "2026-01",
      toMonth: "2026-01",
      asOfMonth: "2026-03",
    });
    expect(m.cohorts).toHaveLength(1);
    const c = m.cohorts[0]!;
    expect(c.signupMonth).toBe("2026-01");
    expect(c.cohortSize).toBe(1);
    const byOffset = Object.fromEntries(c.cells.map((x) => [x.offset, x]));
    expect(byOffset[0]).toMatchObject({ retained: 1, percentage: 100 });
    expect(byOffset[1]).toMatchObject({ retained: 0, percentage: 0 });
    expect(byOffset[2]).toMatchObject({ retained: 1, percentage: 100 });
  });

  it("computes a cohort percentage across multiple parents (AC1)", async () => {
    const a = await seedParent({ signup: at("2026-02") });
    const b = await seedParent({ signup: at("2026-02") });
    const cc = await seedParent({ signup: at("2026-02") });
    const d = await seedParent({ signup: at("2026-02") });
    // Offset 0 (Feb): a,b,d paid → 3/4 = 75%.
    await seedDebit(a.walletId, at("2026-02"));
    await seedDebit(b.walletId, at("2026-02"));
    await seedDebit(d.walletId, at("2026-02"));
    // c has no Feb debit.
    void cc;

    const m = await loadCohortRetention(dbh.db, {
      fromMonth: "2026-02",
      toMonth: "2026-02",
      asOfMonth: "2026-02",
    });
    expect(m.cohorts[0]!.cohortSize).toBe(4);
    expect(m.cohorts[0]!.cells[0]).toMatchObject({ retained: 3, percentage: 75 });
  });

  it("restricts cohorts to [fromMonth, toMonth] (date-range cohort selection)", async () => {
    const early = await seedParent({ signup: at("2026-01") });
    const inRange = await seedParent({ signup: at("2026-02") });
    const late = await seedParent({ signup: at("2026-03") });
    await seedDebit(early.walletId, at("2026-01"));
    await seedDebit(inRange.walletId, at("2026-02"));
    await seedDebit(late.walletId, at("2026-03"));

    const m = await loadCohortRetention(dbh.db, {
      fromMonth: "2026-02",
      toMonth: "2026-02",
      asOfMonth: "2026-03",
    });
    expect(m.cohorts.map((c) => c.signupMonth)).toEqual(["2026-02"]);
    expect(m.cohorts[0]!.cohortSize).toBe(1);
  });

  it("only counts wallet debits as paid touchpoints by default (credits/topups don't retain)", async () => {
    const a = await seedParent({ signup: at("2026-01") });
    // A top-up CREDIT in Feb must NOT mark Feb active under the default debit signal.
    await dbh.db.insert(walletLedger).values({
      walletId: a.walletId,
      amount: 5000,
      direction: "credit",
      kind: "topup",
      idempotencyKey: nextKey(),
      postedBy: "system",
      source: "mpesa",
      createdAt: at("2026-02"),
    });
    await seedDebit(a.walletId, at("2026-01"));

    const m = await loadCohortRetention(dbh.db, {
      fromMonth: "2026-01",
      toMonth: "2026-01",
      asOfMonth: "2026-02",
    });
    const c = m.cohorts[0]!;
    const byOffset = Object.fromEntries(c.cells.map((x) => [x.offset, x]));
    expect(byOffset[0]).toMatchObject({ retained: 1 }); // Jan debit
    expect(byOffset[1]).toMatchObject({ retained: 0 }); // Feb was only a credit
  });

  it("does not over-count the current partial month: offsets beyond asOf are omitted (AC1)", async () => {
    const a = await seedParent({ signup: at("2026-01") });
    await seedDebit(a.walletId, at("2026-01"));

    const m = await loadCohortRetention(dbh.db, {
      fromMonth: "2026-01",
      toMonth: "2026-01",
      asOfMonth: "2026-02",
    });
    // Only offsets 0 (Jan) + 1 (Feb) are observable; March+ omitted.
    expect(m.cohorts[0]!.cells.map((x) => x.offset)).toEqual([0, 1]);
  });

  it("returns no cohorts when nobody signed up in range", async () => {
    const m = await loadCohortRetention(dbh.db, {
      fromMonth: "2026-01",
      toMonth: "2026-03",
      asOfMonth: "2026-03",
    });
    expect(m.cohorts).toEqual([]);
  });
});
