import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * `admin_alerts` (P6-E04-S03 / Story 34.3) — a minimal IN-APP alert surface (the
 * bell / alerts list) for admins. One row per raised alert: a typed,
 * severity-tagged heads-up that links to a detail view (`linkPath`). Unread until
 * an admin marks it read or dismisses it.
 *
 * The only producer today is the negative-feedback cron (Story 34.3): when a
 * parent submits a LOW rating (≤2), the worker raises ONE `negative_feedback`
 * alert (+ an SMS to the configured ops number) linking to the feedback detail.
 *
 * IDEMPOTENCY: at most ONE alert per source touchpoint, enforced by the UNIQUE
 * (type, sourceType, sourceId) constraint via `onConflictDoNothing`. A replayed
 * raise (a cron re-run that races the `feedback.alertedAt` stamp) inserts nothing.
 * `title`/`body` NEVER carry the parent's comment text — ids/labels only.
 */
export const adminAlerts = pgTable(
  "admin_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The alert kind, e.g. 'negative_feedback'. Extensible plain text. */
    type: text("type").notNull(),
    /** Severity bucket: 'info' | 'warning' | 'critical' (CHECK-constrained in SQL). */
    severity: text("severity").notNull().default("warning"),
    /** What the alert is about (the source row kind): e.g. 'feedback'. */
    sourceType: text("source_type").notNull(),
    /** The source row id (the feedback id) — opaque text. */
    sourceId: text("source_id").notNull(),
    /** Short human title for the in-app list (no sensitive free text). */
    title: text("title").notNull(),
    /** Optional short body/summary (no sensitive free text). */
    body: text("body"),
    /** The in-app path the alert links to (the feedback detail view, AC2). */
    linkPath: text("link_path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    /** NULL = unread. Stamped when an admin opens / acknowledges the alert. */
    readAt: timestamp("read_at", { withTimezone: true }),
    /** NULL = active. Stamped when an admin dismisses the alert from the list. */
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  },
  (t) => ({
    // Idempotency: one alert per (type, source touchpoint). A replayed raise hits
    // this and is swallowed via `onConflictDoNothing`.
    sourceUniq: uniqueIndex("admin_alerts_source_uniq").on(t.type, t.sourceType, t.sourceId),
    unreadIdx: index("admin_alerts_unread_idx").on(t.createdAt),
  }),
);

export type AdminAlertRow = typeof adminAlerts.$inferSelect;
export type AdminAlertInsert = typeof adminAlerts.$inferInsert;
