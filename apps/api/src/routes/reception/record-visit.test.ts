import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import {
  auditOutbox,
  bookings,
  children,
  invoices,
  parents,
  users,
  wallets,
  walletLedger,
} from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { post } from "@bm/wallet";
import { buildApp } from "../../app.js";

/**
 * P1-E05-S04 — Record a service visit. Confirm → bookings row (with staff
 * name+rate snapshot, AC2) + pending invoice + immediate check-in + wallet debit
 * (P1-E03-S05), all in one flow (AC3). Underfunded + auto-credit off → booking
 * still proceeds, outstanding invoice created, warning surfaced (AC4). Staff-only
 * via rbac (AC1) and a `reception.record_visit` audit row is written.
 */
describe("POST /reception/visit (P1-E05-S04)", () => {
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
  async function seedParent(opts: { credit?: number; autoCredit?: boolean } = {}): Promise<{
    userId: string;
    parentId: string;
    walletId: string;
    childId: string;
  }> {
    seq += 1;
    const phone = `+25473${String(5000000 + seq).slice(-7)}`;
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    const [w] = await dbh.db
      .insert(wallets)
      .values({ userId: u!.id, autoCreditEnabled: opts.autoCredit ?? false })
      .returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "P", lastName: "Q" })
      .returning();
    const [c] = await dbh.db
      .insert(children)
      .values({ parentId: p!.id, firstName: "Kid", dateOfBirth: "2022-01-01" })
      .returning();
    if (opts.credit && opts.credit > 0) {
      await post(dbh.db, {
        walletId: w!.id,
        amount: opts.credit,
        kind: "topup",
        idempotencyKey: `seed:${w!.id}`,
        source: "seed",
        postedBy: u!.id,
      });
    }
    return { userId: u!.id, parentId: p!.id, walletId: w!.id, childId: c!.id };
  }

  const validBody = (over: Record<string, unknown> = {}) => ({
    serviceId: "33333333-3333-3333-3333-333333333333",
    staffId: "44444444-4444-4444-4444-444444444444",
    staffName: "Jane K",
    rate: 200_00,
    ...over,
  });

  const doVisit = (
    body: Record<string, unknown>,
    creds: { session: string; csrfCookie: string; csrfToken: string },
    opts: { auth?: boolean; csrf?: boolean } = {},
  ) => {
    const { auth = true, csrf = true } = opts;
    const cookieParts: string[] = [];
    if (auth) cookieParts.push(creds.session);
    if (csrf) cookieParts.push(creds.csrfCookie);
    return app.inject({
      method: "POST",
      url: "/reception/visit",
      headers: {
        cookie: cookieParts.join("; "),
        ...(csrf ? { "x-csrf-token": creds.csrfToken } : {}),
      },
      payload: body,
    });
  };

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "reception"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000004", "7424", "accountant"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("funded → 201 settled: booking+invoice+check-in+debit (AC2/AC3)", async () => {
    const { userId, parentId, childId } = await seedParent({ credit: 500_00 });
    const recep = await loginStaff("0712000001", "7421");
    const res = await doVisit(validBody({ parentId: userId, childId }), recep);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.outcome).toBe("settled");
    expect(body.debitedCents).toBe(200_00);
    expect(body.warning).toBe(false);

    // Booking row with snapshots (AC2).
    const [bk] = await dbh.db.select().from(bookings).where(eq(bookings.id, body.bookingId));
    expect(bk!.parentId).toBe(parentId);
    expect(bk!.childId).toBe(childId);
    expect(bk!.staffNameSnapshot).toBe("Jane K");
    expect(bk!.staffRateSnapshot).toBe(200_00);
    expect(bk!.invoiceId).toBe(body.invoiceId);
    expect(bk!.checkedInAt).toBeTruthy();

    // Invoice settled.
    const [inv] = await dbh.db.select().from(invoices).where(eq(invoices.id, body.invoiceId));
    expect(inv!.status).toBe("settled");
    expect(inv!.serviceId).toBe("33333333-3333-3333-3333-333333333333");

    // One debit ledger row posted.
    const debits = (await dbh.db.select().from(walletLedger)).filter((r) => r.kind === "debit");
    expect(debits).toHaveLength(1);
    expect(debits[0]!.amount).toBe(-200_00);

    // Audit row names the action.
    const audits = (await dbh.db.select().from(auditOutbox)).filter(
      (r) => r.action === "reception.record_visit",
    );
    expect(audits).toHaveLength(1);
  });

  it("underfunded + auto-credit OFF → 201, booking proceeds, outstanding + warning (AC4)", async () => {
    const { userId, childId } = await seedParent({ credit: 50_00, autoCredit: false });
    const recep = await loginStaff("0712000001", "7421");
    const res = await doVisit(validBody({ parentId: userId, childId, rate: 200_00 }), recep);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.outcome).toBe("outstanding");
    expect(body.debitedCents).toBe(0);
    expect(body.warning).toBe(true);
    expect(typeof body.warningMessage).toBe("string");

    const [inv] = await dbh.db.select().from(invoices).where(eq(invoices.id, body.invoiceId));
    expect(inv!.status).toBe("outstanding");
    // Booking still created (AC4).
    const [bk] = await dbh.db.select().from(bookings).where(eq(bookings.id, body.bookingId));
    expect(bk).toBeTruthy();
    // No debit posted on the outstanding path.
    const debits = (await dbh.db.select().from(walletLedger)).filter((r) => r.kind === "debit");
    expect(debits).toHaveLength(0);
  });

  it("underfunded + auto-credit ON → 201 settled_on_credit, debit posted", async () => {
    const { userId, childId } = await seedParent({ credit: 50_00, autoCredit: true });
    const recep = await loginStaff("0712000001", "7421");
    const res = await doVisit(validBody({ parentId: userId, childId, rate: 200_00 }), recep);
    expect(res.statusCode).toBe(201);
    expect(res.json().outcome).toBe("settled_on_credit");
    const debits = (await dbh.db.select().from(walletLedger)).filter((r) => r.kind === "debit");
    expect(debits).toHaveLength(1);
  });

  it("rejects a child that does not belong to the parent (422)", async () => {
    const a = await seedParent({ credit: 500_00 });
    const b = await seedParent({ credit: 500_00 });
    const recep = await loginStaff("0712000001", "7421");
    const res = await doVisit(validBody({ parentId: a.userId, childId: b.childId }), recep);
    expect(res.statusCode).toBe(422);
  });

  it("404 for an unknown parent", async () => {
    const recep = await loginStaff("0712000001", "7421");
    const res = await doVisit(
      validBody({
        parentId: "99999999-9999-9999-9999-999999999999",
        childId: "88888888-8888-8888-8888-888888888888",
      }),
      recep,
    );
    expect(res.statusCode).toBe(404);
  });

  it("400 on invalid body", async () => {
    const { userId, childId } = await seedParent({ credit: 500_00 });
    const recep = await loginStaff("0712000001", "7421");
    const res = await doVisit(validBody({ parentId: userId, childId, rate: -5 }), recep);
    expect(res.statusCode).toBe(400);
  });

  it("403 for a role without `create payment` (accountant)", async () => {
    const { userId, childId } = await seedParent({ credit: 500_00 });
    const acct = await loginStaff("0712000004", "7424");
    const res = await doVisit(validBody({ parentId: userId, childId }), acct);
    expect(res.statusCode).toBe(403);
  });

  it("401 without a session", async () => {
    const { userId, childId } = await seedParent({ credit: 500_00 });
    const recep = await loginStaff("0712000001", "7421");
    const res = await doVisit(validBody({ parentId: userId, childId }), recep, { auth: false });
    expect(res.statusCode).toBe(401);
  });
});
