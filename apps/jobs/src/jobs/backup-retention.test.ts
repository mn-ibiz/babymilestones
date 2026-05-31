import { describe, it, expect } from "vitest";
import {
  selectBackupsToPrune,
  type PrunableBackup,
} from "./backup-retention.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-06-01T00:00:00Z");

/** A successful, un-pruned backup `daysAgo` days before NOW. */
function backup(id: string, daysAgo: number): PrunableBackup {
  return {
    id,
    startedAt: new Date(NOW.getTime() - daysAgo * DAY),
    status: "success",
    location: `off-host/${id}.dump`,
    prunedAt: null,
  };
}

describe("selectBackupsToPrune", () => {
  it("keeps the N most-recent daily backups and prunes the rest", () => {
    const runs = Array.from({ length: 10 }, (_, i) => backup(`d${i}`, i + 1));
    const toPrune = selectBackupsToPrune(
      runs,
      { dailyKeep: 3, monthlyKeep: 0, graceDays: 0 },
      NOW,
    );
    // d0..d2 newest → kept; d3..d9 pruned.
    expect(toPrune.map((r) => r.id).sort()).toEqual([
      "d3",
      "d4",
      "d5",
      "d6",
      "d7",
      "d8",
      "d9",
    ]);
  });

  it("NEVER prunes the most-recent successful backup (dailyKeep 1, monthly 0, no grace)", () => {
    const runs = [backup("newest", 1), backup("older", 100)];
    const toPrune = selectBackupsToPrune(
      runs,
      { dailyKeep: 1, monthlyKeep: 0, graceDays: 0 },
      NOW,
    );
    expect(toPrune.map((r) => r.id)).not.toContain("newest");
    expect(toPrune.map((r) => r.id)).toEqual(["older"]);
  });

  it("never prunes anything inside the grace window", () => {
    const runs = [
      backup("a", 1),
      backup("b", 3),
      backup("c", 6),
      backup("d", 30),
    ];
    const toPrune = selectBackupsToPrune(
      runs,
      { dailyKeep: 1, monthlyKeep: 0, graceDays: 7 },
      NOW,
    );
    // a,b,c within 7 days → protected; only d prunable.
    expect(toPrune.map((r) => r.id)).toEqual(["d"]);
  });

  it("keeps the latest backup of each calendar month up to monthlyKeep", () => {
    const runs: PrunableBackup[] = [
      { id: "jun-15", startedAt: new Date("2026-06-15T00:00:00Z"), status: "success", location: "l", prunedAt: null },
      { id: "jun-02", startedAt: new Date("2026-06-02T00:00:00Z"), status: "success", location: "l", prunedAt: null },
      { id: "may-20", startedAt: new Date("2026-05-20T00:00:00Z"), status: "success", location: "l", prunedAt: null },
      { id: "may-01", startedAt: new Date("2026-05-01T00:00:00Z"), status: "success", location: "l", prunedAt: null },
      { id: "apr-10", startedAt: new Date("2026-04-10T00:00:00Z"), status: "success", location: "l", prunedAt: null },
    ];
    const at = new Date("2026-06-30T00:00:00Z");
    const toPrune = selectBackupsToPrune(
      runs,
      { dailyKeep: 1, monthlyKeep: 2, graceDays: 0 },
      at,
    );
    // dailyKeep 1 → jun-15 kept. monthlyKeep 2 → latest of June (jun-15) and
    // latest of May (may-20) kept. Prunable: jun-02, may-01, apr-10.
    expect(toPrune.map((r) => r.id).sort()).toEqual([
      "apr-10",
      "jun-02",
      "may-01",
    ]);
  });

  it("ignores failed, already-pruned, and location-less runs", () => {
    const runs: PrunableBackup[] = [
      backup("ok", 50),
      { id: "failed", startedAt: new Date(NOW.getTime() - 60 * DAY), status: "failed", location: null, prunedAt: null },
      { id: "pruned", startedAt: new Date(NOW.getTime() - 70 * DAY), status: "success", location: "l", prunedAt: new Date(NOW.getTime() - 65 * DAY) },
      { id: "noloc", startedAt: new Date(NOW.getTime() - 80 * DAY), status: "success", location: null, prunedAt: null },
    ];
    const toPrune = selectBackupsToPrune(
      runs,
      { dailyKeep: 1, monthlyKeep: 0, graceDays: 0 },
      NOW,
    );
    // Only "ok" is eligible, and it is the most-recent successful → protected.
    expect(toPrune).toEqual([]);
  });

  it("prunes an old eligible backup when a newer eligible one exists", () => {
    const runs = [backup("new", 2), backup("old", 90)];
    const toPrune = selectBackupsToPrune(
      runs,
      { dailyKeep: 1, monthlyKeep: 0, graceDays: 0 },
      NOW,
    );
    expect(toPrune.map((r) => r.id)).toEqual(["old"]);
  });

  it("returns nothing when there are no eligible backups", () => {
    expect(
      selectBackupsToPrune(
        [],
        { dailyKeep: 5, monthlyKeep: 3, graceDays: 7 },
        NOW,
      ),
    ).toEqual([]);
  });
});
