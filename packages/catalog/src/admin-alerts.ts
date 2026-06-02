import { and, desc, eq, isNull } from "drizzle-orm";
import { adminAlerts, type AdminAlertRow } from "@bm/db";
import type { Executor } from "./services.js";

/**
 * P6-E04-S03 (Story 34.3) — admin in-app alert read model (the bell / alerts
 * list). A thin read/write over the `admin_alerts` table the negative-feedback
 * cron raises into:
 *
 *   - {@link listUnreadAdminAlerts} — the active, UNREAD alerts newest-first.
 *   - {@link dismissAdminAlert} — stamp `dismissed_at` so the alert drops off the
 *     list. Idempotent: dismissing an already-dismissed / unknown alert is a no-op
 *     (returns null); only the first dismiss returns the row.
 *
 * The route layer is responsible for authn/authz + the audit row.
 */

/** Active = not yet dismissed; unread = not yet acknowledged. */
function activeUnread() {
  return and(isNull(adminAlerts.readAt), isNull(adminAlerts.dismissedAt));
}

/** The active, UNREAD alerts newest-first (the bell list). Read-only. */
export async function listUnreadAdminAlerts(db: Executor): Promise<AdminAlertRow[]> {
  return db
    .select()
    .from(adminAlerts)
    .where(activeUnread())
    .orderBy(desc(adminAlerts.createdAt));
}

/**
 * Dismiss an alert (stamp `dismissed_at`) so it drops off the unread list. Only
 * stamps a still-active alert (the conditional WHERE makes it idempotent): a
 * re-dismiss / unknown id updates nothing and returns null; the first effective
 * dismiss returns the updated row.
 */
export async function dismissAdminAlert(
  db: Executor,
  id: string,
  at: Date = new Date(),
): Promise<AdminAlertRow | null> {
  const [row] = await db
    .update(adminAlerts)
    .set({ dismissedAt: at })
    .where(and(eq(adminAlerts.id, id), isNull(adminAlerts.dismissedAt)))
    .returning();
  return row ?? null;
}
