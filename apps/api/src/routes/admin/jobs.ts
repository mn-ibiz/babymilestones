import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { desc, eq } from "drizzle-orm";
import { audit, jobRuns, users, type Database } from "@bm/db";
import { validateSession, can, CSRF_HEADER_NAME, type PermissionPrincipal } from "@bm/auth";
import type { SessionStore } from "@bm/auth";

/**
 * A job the admin console can trigger manually (P3-E06-S01 AC4). The `run`
 * handler is the same logic the scheduler invokes; it is injected so this route
 * stays decoupled from `apps/jobs` (the API never imports another app).
 */
export interface RunnableJob {
  name: string;
  run: () => Promise<void>;
}

export interface AdminJobsDeps {
  db: Database;
  sessions: SessionStore;
  /**
   * The manually-runnable jobs, keyed by name. When omitted, the run-now
   * endpoint reports an empty registry (still 200 for the list) and 404s any
   * run attempt — production wires the real registry from `apps/jobs` at boot;
   * tests inject fakes.
   */
  jobs?: RunnableJob[];
  /** Clock injection for deterministic started/ended stamps in tests. */
  now?: () => Date;
}

/** Resolve a session userId to its live id+role (for the permission guard). */
function makeResolveUser(db: Database) {
  return async (userId: string) => {
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    return u ? { id: u.id, role: u.role } : null;
  };
}

function csrfHeaderOf(req: FastifyRequest): string | null {
  const raw = req.headers[CSRF_HEADER_NAME];
  return (Array.isArray(raw) ? raw[0] : raw) ?? null;
}

/** Normalise any thrown value into a string for `job_runs.error`. */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

/**
 * Admin jobs observability + manual trigger (P3-E06-S01 AC4).
 *
 *   GET  /admin/jobs               — the runnable-job registry + each job's most
 *                                    recent run (the observability surface).
 *   GET  /admin/jobs/:name/runs    — recent `job_runs` for one job, newest-first.
 *   POST /admin/jobs/:name/run     — run the job NOW; records a `job_runs` row
 *                                    (trigger='manual', the acting user) and an
 *                                    audit entry. Returns the run outcome.
 *
 * Reserved to SUPER-ADMIN only (AC4). The gate is `manage role`: of all roles
 * only `super_admin` (the wildcard holder) can `manage` the `role` resource —
 * admin can `manage user/service/...` but NOT `role` — so this guard admits
 * super_admin alone, without a brittle string compare on the role name.
 *
 * The run-now path mirrors the scheduler's `job_runs` lifecycle inline (insert a
 * `running` row → invoke → stamp success|failed + error), so a manual run is as
 * observable as a scheduled one. A thrown handler is isolated: the row is marked
 * `failed`, the error returned, and the request still completes (no 500 leak).
 */
export function registerAdminJobs(app: FastifyInstance, deps: AdminJobsDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const now = deps.now ?? (() => new Date());
  const registry = new Map((deps.jobs ?? []).map((j) => [j.name, j]));

  /** Authenticate + enforce super-admin (`manage role`). */
  async function authorize(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<PermissionPrincipal | null> {
    const auth = await validateSession(
      {
        method: req.method,
        cookieHeader: req.headers.cookie ?? null,
        csrfHeader: csrfHeaderOf(req),
      },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      reply.code(auth.status).send({ error: auth.error });
      return null;
    }
    // Super-admin only: `manage role` is held by super_admin alone (AC4).
    if (!can(auth.user.role, "manage", "role")) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  // AC4: the registry + each job's latest run (observability surface).
  app.get("/admin/jobs", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const out = [];
    for (const job of registry.values()) {
      const [latest] = await db
        .select()
        .from(jobRuns)
        .where(eq(jobRuns.jobName, job.name))
        .orderBy(desc(jobRuns.startedAt))
        .limit(1);
      out.push({
        name: job.name,
        latestRun: latest
          ? {
              id: latest.id,
              status: latest.status,
              trigger: latest.trigger,
              startedAt: latest.startedAt.toISOString(),
              endedAt: latest.endedAt?.toISOString() ?? null,
              error: latest.error,
            }
          : null,
      });
    }
    return reply.code(200).send({ jobs: out });
  });

  // Recent runs for one job, newest-first (read-only; not audited).
  app.get("/admin/jobs/:name/runs", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { name } = req.params as { name: string };
    if (!registry.has(name)) return reply.code(404).send({ error: "Unknown job" });
    const rows = await db
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.jobName, name))
      .orderBy(desc(jobRuns.startedAt))
      .limit(50);
    return reply.code(200).send({
      runs: rows.map((r) => ({
        id: r.id,
        status: r.status,
        trigger: r.trigger,
        triggeredBy: r.triggeredBy,
        startedAt: r.startedAt.toISOString(),
        endedAt: r.endedAt?.toISOString() ?? null,
        error: r.error,
      })),
    });
  });

  // AC4: run a job NOW. Records a manual `job_runs` row + an audit entry.
  app.post("/admin/jobs/:name/run", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { name } = req.params as { name: string };
    const job = registry.get(name);
    if (!job) return reply.code(404).send({ error: "Unknown job" });

    const startedAt = now();
    // Open the run record before invoking (mirrors the scheduler lifecycle).
    const [run] = await db
      .insert(jobRuns)
      .values({ jobName: name, status: "running", trigger: "manual", triggeredBy: actor.id, startedAt })
      .returning();
    const runId = run!.id;

    // Audit the manual trigger itself (AC4 — a super-admin action / mutation).
    await audit(db, {
      actor: actor.id,
      action: "job.run_now",
      target: { table: "job_runs", id: runId },
      payload: { job: name, ip: req.ip },
    });

    try {
      await job.run();
      await db.update(jobRuns).set({ status: "success", endedAt: now() }).where(eq(jobRuns.id, runId));
      return reply.code(200).send({ runId, status: "success" });
    } catch (err) {
      // Isolate the failure: record it and return 200 with a failed outcome so
      // the operator sees the result; the thrown handler never becomes a 500.
      const message = errorMessage(err);
      await db
        .update(jobRuns)
        .set({ status: "failed", endedAt: now(), error: message })
        .where(eq(jobRuns.id, runId));
      req.log?.error?.({ event: "admin.job.run_now.failed", job: name, run_id: runId, err: message });
      return reply.code(200).send({ runId, status: "failed", error: message });
    }
  });
}
