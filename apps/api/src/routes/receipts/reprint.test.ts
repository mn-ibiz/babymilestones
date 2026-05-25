import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, parents, receipts, services, smsOutbox, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { writeReceipt } from "@bm/payments";
import { buildApp } from "../../app.js";

/**
 * P1-E08-S04 — Receipt reprint / re-send. Integration via app.inject with a
 * real reception staff session (+ CSRF). Covers: byte-identical re-render vs the
 * S03 render route, NO new receipt row / sequence (AC3), `receipt.reprinted`
 * audit (AC2), re-SMS enqueues an `sms_outbox` row (AC1), and the staff guard.
 */
describe("Receipt reprint (P1-E08-S04)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let staffSession: string;
  let staffCsrfCookie: string;
  let staffCsrfToken: string;
  let staffId: string;

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
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: "+254712345678", pinHash: "x" })
      .returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "Asha", lastName: "Mwangi" })
      .returning();
    const [svc] = await dbh.db
      .insert(services)
      .values({ name: "Soft-play session", unit: "play" })
      .returning();
    const receipt = await writeReceipt(dbh.db, {
      series: "BM-2026",
      paymentMethod: "mpesa",
      postedBy: "system",
      parentAccountId: p!.id,
      lines: [
        { serviceId: svc!.id, quantity: 2, unitPrice: 50_000, lineTax: 13_793, lineTotal: 100_000 },
      ],
    });
    return receipt.id;
  }

  const reprint = (
    id: string,
    body: Record<string, unknown> = {},
    opts: { auth?: boolean; csrf?: boolean } = {},
  ) => {
    const { auth = true, csrf = true } = opts;
    const cookieParts: string[] = [];
    if (auth) cookieParts.push(staffSession);
    if (csrf) cookieParts.push(staffCsrfCookie);
    const headers: Record<string, string> = {};
    if (cookieParts.length) headers["cookie"] = cookieParts.join("; ");
    if (csrf) headers["x-csrf-token"] = staffCsrfToken;
    return app.inject({ method: "POST", url: `/receipts/${id}/reprint`, headers, payload: body });
  };

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    const [staff] = await dbh.db
      .insert(users)
      .values(await staffUserSeed("+254712000001", "7421", "reception"))
      .returning();
    staffId = staff!.id;
    const s = await loginStaff("0712000001", "7421");
    staffSession = s.session;
    staffCsrfCookie = s.csrfCookie;
    staffCsrfToken = s.csrfToken;
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("re-renders byte-identical to the original render route, both formats (AC3)", async () => {
    const id = await seedReceipt();
    for (const format of ["a4", "thermal"] as const) {
      const original = await app.inject({
        method: "GET",
        url: `/receipts/${id}?format=${format}`,
        headers: { cookie: staffSession },
      });
      const re = await reprint(id, { format });
      expect(re.statusCode).toBe(200);
      expect(re.headers["content-type"]).toBe(original.headers["content-type"]);
      expect(re.body).toBe(original.body);
    }
  });

  it("defaults to A4 HTML when no format is given", async () => {
    const id = await seedReceipt();
    const re = await reprint(id);
    expect(re.statusCode).toBe(200);
    expect(re.headers["content-type"]).toContain("text/html");
    expect(re.body).toContain("BM-2026-000001");
  });

  it("does NOT create a new receipt row or sequence (AC3)", async () => {
    const id = await seedReceipt();
    const before = await dbh.db.select().from(receipts);
    await reprint(id, { format: "thermal" });
    await reprint(id, { resend: true });
    const after = await dbh.db.select().from(receipts);
    expect(after).toHaveLength(before.length);
    expect(after.map((r) => r.id).sort()).toEqual(before.map((r) => r.id).sort());
    expect(after.map((r) => r.sequenceNumber).sort()).toEqual(
      before.map((r) => r.sequenceNumber).sort(),
    );
  });

  it("writes a receipt.reprinted audit row with actor + receipt id (AC2)", async () => {
    const id = await seedReceipt();
    await reprint(id, { format: "thermal" });
    const rows = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "receipt.reprinted"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actorUserId).toBe(staffId);
    expect(rows[0]!.targetTable).toBe("receipts");
    expect(rows[0]!.targetId).toBe(id);
    expect((rows[0]!.payload as { resend?: boolean }).resend).toBe(false);
  });

  it("re-sends SMS: enqueues an sms_outbox row to the customer (AC1)", async () => {
    const id = await seedReceipt();
    const re = await reprint(id, { resend: true, format: "thermal" });
    expect(re.statusCode).toBe(200);
    expect(re.headers["x-receipt-resent"]).toBe("true");
    const sms = await dbh.db.select().from(smsOutbox);
    expect(sms).toHaveLength(1);
    expect(sms[0]!.phone).toBe("+254712345678");
    expect(sms[0]!.template).toBe("receipt.reprint");
    expect(sms[0]!.body).toContain("BM-2026-000001");
    const audited = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "receipt.reprinted"));
    expect((audited[0]!.payload as { resend?: boolean }).resend).toBe(true);
  });

  it("does not enqueue SMS when resend is omitted", async () => {
    const id = await seedReceipt();
    await reprint(id, { format: "thermal" });
    const sms = await dbh.db.select().from(smsOutbox);
    expect(sms).toHaveLength(0);
  });

  it("rejects an unknown format with 400", async () => {
    const id = await seedReceipt();
    const re = await reprint(id, { format: "pdf" });
    expect(re.statusCode).toBe(400);
  });

  it("returns 404 for an unknown receipt id", async () => {
    const re = await reprint("00000000-0000-4000-8000-000000000000", { format: "a4" });
    expect(re.statusCode).toBe(404);
  });

  it("requires a staff session (401 when unauthenticated)", async () => {
    const id = await seedReceipt();
    const re = await reprint(id, { format: "a4" }, { auth: false, csrf: false });
    expect(re.statusCode).toBe(401);
  });

  it("requires the CSRF token (403 without it)", async () => {
    const id = await seedReceipt();
    const re = await reprint(id, { format: "a4" }, { csrf: false });
    expect(re.statusCode).toBe(403);
  });
});
