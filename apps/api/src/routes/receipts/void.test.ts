import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, receipts, services, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { writeReceipt } from "@bm/payments";
import { buildApp } from "../../app.js";

/**
 * P1-E08-S05 — Receipt void (reversing entry). Integration via app.inject.
 * Covers: admin void creates a `kind='void'` reversing receipt with
 * `reverses_receipt_id` + net-zero totals (AC1/AC2), `receipt.voided` audit
 * (AC2), double-void rejected (AC3), and the admin-only guard (cashier with
 * only `read/create receipt` is rejected).
 */
describe("Receipt void (P1-E08-S05)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  let adminSession: string;
  let adminCsrfCookie: string;
  let adminCsrfToken: string;
  let adminId: string;

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

  async function seedReceipt(): Promise<string> {
    const [svc] = await dbh.db
      .insert(services)
      .values({ name: "Soft-play session", unit: "play" })
      .returning();
    const receipt = await writeReceipt(dbh.db, {
      series: "BM-2026",
      paymentMethod: "mpesa",
      postedBy: "system",
      lines: [
        { serviceId: svc!.id, quantity: 2, unitPrice: 50_000, lineTax: 13_793, lineTotal: 100_000 },
      ],
    });
    return receipt.id;
  }

  const voidReq = (
    id: string,
    opts: { auth?: boolean; csrf?: boolean; session?: string; csrfCookie?: string; csrfToken?: string } = {},
  ) => {
    const { auth = true, csrf = true } = opts;
    const session = opts.session ?? adminSession;
    const csrfCookie = opts.csrfCookie ?? adminCsrfCookie;
    const csrfToken = opts.csrfToken ?? adminCsrfToken;
    const cookieParts: string[] = [];
    if (auth) cookieParts.push(session);
    if (csrf) cookieParts.push(csrfCookie);
    const headers: Record<string, string> = {};
    if (cookieParts.length) headers["cookie"] = cookieParts.join("; ");
    if (csrf) headers["x-csrf-token"] = csrfToken;
    return app.inject({ method: "POST", url: `/receipts/${id}/void`, headers });
  };

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    const [admin] = await dbh.db
      .insert(users)
      .values(await staffUserSeed("+254712000099", "7421", "admin"))
      .returning();
    adminId = admin!.id;
    const a = await loginStaff("0712000099", "7421");
    adminSession = a.session;
    adminCsrfCookie = a.csrfCookie;
    adminCsrfToken = a.csrfToken;
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("admin void creates a kind='void' reversing receipt that nets to 0 (AC1/AC2)", async () => {
    const id = await seedReceipt();
    const res = await voidReq(id);
    expect(res.statusCode).toBe(201);
    const { voidReceiptId, originalReceiptId } = res.json();
    expect(originalReceiptId).toBe(id);

    const [voidRow] = await dbh.db.select().from(receipts).where(eq(receipts.id, voidReceiptId));
    expect(voidRow!.kind).toBe("void");
    expect(voidRow!.reversesReceiptId).toBe(id);

    const [orig] = await dbh.db.select().from(receipts).where(eq(receipts.id, id));
    expect(orig!.total + voidRow!.total).toBe(0);
    expect(orig!.taxTotal + voidRow!.taxTotal).toBe(0);
    // Original is never deleted/mutated.
    expect(orig!.kind).toBe("normal");
  });

  it("writes a receipt.voided audit row referencing both receipts (AC2)", async () => {
    const id = await seedReceipt();
    const res = await voidReq(id);
    const { voidReceiptId } = res.json();
    const rows = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "receipt.voided"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actorUserId).toBe(adminId);
    expect(rows[0]!.targetId).toBe(id);
    const payload = rows[0]!.payload as Record<string, unknown>;
    expect(payload.void_receipt_id).toBe(voidReceiptId);
  });

  it("rejects double-void with 409 (AC3)", async () => {
    const id = await seedReceipt();
    expect((await voidReq(id)).statusCode).toBe(201);
    const second = await voidReq(id);
    expect(second.statusCode).toBe(409);
    // Exactly one void row exists.
    const voids = await dbh.db
      .select()
      .from(receipts)
      .where(and(eq(receipts.kind, "void"), eq(receipts.reversesReceiptId, id)));
    expect(voids).toHaveLength(1);
  });

  it("returns 404 for an unknown receipt id", async () => {
    const res = await voidReq("00000000-0000-4000-8000-000000000000");
    expect(res.statusCode).toBe(404);
  });

  it("is admin-only: a cashier (read/create receipt only) is rejected with 403", async () => {
    const id = await seedReceipt();
    await dbh.db.insert(users).values(await staffUserSeed("+254712000088", "7421", "cashier"));
    const c = await loginStaff("0712000088", "7421");
    const res = await voidReq(id, {
      session: c.session,
      csrfCookie: c.csrfCookie,
      csrfToken: c.csrfToken,
    });
    expect(res.statusCode).toBe(403);
  });

  it("requires a staff session (401 when unauthenticated)", async () => {
    const id = await seedReceipt();
    const res = await voidReq(id, { auth: false, csrf: false });
    expect(res.statusCode).toBe(401);
  });

  it("requires the CSRF token (403 without it)", async () => {
    const id = await seedReceipt();
    const res = await voidReq(id, { csrf: false });
    expect(res.statusCode).toBe(403);
  });
});
