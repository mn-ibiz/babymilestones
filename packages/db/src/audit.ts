import type { Database, Transaction } from "./client.js";
import { auditOutbox, type AuditOutboxRow } from "./schema/audit.js";

/**
 * Any drizzle executor that can run the insert — the top-level db or a
 * transaction handle. Passing a `tx` makes the audit row participate in the
 * caller's business transaction (the whole point of the outbox pattern).
 */
export type AuditExecutor = Database | Transaction;

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

/**
 * Insert one audit_outbox row using the caller's executor. Returns the row.
 *
 * ATOMICITY CONTRACT: when auditing a business write, pass the SAME `tx` handle to
 * both the write and this call so they commit (or roll back) together. Passing the
 * top-level `db` here while the business write used a different executor makes the
 * two non-atomic — the action can persist without its audit row, or vice-versa.
 * Only pass the bare `db` for genuinely standalone audit events (no paired write).
 */
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
