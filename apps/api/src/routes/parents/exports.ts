import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { audit, dataExports, users, type Database } from "@bm/db";
import { validateSession, CSRF_HEADER_NAME } from "@bm/auth";
import type { ExportStorage } from "@bm/export";
import type { ParentsDeps } from "./index.js";

/** Resolve a session userId to its live id+role. */
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

export interface ExportRoutesDeps extends ParentsDeps {
  /** Shared signed-URL S3-equivalent store the async job writes the ZIP into. */
  exportStorage: ExportStorage;
  /** Enqueue the export job for async processing (>5s generation, AC2). */
  enqueueExport: (exportId: string) => void;
  /** Clock for deterministic expiry checks. Defaults to Date.now. */
  now?: () => number;
}

/**
 * Data-portability export routes (P1-E02-S05, Kenya DPA right of access).
 *
 * - POST /parents/me/exports          → enqueue an async export of the authed
 *   parent's full record; 202 Accepted immediately (generation is async, AC2);
 *   the export-requested event is audited (AC3).
 * - GET  /exports/download?token=...  → single-use download of the ZIP, valid 7
 *   days (AC2). Enforces expiry + single-use; consuming the token marks the row.
 *
 * Ownership: the export is always scoped to the session's own userId — a parent
 * can only ever export their own data.
 */
export function registerParentExports(app: FastifyInstance, deps: ExportRoutesDeps): void {
  const { db, sessions, exportStorage, enqueueExport } = deps;
  const now = deps.now ?? Date.now;
  const resolveUser = makeResolveUser(db);

  app.post("/parents/me/exports", async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });
    const userId = auth.user.id;

    const exportId = await db.transaction(async (tx) => {
      const [row] = await tx.insert(dataExports).values({ userId }).returning();
      // AC3: the export request is audited (sensitive data-access action).
      await audit(tx, {
        actor: userId,
        action: "parent.data.export.requested",
        target: { table: "data_exports", id: row!.id },
        payload: { ip: req.ip, user_agent: req.headers["user-agent"] ?? null },
      });
      return row!.id;
    });

    // AC2: generation is async — hand off to the job and return immediately.
    enqueueExport(exportId);
    return reply.code(202).send({ exportId, status: "pending" });
  });

  app.get<{ Querystring: { token?: string } }>(
    "/exports/download",
    async (req, reply) => {
      const token = req.query.token;
      if (!token) return reply.code(400).send({ error: "Missing token" });

      const [row] = await db
        .select()
        .from(dataExports)
        .where(eq(dataExports.downloadToken, token));

      // Unknown/already-consumed/not-ready tokens are indistinguishable (404) so
      // the endpoint leaks nothing about other parents' exports.
      if (!row || row.status !== "ready") return reply.code(404).send({ error: "Export not found" });
      if (row.consumedAt) return reply.code(410).send({ error: "Download link already used" });
      if (row.expiresAt && row.expiresAt.getTime() < now()) {
        return reply.code(410).send({ error: "Download link expired" });
      }

      // Single-use: consume the token first (only if still unconsumed) so two
      // concurrent requests cannot both succeed.
      const consumed = await db
        .update(dataExports)
        .set({ consumedAt: new Date(now()) })
        .where(and(eq(dataExports.id, row.id), isNull(dataExports.consumedAt)))
        .returning();
      if (consumed.length === 0) return reply.code(410).send({ error: "Download link already used" });

      const zip = await exportStorage.get(row.storageKey!);
      if (!zip) return reply.code(404).send({ error: "Export artifact missing" });

      await audit(db, {
        actor: row.userId,
        action: "parent.data.export.downloaded",
        target: { table: "data_exports", id: row.id },
        payload: { ip: req.ip, user_agent: req.headers["user-agent"] ?? null },
      });

      return reply
        .code(200)
        .header("content-type", "application/zip")
        .header("content-disposition", `attachment; filename="baby-milestones-export-${row.id}.zip"`)
        .send(zip);
    },
  );
}
