import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema/index.js";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export interface TestDb {
  pg: PGlite;
  db: PgliteDatabase<typeof schema>;
  close: () => Promise<void>;
}

/**
 * Spin up a fresh in-memory Postgres (PGlite — real Postgres in WASM) and apply
 * all migration SQL files in order. One instance per test for full isolation.
 */
export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  // PGlite's multi-statement SQL runner (NOT child_process) — bound to a local
  // so the migration loop reads clearly.
  const runSql = pg.exec.bind(pg);
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await runSql(readFileSync(join(migrationsDir, file), "utf8"));
  }
  const db = drizzle(pg, { schema });
  return { pg, db, close: () => pg.close() };
}
