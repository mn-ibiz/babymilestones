import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  auditOutbox,
  mpesaCallbacks,
  mpesaStkRequests,
  smsOutbox,
  users,
  wallets,
  walletLedger,
} from "@bm/db";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { balance } from "@bm/wallet";
import type { StkQueryInput, StkQueryResult } from "@bm/payments";
import { createMpesaReconcileJob } from "./mpesa-reconcile.js";

/** A scripted stkQuery: maps checkoutRequestId → the canned Daraja outcome. */
function fakeMpesa(
  script: Record<string, StkQueryResult["status"]>,
): { stkQuery: (i: StkQueryInput) => Promise<StkQueryResult>; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    stkQuery: async (i: StkQueryInput): Promise<StkQueryResult> => {
      calls.push(i.checkoutRequestId);
      const status = script[i.checkoutRequestId] ?? "pending";
      return {
        provider: "mpesa",
        status,
        checkoutRequestId: i.checkoutRequestId,
        resultCode: status === "success" ? 0 : status === "failed" ? 1032 : null,
        resultDesc:
          status === "failed" ? "Request cancelled by user" : status === "success" ? "ok" : null,
      };
    },
  };
}

describe("M-Pesa reconciliation cron (P1-E04-S03)", () => {
  let dbh: TestDb;
  const NOW = new Date("2026-05-25T12:00:00Z");
  const ageMs = (ms: number) => new Date(NOW.getTime() - ms);

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  let seq = 0;
  async function seedRequest(opts: {
    checkoutRequestId: string;
    state: string;
    /** Age of the row's updatedAt (and createdAt) from NOW, in ms. */
    ageMs: number;
    amountCents?: number;
  }): Promise<{ requestId: string; walletId: string; parentId: string }> {
    seq += 1;
    const phone = `+25471${String(1000000 + seq).slice(-7)}`;
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    const ts = ageMs(opts.ageMs);
    const [r] = await dbh.db
      .insert(mpesaStkRequests)
      .values({
        checkoutRequestId: opts.checkoutRequestId,
        merchantRequestId: `mr-${seq}`,
        parentId: u!.id,
        walletId: w!.id,
        amount: (opts.amountCents ?? 50000) / 100,
        phone,
        state: opts.state,
        createdAt: ts,
        updatedAt: ts,
      })
      .returning();
    return { requestId: r!.id, walletId: w!.id, parentId: u!.id };
  }

  function makeJob(script: Record<string, StkQueryResult["status"]>) {
    const mpesa = fakeMpesa(script);
    const job = createMpesaReconcileJob({ db: dbh.db, mpesa, now: () => NOW });
    return { job, mpesa };
  }

  it("registers a 60s-cadence job named mpesa-reconcile (AC1)", () => {
    const { job } = makeJob({});
    expect(job.name).toBe("mpesa-reconcile");
    expect(job.intervalMs).toBe(60_000);
  });

  it("only picks up pending rows older than 90s (AC2)", async () => {
    await seedRequest({ checkoutRequestId: "fresh", state: "STK_SENT", ageMs: 30_000 });
    await seedRequest({ checkoutRequestId: "ripe", state: "STK_SENT", ageMs: 120_000 });
    const { job, mpesa } = makeJob({ ripe: "pending", fresh: "pending" });

    await job.run();

    expect(mpesa.calls).toEqual(["ripe"]);
  });

  it("success query credits the wallet exactly once and marks SUCCEEDED (AC3)", async () => {
    const { walletId } = await seedRequest({
      checkoutRequestId: "ws_ok",
      state: "STK_SENT",
      ageMs: 120_000,
      amountCents: 50000,
    });
    const { job } = makeJob({ ws_ok: "success" });

    await job.run();

    expect(await balance(dbh.db, walletId)).toBe(50000);
    const [req] = await dbh.db
      .select()
      .from(mpesaStkRequests)
      .where(eq(mpesaStkRequests.checkoutRequestId, "ws_ok"));
    expect(req!.state).toBe("SUCCEEDED");
  });

  it("does not double-credit when a callback already credited (idempotent path)", async () => {
    const { walletId } = await seedRequest({
      checkoutRequestId: "ws_dup",
      state: "STK_SENT",
      ageMs: 120_000,
      amountCents: 50000,
    });
    // Simulate S02 having already recorded the callback AND credited under
    // idempotency key = mpesa_callback.id.
    const [cb] = await dbh.db
      .insert(mpesaCallbacks)
      .values({ checkoutRequestId: "ws_dup", resultCode: 0, resultDesc: "ok" })
      .returning();
    const { applyTopup } = await import("@bm/wallet");
    const [req] = await dbh.db
      .select()
      .from(mpesaStkRequests)
      .where(eq(mpesaStkRequests.checkoutRequestId, "ws_dup"));
    await applyTopup(dbh.db, {
      parentId: req!.parentId,
      walletId: req!.walletId,
      amount: req!.amount * 100,
      idempotencyKey: cb!.id,
      source: "mpesa",
      postedBy: req!.parentId,
    });
    expect(await balance(dbh.db, walletId)).toBe(50000);

    const { job } = makeJob({ ws_dup: "success" });
    await job.run();

    // Still exactly one credit — the cron reuses the same callback id key.
    expect(await balance(dbh.db, walletId)).toBe(50000);
    const ledger = await dbh.db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.walletId, walletId));
    expect(ledger).toHaveLength(1);
  });

  it("failure query marks FAILED, sends an SMS stub and audits (AC4)", async () => {
    const { walletId, parentId } = await seedRequest({
      checkoutRequestId: "ws_fail",
      state: "STK_SENT",
      ageMs: 120_000,
    });
    const { job } = makeJob({ ws_fail: "failed" });

    await job.run();

    expect(await balance(dbh.db, walletId)).toBe(0);
    const [req] = await dbh.db
      .select()
      .from(mpesaStkRequests)
      .where(eq(mpesaStkRequests.checkoutRequestId, "ws_fail"));
    expect(req!.state).toBe("FAILED");
    const sms = await dbh.db.select().from(smsOutbox);
    expect(sms).toHaveLength(1);
    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "payment.mpesa.reconcile.failed"));
    expect(audits.length).toBeGreaterThan(0);
    void parentId;
  });

  it("marks rows still pending after 15 min as EXPIRED without querying (AC5)", async () => {
    await seedRequest({ checkoutRequestId: "ws_stale", state: "STK_SENT", ageMs: 16 * 60_000 });
    const { job, mpesa } = makeJob({ ws_stale: "pending" });

    await job.run();

    const [req] = await dbh.db
      .select()
      .from(mpesaStkRequests)
      .where(eq(mpesaStkRequests.checkoutRequestId, "ws_stale"));
    expect(req!.state).toBe("EXPIRED");
    // Expiry is decided locally — no Daraja query for stale rows.
    expect(mpesa.calls).not.toContain("ws_stale");
    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "payment.mpesa.reconcile.expired"));
    expect(audits.length).toBeGreaterThan(0);
  });

  it("leaves still-pending (not yet resolved, not stale) rows untouched", async () => {
    await seedRequest({ checkoutRequestId: "ws_wait", state: "STK_SENT", ageMs: 120_000 });
    const { job } = makeJob({ ws_wait: "pending" });

    await job.run();

    const [req] = await dbh.db
      .select()
      .from(mpesaStkRequests)
      .where(eq(mpesaStkRequests.checkoutRequestId, "ws_wait"));
    expect(req!.state).toBe("STK_SENT");
  });
});
