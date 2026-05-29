import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, children, parents, smsOutbox, subscriptions, users, wallets } from "@bm/db";
import { debit, post as ledgerPost } from "@bm/wallet";
import { createPlan, createService, resumeSubscription, setPlanPrice } from "@bm/catalog";
import { invoices } from "@bm/db";
import { createSubscriptionRenewJob } from "./subscription-renew.js";

/**
 * P2-E02-S05 — subscription renewal / dunning cron. DB-backed via PGlite with an
 * injected clock. Covers renew success (AC1/AC2), dunning on failure (AC3),
 * dunning retry + grace-exhaustion pause (AC4), and auto-credit (AC5).
 */
const NOW = new Date("2026-06-15T00:00:00.000Z");
const PERIOD_ENDED = new Date("2026-06-14T00:00:00.000Z"); // due

describe("subscription renewal / dunning cron (P2-E02-S05)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seed(opts: {
    status?: "active" | "dunning";
    fund?: number;
    autoCredit?: boolean;
    periodEnd?: Date;
    dunningSince?: Date | null;
    amountCents?: number;
    cancelAtPeriodEnd?: boolean;
  } = {}) {
    const svc = await createService(dbh.db, { name: "Play", unit: "play" });
    const plan = await createPlan(dbh.db, { serviceId: svc.id, name: "P", entitlementCount: 8, period: "month" });
    await setPlanPrice(dbh.db, { planId: plan.id, amountCents: opts.amountCents ?? 5000, effectiveFrom: "2026-01-01" });
    const [u] = await dbh.db.insert(users).values({ phone: "+254712000001", pinHash: "x" }).returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id, autoCreditEnabled: opts.autoCredit ?? false }).returning();
    const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "A", lastName: "B" }).returning();
    const [c] = await dbh.db.insert(children).values({ parentId: p!.id, firstName: "Z", dateOfBirth: "2024-01-15" }).returning();
    if (opts.fund) {
      await ledgerPost(dbh.db, { walletId: w!.id, amount: opts.fund, kind: "topup", idempotencyKey: `t:${w!.id}`, source: "cash", postedBy: "system" });
    }
    const [sub] = await dbh.db
      .insert(subscriptions)
      .values({
        parentId: p!.id,
        childId: c!.id,
        planId: plan.id,
        currentPeriodStart: new Date("2026-05-14T00:00:00Z"),
        currentPeriodEnd: opts.periodEnd ?? PERIOD_ENDED,
        status: opts.status ?? "active",
        dunningSince: opts.dunningSince ?? null,
        cancelAtPeriodEnd: opts.cancelAtPeriodEnd ?? false,
        entitlementRemaining: 0,
      })
      .returning();
    return sub!.id;
  }

  const run = () => createSubscriptionRenewJob({ db: dbh.db, now: () => NOW }).run();
  const get = async (id: string) => (await dbh.db.select().from(subscriptions).where(eq(subscriptions.id, id)))[0]!;

  it("renews a due subscription from a funded wallet: period rolls, entitlement reset (AC1/AC2)", async () => {
    const id = await seed({ fund: 10_000 });
    await run();
    const sub = await get(id);
    expect(sub.status).toBe("active");
    expect(sub.entitlementRemaining).toBe(8); // reset
    expect(sub.currentPeriodStart.toISOString()).toBe(PERIOD_ENDED.toISOString()); // rolled from prior end
    expect(sub.currentPeriodEnd.toISOString().slice(0, 10)).toBe("2026-07-14"); // +1 month
    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "subscription.renewed"));
    expect(audits).toHaveLength(1);
  });

  it("enters dunning + SMSes when the wallet can't cover it (AC3)", async () => {
    const id = await seed({ fund: 0 });
    await run();
    const sub = await get(id);
    expect(sub.status).toBe("dunning");
    expect(sub.dunningSince).not.toBeNull();
    const sms = await dbh.db.select().from(smsOutbox).where(eq(smsOutbox.template, "subscription.dunning"));
    expect(sms).toHaveLength(1);
  });

  it("renews through to negative balance when auto-credit is on (AC5)", async () => {
    const id = await seed({ fund: 0, autoCredit: true });
    await run();
    expect((await get(id)).status).toBe("active");
  });

  it("retries a dunning subscription and recovers when funded (AC3)", async () => {
    const id = await seed({ status: "dunning", dunningSince: new Date("2026-06-14T00:00:00Z"), fund: 10_000 });
    await run();
    expect((await get(id)).status).toBe("active");
  });

  it("pauses a dunning subscription after the 3-day grace window (AC4)", async () => {
    const id = await seed({ status: "dunning", dunningSince: new Date("2026-06-11T00:00:00Z"), fund: 0 });
    await run(); // NOW is 4 days after dunningSince → grace exhausted
    const sub = await get(id);
    expect(sub.status).toBe("paused");
    expect(sub.dunningSince).toBeNull();
  });

  it("leaves a not-yet-due subscription untouched", async () => {
    const id = await seed({ fund: 10_000, periodEnd: new Date("2026-08-01T00:00:00Z") });
    await run();
    expect((await get(id)).status).toBe("active");
    expect((await get(id)).entitlementRemaining).toBe(0); // unchanged (not renewed)
  });

  it("voids the redundant invoice when the renewal charge replays (no phantom pending)", async () => {
    const id = await seed({ fund: 10_000 });
    const sub = await get(id);
    // Simulate a prior partial run that charged this period (settled) but died
    // before rolling: post the debit under the SAME idempotency key on a throwaway invoice.
    const [parent] = await dbh.db.select().from(parents).where(eq(parents.id, sub.parentId));
    const [wallet] = await dbh.db.select().from(wallets).where(eq(wallets.userId, parent!.userId));
    const [prior] = await dbh.db
      .insert(invoices)
      .values({ parentId: sub.parentId, amountDue: 5000, serviceId: null, status: "pending" })
      .returning();
    await debit(dbh.db, {
      walletId: wallet!.id,
      invoiceId: prior!.id,
      idempotencyKey: `renewal:${id}:${sub.currentPeriodEnd.toISOString()}`,
      source: "subscription_renewal",
      postedBy: "00000000-0000-0000-0000-000000000000",
    });

    await run(); // the job's debit replays; its new invoice must be voided + period rolls
    expect((await get(id)).status).toBe("active");
    expect((await get(id)).currentPeriodEnd.toISOString().slice(0, 10)).toBe("2026-07-14");
    // No phantom pending invoice left to be settled by a later top-up.
    const pending = await dbh.db.select().from(invoices).where(eq(invoices.status, "pending"));
    expect(pending).toHaveLength(0);
  });

  it("terminates a due subscription scheduled to cancel — no charge (P2-E02-S06 AC1/AC3)", async () => {
    const id = await seed({ fund: 10_000, cancelAtPeriodEnd: true });
    await run();
    const sub = await get(id);
    expect(sub.status).toBe("cancelled");
    // No renewal charge: the wallet's only ledger entry is the top-up (no debit).
    const ledger = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "subscription.renewed"));
    expect(ledger).toHaveLength(0);
    const cancels = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "subscription.cancelled"));
    expect(cancels).toHaveLength(1);
  });

  it("reaps a paused subscription that was scheduled to cancel (no zombie) (P2-E02-S06)", async () => {
    const id = await seed({ status: "active", fund: 0, cancelAtPeriodEnd: true });
    // Pause it while the cancel is scheduled (paused + cancel_at_period_end).
    await dbh.db.update(subscriptions).set({ status: "paused", pausedAt: NOW }).where(eq(subscriptions.id, id));
    await run();
    expect((await get(id)).status).toBe("cancelled"); // reaped, not stuck
  });

  it("a grace-paused subscription can be manually resumed (AC4)", async () => {
    const id = await seed({ status: "dunning", dunningSince: new Date("2026-06-11T00:00:00Z"), fund: 0 });
    await run(); // grace exhausted → paused (pausedAt set)
    expect((await get(id)).status).toBe("paused");
    const resumed = await resumeSubscription(dbh.db, { subscriptionId: id, now: new Date("2026-06-16T00:00:00Z") });
    expect(resumed.status).toBe("active"); // no longer stuck
  });
});
