import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { services, servicePrices, type Database, type Transaction } from "@bm/db";

/** A drizzle executor — the top-level db or a transaction handle. */
export type Executor = Database | Transaction;

/**
 * Raised by {@link setServicePrice} when a new price's `effectiveFrom` is not
 * strictly after the current open price's `effectiveFrom`. The history is
 * append-forward only — a new price cannot start on/before the current one.
 */
export class ServicePriceOrderError extends Error {
  constructor(
    public readonly currentEffectiveFrom: string,
    public readonly attemptedEffectiveFrom: string,
  ) {
    super(
      `New price effectiveFrom (${attemptedEffectiveFrom}) must be after the current price's effectiveFrom (${currentEffectiveFrom})`,
    );
    this.name = "ServicePriceOrderError";
  }
}

/** The unit kinds a service may have (mirrors the migration CHECK + contract enum). */
export const SERVICE_UNITS = ["play", "talent", "salon", "coaching", "event"] as const;
export type ServiceUnit = (typeof SERVICE_UNITS)[number];

export interface CreateServiceInput {
  name: string;
  description?: string | null;
  unit: ServiceUnit;
  attributionRoleRequired?: string | null;
}

/** Create a service (AC1). Always created active. Returns the new row. */
export async function createService(db: Executor, input: CreateServiceInput) {
  const [row] = await db
    .insert(services)
    .values({
      name: input.name,
      description: input.description ?? null,
      unit: input.unit,
      attributionRoleRequired: input.attributionRoleRequired ?? null,
    })
    .returning();
  return row!;
}

export interface UpdateServiceInput {
  name?: string;
  description?: string | null;
  /** Soft-delete via `isActive = false` — there are NO hard deletes (Technical Notes). */
  isActive?: boolean;
  attributionRoleRequired?: string | null;
}

/**
 * Update a service (AC1). Partial patch; `unit` is intentionally immutable after
 * creation (it changes booking semantics). Retiring a service is `isActive=false`
 * — never a hard delete, so booking history keeps its FK. Returns the updated row
 * or null when the id is unknown.
 */
export async function updateService(db: Executor, id: string, patch: UpdateServiceInput) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  if (patch.attributionRoleRequired !== undefined)
    set.attributionRoleRequired = patch.attributionRoleRequired;
  const [row] = await db.update(services).set(set).where(eq(services.id, id)).returning();
  return row ?? null;
}

/** Read one service by id, or null. */
export async function getService(db: Executor, id: string) {
  const [row] = await db.select().from(services).where(eq(services.id, id));
  return row ?? null;
}

/** List services, newest first. Pass `activeOnly` to exclude soft-deleted rows. */
export async function listServices(db: Executor, opts: { activeOnly?: boolean } = {}) {
  if (opts.activeOnly) {
    return db
      .select()
      .from(services)
      .where(eq(services.isActive, true))
      .orderBy(desc(services.createdAt));
  }
  return db.select().from(services).orderBy(desc(services.createdAt));
}

/**
 * Set a new effective-dated price for a service (AC2/AC3). NEVER mutates an
 * amount in place: it closes the currently-open price row (the one with a null
 * `effectiveTo`) by setting its `effectiveTo` to `effectiveFrom`, then inserts a
 * new open row with the new amount. Runs in a transaction so the close + insert
 * are atomic. Returns the newly inserted price row.
 *
 * `effectiveFrom` is a YYYY-MM-DD calendar date. The new row's range is
 * `[effectiveFrom, null)` (open/current).
 */
export async function setServicePrice(
  db: Database,
  input: { serviceId: string; amountCents: number; effectiveFrom: string },
) {
  return db.transaction(async (tx) => {
    // Find the current open row (null effectiveTo). A new price must start
    // strictly AFTER it — otherwise closing the old row to `effectiveFrom` would
    // produce an invalid (from >= to) range and the catalogue would gain a
    // backdated price the lookup can't order. Reject rather than corrupt history.
    const [open] = await tx
      .select()
      .from(servicePrices)
      .where(and(eq(servicePrices.serviceId, input.serviceId), isNull(servicePrices.effectiveTo)));
    if (open && input.effectiveFrom <= open.effectiveFrom) {
      throw new ServicePriceOrderError(open.effectiveFrom, input.effectiveFrom);
    }
    // Close the current open row (if any) at the new price's start date.
    await tx
      .update(servicePrices)
      .set({ effectiveTo: input.effectiveFrom })
      .where(
        and(eq(servicePrices.serviceId, input.serviceId), isNull(servicePrices.effectiveTo)),
      );
    const [row] = await tx
      .insert(servicePrices)
      .values({
        serviceId: input.serviceId,
        amountCents: input.amountCents,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: null,
      })
      .returning();
    return row!;
  });
}

/** Full price history for a service, oldest first. */
export async function listServicePrices(db: Executor, serviceId: string) {
  return db
    .select()
    .from(servicePrices)
    .where(eq(servicePrices.serviceId, serviceId))
    .orderBy(asc(servicePrices.effectiveFrom));
}

/**
 * Resolve the price applicable to a service at a booking date (AC4). Returns the
 * row whose half-open range `[effectiveFrom, effectiveTo)` contains `bookingDate`:
 * `effectiveFrom <= bookingDate AND (effectiveTo IS NULL OR bookingDate < effectiveTo)`.
 * Returns null when no price covers the date (e.g. before the first effectiveFrom).
 *
 * `bookingDate` is a YYYY-MM-DD calendar date. The comparison is on the ISO
 * string, which is lexicographically ordered the same as the calendar for
 * zero-padded YYYY-MM-DD, so no Date parsing is needed.
 */
export async function resolveServicePriceAt(
  db: Executor,
  serviceId: string,
  bookingDate: string,
) {
  const rows = await db
    .select()
    .from(servicePrices)
    .where(eq(servicePrices.serviceId, serviceId))
    .orderBy(asc(servicePrices.effectiveFrom));
  for (const row of rows) {
    const fromOk = row.effectiveFrom <= bookingDate;
    const toOk = row.effectiveTo === null || bookingDate < row.effectiveTo;
    if (fromOk && toOk) return row;
  }
  return null;
}
