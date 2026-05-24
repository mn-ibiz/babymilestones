import type { PgliteDatabase } from "drizzle-orm/pglite";
import type * as schema from "./schema/index.js";

/**
 * The drizzle database handle. Typed against the PGlite driver for now (tests +
 * local dev); generalise to the prod postgres-js client when that wiring lands.
 */
export type Database = PgliteDatabase<typeof schema>;

/** A transaction handle derived from {@link Database}. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
