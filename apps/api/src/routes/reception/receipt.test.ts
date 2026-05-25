import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, parents, smsOutbox, users, wallets, walletLedger } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { CSRF_HEADER_NAME } from "@bm/auth";
import { eq } from "drizzle-orm";
import type { ReceiptResponse, ReceiptSmsResponse } from "@bm/contracts";
import { buildApp } from "../../app.js";

/**
 * P1-E05-S06 — Print + SMS-stub receipt from Reception. Integration via
 * app.inject with real staff sessions. Covers: receipt payload by transaction
 * id (AC1/AC2/AC4 — reprint reproduces from the ledger), SMS-stub copy recorded
 * + audited and consent-gated (AC3), unknown transaction → 404, and the
 * staff-only guards (read for the payload, create payment for the SMS send).
 */
describe("Reception receipt (P1-E05-S06)", () => {
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
    const csrfToken = res.json().csrfToken as string;
    return { session, csrfCookie, csrfToken };
  };

  let seq = 0;
  async function seedParent(optIn: boolean): Promise<{ userId: string; walletId: string }> {
    seq += 1;
    const phone = `+25473${String(2000000 + seq).slice(-7)}`;
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "Asha", lastName: "Mwangi", smsMarketingOptIn: optIn });
    return { userId: u!.id, walletId: w!.id };
  }

  async function postEntry(walletId: string, key: string): Promise<string> {
    const [row] = await dbh.db
      .insert(walletLedger)
      .values({
        walletId,
        amount: 50_000,
        direction: "credit",
        kind: "topup",
        idempotencyKey: key,
        postedBy: "system",
        source: "cash:reception",
      })
      .returning();
    return row!.id;
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "reception"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "packer"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("returns the printable receipt payload by transaction id (AC1/AC2/AC4)", async () => {
    const p = await seedParent(true);
    const txId = await postEntry(p.walletId, "k-1");
    const recep = await loginStaff("0712000001", "7421");
    const res = await app.inject({
      method: "GET",
      url: `/reception/receipt/${txId}`,
      headers: { cookie: recep.session },
    });
    expect(res.statusCode).toBe(200);
    const { receipt } = res.json() as ReceiptResponse;
    expect(receipt.transactionId).toBe(txId);
    expect(receipt.parentName).toBe("Asha Mwangi");
    expect(receipt.amountCents).toBe(50_000);
    expect(receipt.method).toBe("topup");
    expect(receipt.lineItems).toHaveLength(1);
    expect(receipt.lineItems[0]!.description).toBe("Wallet top-up");
  });

  it("unknown transaction → 404", async () => {
    const recep = await loginStaff("0712000001", "7421");
    const res = await app.inject({
      method: "GET",
      url: "/reception/receipt/00000000-0000-0000-0000-000000000000",
      headers: { cookie: recep.session },
    });
    expect(res.statusCode).toBe(404);
  });

  it("sends an SMS-stub copy + audits it for a consenting parent (AC3)", async () => {
    const p = await seedParent(true);
    const txId = await postEntry(p.walletId, "k-1");
    const recep = await loginStaff("0712000001", "7421");
    const res = await app.inject({
      method: "POST",
      url: `/reception/receipt/${txId}/sms`,
      headers: { cookie: `${recep.session}; ${recep.csrfCookie}`, [CSRF_HEADER_NAME]: recep.csrfToken },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ReceiptSmsResponse;
    expect(body.sent).toBe(true);
    expect(body.reason).toBeNull();

    const rows = await dbh.db.select().from(smsOutbox);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.template).toBe("reception.receipt");
    expect(rows[0]!.body).toContain("KES 500.00");

    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "reception.receipt_sms"));
    expect(audits).toHaveLength(1);
  });

  it("drops the SMS copy for a non-consenting parent but still audits (AC3, consent-gated)", async () => {
    const p = await seedParent(false);
    const txId = await postEntry(p.walletId, "k-1");
    const recep = await loginStaff("0712000001", "7421");
    const res = await app.inject({
      method: "POST",
      url: `/reception/receipt/${txId}/sms`,
      headers: { cookie: `${recep.session}; ${recep.csrfCookie}`, [CSRF_HEADER_NAME]: recep.csrfToken },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ReceiptSmsResponse;
    expect(body.sent).toBe(false);
    expect(body.reason).toBe("no_consent");

    expect(await dbh.db.select().from(smsOutbox)).toHaveLength(0);
    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "reception.receipt_sms"));
    expect(audits).toHaveLength(1);
  });

  it("packer (no read wallet) cannot fetch a receipt → 403 (staff-only)", async () => {
    const p = await seedParent(true);
    const txId = await postEntry(p.walletId, "k-1");
    const packer = await loginStaff("0712000003", "7423");
    const res = await app.inject({
      method: "GET",
      url: `/reception/receipt/${txId}`,
      headers: { cookie: packer.session },
    });
    expect(res.statusCode).toBe(403);
  });

  it("packer (no create payment) cannot send the SMS copy → 403", async () => {
    const p = await seedParent(true);
    const txId = await postEntry(p.walletId, "k-1");
    const packer = await loginStaff("0712000003", "7423");
    const res = await app.inject({
      method: "POST",
      url: `/reception/receipt/${txId}/sms`,
      headers: { cookie: `${packer.session}; ${packer.csrfCookie}`, [CSRF_HEADER_NAME]: packer.csrfToken },
    });
    expect(res.statusCode).toBe(403);
  });

  it("unauthenticated receipt fetch → 401", async () => {
    const p = await seedParent(true);
    const txId = await postEntry(p.walletId, "k-1");
    const res = await app.inject({ method: "GET", url: `/reception/receipt/${txId}` });
    expect(res.statusCode).toBe(401);
  });
});
