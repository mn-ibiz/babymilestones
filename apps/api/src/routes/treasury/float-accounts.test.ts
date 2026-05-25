import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, floatAccounts, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P1-E06-S01 — Float-account CRUD route. Integration via app.inject with real
 * staff sessions (+ CSRF). Covers admin/treasury enforcement (AC2), validation
 * (AC1), audit on every mutation (DoD), and the full CRUD lifecycle.
 */
describe("Float-account CRUD (P1-E06-S01)", () => {
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

  type Creds = Awaited<ReturnType<typeof loginStaff>>;

  const req = (
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    creds: Creds,
    payload?: Record<string, unknown>,
    opts: { auth?: boolean; csrf?: boolean } = {},
  ) => {
    const { auth = true, csrf = true } = opts;
    const cookieParts: string[] = [];
    if (auth) cookieParts.push(creds.session);
    if (csrf) cookieParts.push(creds.csrfCookie);
    return app.inject({
      method,
      url,
      headers: {
        cookie: cookieParts.join("; "),
        ...(csrf ? { "x-csrf-token": creds.csrfToken } : {}),
      },
      ...(payload ? { payload } : {}),
    });
  };

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000002", "7422", "treasury"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const validCreate = { name: "M-Pesa Till 1", kind: "mpesa_till", openingDate: "2026-05-25" };

  it("treasury can create a float account, audited (AC1/AC2/DoD)", async () => {
    const creds = await loginStaff("+254712000002", "7422");
    const res = await req("POST", "/treasury/float-accounts", creds, validCreate);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("M-Pesa Till 1");
    expect(body.kind).toBe("mpesa_till");
    expect(body.openingBalance).toBe(0);
    expect(body.active).toBe(true);

    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "treasury.float_account.create"));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.targetId).toBe(body.id);
  });

  it("admin can create too (AC2)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/treasury/float-accounts", creds, validCreate);
    expect(res.statusCode).toBe(201);
  });

  it("reception is forbidden (AC2)", async () => {
    const creds = await loginStaff("+254712000003", "7423");
    const res = await req("POST", "/treasury/float-accounts", creds, validCreate);
    expect(res.statusCode).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    const creds = await loginStaff("+254712000002", "7422");
    const res = await req("POST", "/treasury/float-accounts", creds, validCreate, { auth: false });
    expect(res.statusCode).toBe(401);
  });

  it("rejects an invalid kind (AC1 validation)", async () => {
    const creds = await loginStaff("+254712000002", "7422");
    const res = await req("POST", "/treasury/float-accounts", creds, {
      ...validCreate,
      kind: "crypto",
    });
    expect(res.statusCode).toBe(400);
  });

  it("lists, reads, updates and soft-deletes (full lifecycle, audited)", async () => {
    const creds = await loginStaff("+254712000002", "7422");
    const created = (await req("POST", "/treasury/float-accounts", creds, validCreate)).json();

    const list = await req("GET", "/treasury/float-accounts", creds);
    expect(list.statusCode).toBe(200);
    expect(list.json().accounts).toHaveLength(1);

    const read = await req("GET", `/treasury/float-accounts/${created.id}`, creds);
    expect(read.statusCode).toBe(200);
    expect(read.json().id).toBe(created.id);

    const patched = await req("PATCH", `/treasury/float-accounts/${created.id}`, creds, {
      name: "Renamed Till",
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().name).toBe("Renamed Till");

    const del = await req("DELETE", `/treasury/float-accounts/${created.id}`, creds);
    expect(del.statusCode).toBe(200);
    expect(del.json().active).toBe(false);

    const [row] = await dbh.db
      .select()
      .from(floatAccounts)
      .where(eq(floatAccounts.id, created.id));
    expect(row!.active).toBe(false); // soft-delete: row preserved

    const muts = await dbh.db.select().from(auditOutbox);
    const actions = muts.map((a) => a.action);
    expect(actions).toContain("treasury.float_account.update");
    expect(actions).toContain("treasury.float_account.delete");
  });

  it("update rejects an empty patch (AC1) and 404s an unknown id", async () => {
    const creds = await loginStaff("+254712000002", "7422");
    const created = (await req("POST", "/treasury/float-accounts", creds, validCreate)).json();
    const empty = await req("PATCH", `/treasury/float-accounts/${created.id}`, creds, {});
    expect(empty.statusCode).toBe(400);

    const missing = await req(
      "GET",
      "/treasury/float-accounts/00000000-0000-0000-0000-000000000000",
      creds,
    );
    expect(missing.statusCode).toBe(404);
  });
});
