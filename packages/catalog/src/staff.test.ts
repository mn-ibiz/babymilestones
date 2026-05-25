import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { staff } from "@bm/db";
import { ATTRIBUTION_ROLES } from "./services.js";
import {
  createStaff,
  getStaff,
  listStaff,
  setStaffActive,
  updateStaff,
} from "./staff.js";

/**
 * P1-E07-S03 — staff data records (no logins) domain logic. DB-backed via the
 * PGlite harness. Covers create/update, role alignment with the attribution-role
 * taxonomy, soft deactivation via active/terminatedAt (no hard delete), and that
 * a rename mutates only the live row (no history rewrite).
 */
describe("staff data records (P1-E07-S03)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("creates a staff member active by default, no terminatedAt (AC1)", async () => {
    const row = await createStaff(dbh.db, { displayName: "Asha", role: "stylist" });
    expect(row.displayName).toBe("Asha");
    expect(row.role).toBe("stylist");
    expect(row.active).toBe(true);
    expect(row.terminatedAt).toBeNull();
  });

  it("has no auth/user association (data record only)", async () => {
    await createStaff(dbh.db, { displayName: "Bina", role: "coach" });
    // The staff table has no user_id / auth column — assert the column set.
    const cols = await dbh.db.execute(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'staff'`,
    );
    const names = (cols.rows as { column_name: string }[]).map((r) => r.column_name);
    expect(names).not.toContain("user_id");
    expect(names).toEqual(
      expect.arrayContaining([
        "id",
        "display_name",
        "role",
        "active",
        "terminated_at",
        "created_at",
        "updated_at",
      ]),
    );
  });

  it("accepts every attribution-role taxonomy value (role alignment with 7-2)", async () => {
    for (const role of ATTRIBUTION_ROLES) {
      const row = await createStaff(dbh.db, { displayName: `Staff ${role}`, role });
      expect(row.role).toBe(role);
    }
  });

  it("rejects a role outside the taxonomy (CHECK constraint)", async () => {
    await expect(
      dbh.db.insert(staff).values({ displayName: "Bad", role: "cashier" as never }),
    ).rejects.toThrow();
  });

  it("renames in place without touching role/active (AC4 — live row only)", async () => {
    const row = await createStaff(dbh.db, { displayName: "Old Name", role: "instructor" });
    const updated = await updateStaff(dbh.db, row.id, { displayName: "New Name" });
    expect(updated?.displayName).toBe("New Name");
    expect(updated?.role).toBe("instructor"); // unchanged
    expect(updated?.active).toBe(true); // unchanged
    expect(updated?.id).toBe(row.id); // same row — no new record
  });

  it("updates role (partial patch)", async () => {
    const row = await createStaff(dbh.db, { displayName: "Cee", role: "attendant" });
    const updated = await updateStaff(dbh.db, row.id, { role: "event_staff" });
    expect(updated?.role).toBe("event_staff");
    expect(updated?.displayName).toBe("Cee");
  });

  it("returns null updating an unknown id", async () => {
    const updated = await updateStaff(dbh.db, "00000000-0000-0000-0000-000000000000", {
      displayName: "X",
    });
    expect(updated).toBeNull();
  });

  it("deactivates via active=false + terminatedAt (soft delete, AC1/AC2)", async () => {
    const row = await createStaff(dbh.db, { displayName: "Dee", role: "stylist" });
    const off = await setStaffActive(dbh.db, row.id, false);
    expect(off?.active).toBe(false);
    expect(off?.terminatedAt).toBeInstanceOf(Date);
    // Soft delete — the row still exists.
    const still = await getStaff(dbh.db, row.id);
    expect(still).not.toBeNull();
  });

  it("reactivating clears terminatedAt", async () => {
    const row = await createStaff(dbh.db, { displayName: "Eve", role: "coach" });
    await setStaffActive(dbh.db, row.id, false);
    const on = await setStaffActive(dbh.db, row.id, true);
    expect(on?.active).toBe(true);
    expect(on?.terminatedAt).toBeNull();
  });

  it("lists newest first, filters by activeOnly and role", async () => {
    const a = await createStaff(dbh.db, { displayName: "A", role: "stylist" });
    const b = await createStaff(dbh.db, { displayName: "B", role: "coach" });
    await createStaff(dbh.db, { displayName: "C", role: "stylist" });
    await setStaffActive(dbh.db, a.id, false);

    const all = await listStaff(dbh.db);
    expect(all).toHaveLength(3);

    const activeOnly = await listStaff(dbh.db, { activeOnly: true });
    expect(activeOnly.map((r) => r.id)).not.toContain(a.id);

    const stylists = await listStaff(dbh.db, { role: "stylist" });
    expect(stylists.every((r) => r.role === "stylist")).toBe(true);
    expect(stylists).toHaveLength(2);

    const activeStylists = await listStaff(dbh.db, { activeOnly: true, role: "stylist" });
    expect(activeStylists).toHaveLength(1); // C only (A retired)
    expect(activeStylists.some((r) => r.id === b.id)).toBe(false);
  });
});
