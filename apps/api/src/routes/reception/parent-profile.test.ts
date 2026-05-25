import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { invoices, parents, users, wallets, walletLedger, auditOutbox } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import type {
  ParentProfileResponse,
  OpenInvoicesResponse,
} from "@bm/contracts";
import { buildApp } from "../../app.js";

/**
 * P1-E05-S02 — Reception parent-profile header. Integration via app.inject with
 * real staff sessions. Covers the header summary (name, full phone, balance,
 * outstanding, auto-credit flag — AC1), the open-invoices modal list (AC3), the
 * staff-only read guard, and that flipping auto-credit is admin-only + audited.
 */
describe("Reception parent profile header (P1-E05-S02)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/staff/login",
      payload: { phone, pin },
    });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { session, csrfCookie, csrfToken: res.json().csrfToken as string };
  };

  let seq = 0;
  async function seedParent(opts: {
    first: string;
    last: string;
    phone?: string;
  }): Promise<{ userId: string; parentId: string; walletId: string; phone: string }> {
    seq += 1;
    const phone = opts.phone ?? `+25473${String(1000000 + seq).slice(-7)}`;
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: opts.first, lastName: opts.last })
      .returning();
    return { userId: u!.id, parentId: p!.id, walletId: w!.id, phone };
  }

  const getProfile = (userId: string, creds: { session: string }, opts: { auth?: boolean } = {}) => {
    const { auth = true } = opts;
    return app.inject({
      method: "GET",
      url: `/reception/parents/${userId}/profile`,
      headers: auth ? { cookie: creds.session } : {},
    });
  };

  const getInvoices = (userId: string, creds: { session: string }) =>
    app.inject({
      method: "GET",
      url: `/reception/parents/${userId}/open-invoices`,
      headers: { cookie: creds.session },
    });

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "reception"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000002", "7422", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "packer"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("returns the header summary: name, full phone, balance, outstanding, auto-credit (AC1)", async () => {
    const p = await seedParent({ first: "Asha", last: "Mwangi", phone: "+254712345678" });
    await dbh.db.insert(walletLedger).values({
      walletId: p.walletId,
      amount: 50_000,
      direction: "credit",
      kind: "topup",
      idempotencyKey: "k-credit",
      postedBy: "system",
      source: "cash:reception",
    });
    await dbh.db.insert(walletLedger).values({
      walletId: p.walletId,
      amount: -20_000,
      direction: "debit",
      kind: "debit",
      idempotencyKey: "k-debit",
      postedBy: "system",
      source: "checkin",
    });
    await dbh.db
      .insert(invoices)
      .values({ parentId: p.parentId, amountDue: 7_500, status: "outstanding" });

    const recep = await loginStaff("0712000001", "7421");
    const res = await getProfile(p.userId, recep);
    expect(res.statusCode).toBe(200);
    const { profile } = res.json() as ParentProfileResponse;
    expect(profile.userId).toBe(p.userId);
    expect(profile.firstName).toBe("Asha");
    expect(profile.lastName).toBe("Mwangi");
    expect(profile.phone).toBe("+254712345678"); // full phone, not masked
    expect(profile.walletBalanceCents).toBe(30_000);
    expect(profile.outstandingCents).toBe(7_500);
    expect(profile.autoCreditEnabled).toBe(false);
  });

  it("a settled invoice does not count toward outstanding", async () => {
    const p = await seedParent({ first: "Bea", last: "Kim" });
    await dbh.db.insert(invoices).values({ parentId: p.parentId, amountDue: 0, status: "settled" });
    const recep = await loginStaff("0712000001", "7421");
    const { profile } = (await getProfile(p.userId, recep)).json() as ParentProfileResponse;
    expect(profile.outstandingCents).toBe(0);
  });

  it("reflects auto-credit ON after an admin flips it", async () => {
    const p = await seedParent({ first: "Carol", last: "Mutua" });
    const admin = await loginStaff("0712000002", "7422");
    const patch = await app.inject({
      method: "PATCH",
      url: `/admin/parents/${p.userId}/auto-credit`,
      headers: {
        cookie: `${admin.session}; ${admin.csrfCookie}`,
        "x-csrf-token": admin.csrfToken,
      },
      payload: { autoCreditEnabled: true },
    });
    expect(patch.statusCode).toBe(200);

    const recep = await loginStaff("0712000001", "7421");
    const { profile } = (await getProfile(p.userId, recep)).json() as ParentProfileResponse;
    expect(profile.autoCreditEnabled).toBe(true);
  });

  it("unknown parent → 404", async () => {
    const recep = await loginStaff("0712000001", "7421");
    const res = await getProfile("00000000-0000-0000-0000-000000000000", recep);
    expect(res.statusCode).toBe(404);
  });

  it("packer (no read wallet) is rejected → 403 (staff-only)", async () => {
    const p = await seedParent({ first: "Dan", last: "Owino" });
    const packer = await loginStaff("0712000003", "7423");
    expect((await getProfile(p.userId, packer)).statusCode).toBe(403);
  });

  it("unauthenticated request → 401", async () => {
    const p = await seedParent({ first: "Eve", last: "Njeri" });
    const recep = await loginStaff("0712000001", "7421");
    expect((await getProfile(p.userId, recep, { auth: false })).statusCode).toBe(401);
  });

  it("lists open invoices oldest-first with a summed total matching outstanding (AC3)", async () => {
    const p = await seedParent({ first: "Faith", last: "Achieng" });
    const older = new Date("2026-01-01T00:00:00.000Z");
    const newer = new Date("2026-02-01T00:00:00.000Z");
    await dbh.db.insert(invoices).values({
      parentId: p.parentId,
      amountDue: 3_000,
      status: "outstanding",
      createdAt: newer,
    });
    await dbh.db.insert(invoices).values({
      parentId: p.parentId,
      amountDue: 2_000,
      status: "pending",
      createdAt: older,
    });
    // A settled invoice must NOT appear in the modal list.
    await dbh.db
      .insert(invoices)
      .values({ parentId: p.parentId, amountDue: 0, status: "settled" });

    const recep = await loginStaff("0712000001", "7421");
    const res = await getInvoices(p.userId, recep);
    expect(res.statusCode).toBe(200);
    const body = res.json() as OpenInvoicesResponse;
    expect(body.invoices).toHaveLength(2);
    expect(body.invoices.map((i) => i.amountDueCents)).toEqual([2_000, 3_000]); // oldest first
    expect(body.totalCents).toBe(5_000);
  });

  it("never-funded parent → zero balance, zero outstanding, empty modal", async () => {
    const p = await seedParent({ first: "Grace", last: "Wafula" });
    const recep = await loginStaff("0712000001", "7421");
    const { profile } = (await getProfile(p.userId, recep)).json() as ParentProfileResponse;
    expect(profile.walletBalanceCents).toBe(0);
    expect(profile.outstandingCents).toBe(0);
    const inv = (await getInvoices(p.userId, recep)).json() as OpenInvoicesResponse;
    expect(inv.invoices).toHaveLength(0);
    expect(inv.totalCents).toBe(0);
  });

  it("auto-credit toggle is rejected for reception (non-admin) and writes no audit", async () => {
    const p = await seedParent({ first: "Hope", last: "Otieno" });
    const recep = await loginStaff("0712000001", "7421");
    const patch = await app.inject({
      method: "PATCH",
      url: `/admin/parents/${p.userId}/auto-credit`,
      headers: {
        cookie: `${recep.session}; ${recep.csrfCookie}`,
        "x-csrf-token": recep.csrfToken,
      },
      payload: { autoCreditEnabled: true },
    });
    expect(patch.statusCode).toBe(403);
    const audits = await dbh.db.select().from(auditOutbox);
    expect(audits.filter((a) => a.action === "wallet.auto_credit_toggle")).toHaveLength(0);
  });
});
