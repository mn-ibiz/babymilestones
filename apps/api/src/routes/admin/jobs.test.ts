import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, jobRuns, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";
import type { RunnableJob } from "./jobs.js";

/**
 * P3-E06-S01 AC4 — admin "run now" for background jobs, super-admin only.
 * Integration via app.inject with real staff sessions (+ CSRF), mirroring the
 * other admin route tests.
 */
describe("admin jobs run-now (P3-E06-S01 AC4)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let ranJobs: string[];

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { cookie: `${session}; ${csrfCookie}`, csrfToken: res.json().csrfToken as string };
  };
  type Creds = Awaited<ReturnType<typeof loginStaff>>;

  let superAdmin: Creds;
  let admin: Creds;
  let superAdminId: string;

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    ranJobs = [];
    const jobs: RunnableJob[] = [
      { name: "anonymise-observations", run: async () => { ranJobs.push("anonymise-observations"); } },
      { name: "boom", run: async () => { throw new Error("kaboom"); } },
    ];
    app = buildApp({ db: dbh.db, sessions, jobs });
    const [sa] = await dbh.db
      .insert(users)
      .values(await staffUserSeed("+254712000010", "7431", "super_admin"))
      .returning();
    superAdminId = sa!.id;
    await dbh.db.insert(users).values(await staffUserSeed("+254712000011", "7432", "admin"));
    superAdmin = await loginStaff("+254712000010", "7431");
    admin = await loginStaff("+254712000011", "7432");
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const post = (url: string, creds: Creds) =>
    app.inject({ method: "POST", url, headers: { cookie: creds.cookie, "x-csrf-token": creds.csrfToken } });

  it("lets a super-admin run a job now, recording a manual job_runs row + audit (AC4)", async () => {
    const res = await post("/admin/jobs/anonymise-observations/run", superAdmin);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("success");
    expect(ranJobs).toEqual(["anonymise-observations"]);

    const [row] = await dbh.db.select().from(jobRuns).where(eq(jobRuns.id, body.runId));
    expect(row!.jobName).toBe("anonymise-observations");
    expect(row!.status).toBe("success");
    expect(row!.trigger).toBe("manual");
    expect(row!.triggeredBy).toBe(superAdminId);
    expect(row!.endedAt).not.toBeNull();

    const events = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "job.run_now"));
    expect(events).toHaveLength(1);
    expect(events[0]!.actorUserId).toBe(superAdminId);
  });

  it("isolates a failing job: records failed run, returns failed outcome, no 500 (AC2/AC4)", async () => {
    const res = await post("/admin/jobs/boom/run", superAdmin);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("failed");
    expect(body.error).toContain("kaboom");
    const [row] = await dbh.db.select().from(jobRuns).where(eq(jobRuns.id, body.runId));
    expect(row!.status).toBe("failed");
    expect(row!.error).toContain("kaboom");
  });

  it("forbids a non-super-admin (admin) from running a job (AC4)", async () => {
    const res = await post("/admin/jobs/anonymise-observations/run", admin);
    expect(res.statusCode).toBe(403);
    expect(ranJobs).toEqual([]);
    const events = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "job.run_now"));
    expect(events).toHaveLength(0);
  });

  it("rejects an unauthenticated caller (401)", async () => {
    const res = await app.inject({ method: "POST", url: "/admin/jobs/anonymise-observations/run" });
    expect(res.statusCode).toBe(401);
  });

  it("404s an unknown job name", async () => {
    const res = await post("/admin/jobs/does-not-exist/run", superAdmin);
    expect(res.statusCode).toBe(404);
  });

  it("lists the registry with each job's latest run (observability surface)", async () => {
    await post("/admin/jobs/anonymise-observations/run", superAdmin);
    const res = await app.inject({ method: "GET", url: "/admin/jobs", headers: { cookie: superAdmin.cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const names = body.jobs.map((j: { name: string }) => j.name).sort();
    expect(names).toEqual(["anonymise-observations", "boom"]);
    const anon = body.jobs.find((j: { name: string }) => j.name === "anonymise-observations");
    expect(anon.latestRun.status).toBe("success");
  });
});
