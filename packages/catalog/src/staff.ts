import { and, desc, eq } from "drizzle-orm";
import { staff, type AttributionRole, type Database, type Transaction } from "@bm/db";

/** A drizzle executor — the top-level db or a transaction handle. */
export type Executor = Database | Transaction;

/**
 * Staff data records (P1-E07-S03). The CRUD primitives over the `staff` table:
 * pure people records that bookings are attributed to, with NO auth association.
 * The `role` taxonomy is the SAME as `services.attributionRoleRequired`
 * (P1-E07-S02) so attribution can be role-matched. Commission rate is out of
 * scope (P3-E01) — role only.
 *
 * No hard deletes: retiring a staff member is `active=false` + a `terminatedAt`
 * timestamp, so booking attribution history keeps its reference. Renames update
 * `displayName` in place but never rewrite history — bookings carry a denormalised
 * name-at-time-of-booking snapshot (Reception story S04).
 */

export interface CreateStaffInput {
  displayName: string;
  role: AttributionRole;
}

/** Create a staff member (AC1). Always created active. Returns the new row. */
export async function createStaff(db: Executor, input: CreateStaffInput) {
  const [row] = await db
    .insert(staff)
    .values({ displayName: input.displayName, role: input.role })
    .returning();
  return row!;
}

export interface UpdateStaffInput {
  /** Rename — updates the live record only; never rewrites attribution history (AC4). */
  displayName?: string;
  role?: AttributionRole;
}

/**
 * Update a staff member (AC2). Partial patch of `displayName` / `role`. A rename
 * mutates only this live row — past bookings keep their name-at-time snapshot
 * (AC4). Activation state is changed via {@link setStaffActive}, not here.
 * Returns the updated row, or null when the id is unknown.
 */
export async function updateStaff(db: Executor, id: string, patch: UpdateStaffInput) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.displayName !== undefined) set.displayName = patch.displayName;
  if (patch.role !== undefined) set.role = patch.role;
  const [row] = await db.update(staff).set(set).where(eq(staff.id, id)).returning();
  return row ?? null;
}

/**
 * Soft-activate / deactivate a staff member (AC1/AC2). Deactivating stamps
 * `terminatedAt`; reactivating clears it. NEVER a hard delete — attribution
 * history keeps referencing the row. Returns the updated row, or null when the
 * id is unknown.
 */
export async function setStaffActive(db: Executor, id: string, active: boolean) {
  const [row] = await db
    .update(staff)
    .set({ active, terminatedAt: active ? null : new Date(), updatedAt: new Date() })
    .where(eq(staff.id, id))
    .returning();
  return row ?? null;
}

/** Read one staff member by id, or null. */
export async function getStaff(db: Executor, id: string) {
  const [row] = await db.select().from(staff).where(eq(staff.id, id));
  return row ?? null;
}

/**
 * List staff, newest first. Optionally filter to `activeOnly` (exclude retired)
 * and/or a single `role` — the common Reception attribution-picker query.
 */
export async function listStaff(
  db: Executor,
  opts: { activeOnly?: boolean; role?: AttributionRole } = {},
) {
  const filters = [];
  if (opts.activeOnly) filters.push(eq(staff.active, true));
  if (opts.role) filters.push(eq(staff.role, opts.role));
  if (filters.length === 0) {
    return db.select().from(staff).orderBy(desc(staff.createdAt));
  }
  return db
    .select()
    .from(staff)
    .where(filters.length === 1 ? filters[0] : and(...filters))
    .orderBy(desc(staff.createdAt));
}

// ──────────────────────────────────────────────────────────────────────────
// Per-staff commission rate with effective dating (P3-E01-S01). The rate logic
// lives in `commission-rates.ts`; re-exported here so the staff surface carries
// it (the story files this rate logic under the staff module).
// ──────────────────────────────────────────────────────────────────────────
export {
  setCommissionRate,
  resolveRateAt,
  getOpenCommissionRate,
  listCommissionRates,
  commissionCents,
  type SetCommissionRateInput,
} from "./commission-rates.js";
