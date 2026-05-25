import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import {
  bankTransferPending,
  parents,
  smsOutbox,
  users,
  wallets,
  walletLedger,
  auditOutbox,
} from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../../app.js";

/**
 * P1-E04-S07 — admin-confirmed bank transfer top-up. Integration via app.inject
 * with real staff sessions (+ CSRF). Covers recording a pending transfer (AC1),
 * admin/treasury confirm crediting the wallet exactly once (AC2), the
 * double-confirm no-double-credit guard, the admin/treasury role guard, the
 * SMS-stub (AC3), and audit (DoD).
 */
describe("Bank transfer top-up, admin-confirmed (P1-E04-S07)", () => {
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
  async function seedParent(): Promise<{ parentId: string; phone: string }> {
    seq += 1;
    const phone = `+25473${String(4000000 + seq).slice(-7)}`;
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    await dbh.db.insert(wallets).values({ userId: u!.id });
    await dbh.db.insert(parents).values({ userId: u!.id, firstName: "P", lastName: "Q" });
    return { parentId: u!.id, phone };
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000010", "7431", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000011", "7432", "treasury"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000012", "7433", "reception"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000013", "7434", "accountant"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const record = (
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
      url: "/payments/bank/transfers",
      headers: {
        cookie: cookieParts.join("; "),
        ...(csrf ? { "x-csrf-token": creds.csrfToken } : {}),
      },
      payload: body,
    });
  };

  const confirm = (
    id: string,
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
      url: `/payments/bank/transfers/${id}/confirm`,
      headers: {
        cookie: cookieParts.join("; "),
        ...(csrf ? { "x-csrf-token": creds.csrfToken } : {}),
      },
      payload: body,
    });
  };

  it("admin records a pending transfer → 201, status pending (AC1)", async () => {
    const admin = await loginStaff("0712000010", "7431");
    const res = await record({ amount: 50_000, reference: "FT123" }, admin);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe("pending");
    expect(body.id).toBeTruthy();
    const [row] = await dbh.db
      .select()
      .from(bankTransferPending)
      .where(eq(bankTransferPending.id, body.id));
    expect(row!.amount).toBe(50_000);
    expect(row!.reference).toBe("FT123");
    expect(row!.parentId).toBeNull();
  });

  it("admin matches a parent + confirms → wallet credited once (AC2)", async () => {
    const { parentId } = await seedParent();
    const admin = await loginStaff("0712000010", "7431");
    const rec = (await record({ amount: 60_000, reference: "FT2" }, admin)).json();

    const res = await confirm(rec.id, { parentId }, admin);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("confirmed");
    expect(body.source).toBe("bank:manual");
    expect(body.replayed).toBe(false);

    const [ledger] = await dbh.db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.id, body.ledgerEntryId));
    expect(ledger!.kind).toBe("topup");
    expect(ledger!.source).toBe("bank:manual");
    expect(ledger!.amount).toBe(60_000);
    // posted_by is the admin, idempotency key is the pending row id.
    const [adminUser] = await dbh.db
      .select()
      .from(users)
      .where(eq(users.phone, "+254712000010"));
    expect(ledger!.postedBy).toBe(adminUser!.id);
    expect(ledger!.idempotencyKey).toBe(rec.id);

    const [row] = await dbh.db
      .select()
      .from(bankTransferPending)
      .where(eq(bankTransferPending.id, rec.id));
    expect(row!.status).toBe("confirmed");
    expect(row!.confirmedBy).toBe(adminUser!.id);
    expect(row!.parentId).toBe(parentId);
  });

  it("treasury may also confirm → 200 (AC2 role)", async () => {
    const { parentId } = await seedParent();
    const admin = await loginStaff("0712000010", "7431");
    const treasury = await loginStaff("0712000011", "7432");
    const rec = (await record({ amount: 10_000, reference: "FT3" }, admin)).json();
    const res = await confirm(rec.id, { parentId }, treasury);
    expect(res.statusCode).toBe(200);
  });

  it("double-confirm posts no second credit (idempotent on pending id)", async () => {
    const { parentId } = await seedParent();
    const admin = await loginStaff("0712000010", "7431");
    const rec = (await record({ amount: 20_000, reference: "FT4" }, admin)).json();

    const first = await confirm(rec.id, { parentId }, admin);
    const second = await confirm(rec.id, { parentId }, admin);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json().replayed).toBe(false);
    expect(second.json().replayed).toBe(true);

    const topups = (await dbh.db.select().from(walletLedger)).filter((r) => r.kind === "topup");
    expect(topups).toHaveLength(1);
    // SMS sent only once (the replay does not re-notify).
    const out = await dbh.db.select().from(smsOutbox);
    expect(out).toHaveLength(1);
  });

  it("reception (no admin/treasury grant) is rejected from record → 403 (AC: guard)", async () => {
    const recep = await loginStaff("0712000012", "7433");
    const res = await record({ amount: 10_000, reference: "X" }, recep);
    expect(res.statusCode).toBe(403);
  });

  it("accountant is rejected from confirm → 403 (AC: guard)", async () => {
    const { parentId } = await seedParent();
    const admin = await loginStaff("0712000010", "7431");
    const acct = await loginStaff("0712000013", "7434");
    const rec = (await record({ amount: 10_000, reference: "FT5" }, admin)).json();
    const res = await confirm(rec.id, { parentId }, acct);
    expect(res.statusCode).toBe(403);
  });

  it("unauthenticated request → 401", async () => {
    const admin = await loginStaff("0712000010", "7431");
    const res = await record({ amount: 10_000, reference: "X" }, admin, { auth: false });
    expect(res.statusCode).toBe(401);
  });

  it("missing CSRF token → 403", async () => {
    const admin = await loginStaff("0712000010", "7431");
    const res = await record({ amount: 10_000, reference: "X" }, admin, { csrf: false });
    expect(res.statusCode).toBe(403);
  });

  it("non-integer / non-positive amount → 400", async () => {
    const admin = await loginStaff("0712000010", "7431");
    expect((await record({ amount: 0, reference: "X" }, admin)).statusCode).toBe(400);
    expect((await record({ amount: 12.5, reference: "X" }, admin)).statusCode).toBe(400);
    expect((await record({ amount: 10_000 }, admin)).statusCode).toBe(400); // missing reference
  });

  it("confirm of unknown transfer → 404", async () => {
    const { parentId } = await seedParent();
    const admin = await loginStaff("0712000010", "7431");
    const res = await confirm("00000000-0000-0000-0000-000000000000", { parentId }, admin);
    expect(res.statusCode).toBe(404);
  });

  it("confirm with unknown parent → 404", async () => {
    const admin = await loginStaff("0712000010", "7431");
    const rec = (await record({ amount: 10_000, reference: "FT6" }, admin)).json();
    const res = await confirm(
      rec.id,
      { parentId: "00000000-0000-0000-0000-000000000000" },
      admin,
    );
    expect(res.statusCode).toBe(404);
  });

  it("queues an SMS-stub for the parent on confirm (AC3)", async () => {
    const { parentId, phone } = await seedParent();
    const admin = await loginStaff("0712000010", "7431");
    const rec = (await record({ amount: 10_000, reference: "FT7" }, admin)).json();
    await confirm(rec.id, { parentId }, admin);
    const out = (await dbh.db.select().from(smsOutbox)).filter((r) => r.phone === phone);
    expect(out).toHaveLength(1);
    expect(out[0]!.template).toBe("wallet.topup.bank");
  });

  it("writes an audit row naming the admin actor on confirm (DoD)", async () => {
    const { parentId } = await seedParent();
    const admin = await loginStaff("0712000010", "7431");
    const rec = (await record({ amount: 10_000, reference: "FT8" }, admin)).json();
    await confirm(rec.id, { parentId }, admin);
    const [adminUser] = await dbh.db
      .select()
      .from(users)
      .where(eq(users.phone, "+254712000010"));
    const rows = (await dbh.db.select().from(auditOutbox)).filter(
      (r) => r.action === "payment.bank.confirm",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actorUserId).toBe(adminUser!.id);
  });
});
