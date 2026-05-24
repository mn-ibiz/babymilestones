import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "./testing.js";
import { roles, permissions } from "./schema/permissions.js";

/**
 * Independent mirror of the seeded matrix (migration 0005). Defined here — NOT
 * imported from @bm/auth — so the db layer stays the lower layer (no backwards
 * dependency) while still acting as a drift gate: if the migration changes
 * without this list, the test fails. The @bm/auth snapshot test guards the code
 * side of the same matrix.
 */
const EXPECTED: ReadonlyArray<{ role: string; action: string; resource: string }> = [
  { role: "parent", action: "read", resource: "wallet" },
  { role: "parent", action: "read", resource: "receipt" },
  { role: "parent", action: "create", resource: "payment" },
  { role: "reception", action: "read", resource: "wallet" },
  { role: "reception", action: "create", resource: "payment" },
  { role: "reception", action: "read", resource: "receipt" },
  { role: "reception", action: "read", resource: "service" },
  { role: "reception", action: "create", resource: "user" },
  { role: "cashier", action: "read", resource: "wallet" },
  { role: "cashier", action: "create", resource: "payment" },
  { role: "cashier", action: "create", resource: "receipt" },
  { role: "cashier", action: "read", resource: "receipt" },
  { role: "packer", action: "read", resource: "service" },
  { role: "packer", action: "read", resource: "receipt" },
  { role: "accountant", action: "read", resource: "wallet" },
  { role: "accountant", action: "read", resource: "payment" },
  { role: "accountant", action: "read", resource: "refund" },
  { role: "accountant", action: "read", resource: "receipt" },
  { role: "accountant", action: "read", resource: "reconciliation" },
  { role: "accountant", action: "read", resource: "report" },
  { role: "accountant", action: "create", resource: "report" },
  { role: "treasury", action: "manage", resource: "float" },
  { role: "treasury", action: "manage", resource: "reconciliation" },
  { role: "treasury", action: "create", resource: "refund" },
  { role: "treasury", action: "read", resource: "refund" },
  { role: "treasury", action: "read", resource: "report" },
  { role: "admin", action: "manage", resource: "user" },
  { role: "admin", action: "manage", resource: "service" },
  { role: "admin", action: "manage", resource: "receipt" },
  { role: "admin", action: "manage", resource: "refund" },
  { role: "admin", action: "read", resource: "wallet" },
  { role: "admin", action: "read", resource: "audit" },
  { role: "admin", action: "read", resource: "report" },
  { role: "super_admin", action: "*", resource: "*" },
];

const sortRows = <T extends { role: string; action: string; resource: string }>(rows: T[]): T[] =>
  [...rows].sort(
    (a, b) =>
      a.role.localeCompare(b.role) ||
      a.action.localeCompare(b.action) ||
      a.resource.localeCompare(b.resource),
  );

describe("roles + permissions seed (P1-E01-S06)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("seeds the eight roles (AC1)", async () => {
    const rows = await dbh.db.select().from(roles);
    expect(rows.map((r) => r.role).sort()).toEqual(
      ["accountant", "admin", "cashier", "packer", "parent", "reception", "super_admin", "treasury"],
    );
  });

  it("seeded permissions exactly mirror the expected matrix (drift gate, AC2)", async () => {
    const dbRows = sortRows(
      (await dbh.db.select().from(permissions)).map((r) => ({
        role: r.role,
        action: r.action,
        resource: r.resource,
      })),
    );
    expect(dbRows).toEqual(sortRows([...EXPECTED]));
  });
});
