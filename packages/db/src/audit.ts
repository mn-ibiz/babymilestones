import type { PgliteDatabase } from "drizzle-orm/pglite";
import type * as schema from "./schema/index.js";
import { auditOutbox, type AuditOutboxRow } from "./schema/audit.js";

type Db = PgliteDatabase<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Any drizzle executor that can run the insert — the top-level db or a
 * transaction handle. Passing a `tx` makes the audit row participate in the
 * caller's business transaction (the whole point of the outbox pattern).
 *
 * Typed against the PGlite driver for now; generalise when the prod
 * postgres-js client lands (see testing-strategy memory).
 */
export type AuditExecutor = Db | Tx;

export interface AuditInput {
  /** Acting user id, or null/undefined for system actions. */
  actor?: string | null;
  /** Dotted action name, e.g. "auth.signup". */
  action: string;
  /** What was acted on. */
  target?: { table?: string | null; id?: string | null };
  /** Arbitrary JSON context (ip, user_agent, before/after, ...). */
  payload?: Record<string, unknown>;
}

/** Insert one audit_outbox row using the caller's executor. Returns the row. */
export async function audit(db: AuditExecutor, input: AuditInput): Promise<AuditOutboxRow> {
  const [row] = await db
    .insert(auditOutbox)
    .values({
      actorUserId: input.actor ?? null,
      action: input.action,
      targetTable: input.target?.table ?? null,
      targetId: input.target?.id ?? null,
      payload: input.payload ?? {},
    })
    .returning();
  return row!;
}
