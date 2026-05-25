import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** Return the numbered `.sql` migration filenames in apply order. */
export function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

type SqlRunner = (sql: string) => Promise<unknown>;

/**
 * Apply every migration in order using the provided runner. Additive-only by
 * convention; the runner is injected so this is unit-testable without a live
 * database. Throws (fail-closed) on the first failing file.
 */
export async function applyMigrations(run: SqlRunner): Promise<string[]> {
  const applied: string[] = [];
  for (const file of migrationFiles()) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    await run(sql);
    applied.push(file);
  }
  return applied;
}

/**
 * CLI entrypoint used by the gated `migrate:deploy` step in deploy.yml.
 * Connects to `DATABASE_URL` and applies all migrations, exiting non-zero on
 * any failure so the deploy fail-closes before any app ships.
 */
export async function runDeployMigration(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required to apply migrations");
  }
  // Lazy import so the bare module (and its tests) do not require a live driver.
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 1 });
  try {
    const applied = await applyMigrations((stmt) => sql.unsafe(stmt));
    console.log(`Applied ${applied.length} migration(s).`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Run when invoked directly (e.g. `node dist/migrate.js`).
const invokedPath = process.argv[1] ?? "";
if (invokedPath.endsWith("migrate.ts") || invokedPath.endsWith("migrate.js")) {
  runDeployMigration().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
