import { describe, expect, it, vi } from "vitest";
import { applyMigrations, migrationFiles } from "./migrate.js";

describe("migrate (X8-S04 gated deploy step)", () => {
  it("lists numbered .sql migrations in sorted apply order", () => {
    const files = migrationFiles();
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => f.endsWith(".sql"))).toBe(true);
    expect(files).toEqual([...files].sort());
    expect(files[0]).toMatch(/^0001_/u);
  });

  it("applies every migration in order via the injected runner", async () => {
    const seen: string[] = [];
    const run = vi.fn(async (sql: string) => {
      seen.push(sql.slice(0, 1));
    });
    const applied = await applyMigrations(run);
    expect(applied).toEqual(migrationFiles());
    expect(run).toHaveBeenCalledTimes(migrationFiles().length);
  });

  it("fail-closes: stops on the first failing migration", async () => {
    let calls = 0;
    const run = vi.fn(async () => {
      calls++;
      if (calls === 2) throw new Error("bad migration");
    });
    await expect(applyMigrations(run)).rejects.toThrow("bad migration");
    expect(calls).toBe(2); // did not continue past the failure
  });
});
