import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core";

/**
 * Role taxonomy + (role, action, resource) permission matrix (P1-E01-S06).
 * Seeded by migration 0005 and mirrored by `@bm/auth` PERMISSION_MATRIX; the
 * snapshot test fails CI if the two drift. Enforcement is server-side only.
 */
export const roles = pgTable("roles", {
  role: text("role").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const permissions = pgTable(
  "permissions",
  {
    role: text("role")
      .notNull()
      .references(() => roles.role),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.role, t.action, t.resource] }),
  }),
);

/**
 * Named capabilities — fine-grained, high-trust actions granted to an explicit
 * role allow-list, independent of the (action, resource) matrix (P1-E06-S03).
 * Seeded by migration 0027 and mirrored by `@bm/auth` CAPABILITY_MATRIX; the
 * capability snapshot test fails CI if the two drift. Server-side enforcement
 * only, via `requireCapability(...)`.
 */
export const roleCapabilities = pgTable(
  "role_capabilities",
  {
    role: text("role")
      .notNull()
      .references(() => roles.role),
    capability: text("capability").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.role, t.capability] }),
  }),
);

export type RoleRow = typeof roles.$inferSelect;
export type PermissionRow = typeof permissions.$inferSelect;
export type RoleCapabilityRow = typeof roleCapabilities.$inferSelect;
