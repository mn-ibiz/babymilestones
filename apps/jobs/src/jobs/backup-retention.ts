import type { BackupRetentionPolicy } from "@bm/contracts";

/**
 * Minimal shape of a `backup_runs` row the retention selector needs. Decoupled
 * from the Drizzle row type so the selection logic stays pure and trivially
 * unit-testable.
 */
export interface PrunableBackup {
  id: string;
  startedAt: Date;
  status: string;
  location: string | null;
  prunedAt: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar-month key (UTC), e.g. "2026-05", used for the monthly tier. */
function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Decide which backups to prune under a retention policy. PURE — no I/O, clock
 * injected. Returns the eligible backups that are NOT protected by any rule.
 *
 * A backup is **eligible** for pruning only if it succeeded, still has an
 * off-host location, and has not already been pruned.
 *
 * Protection rules (a backup survives if ANY apply):
 *  1. It is the single most-recent successful backup overall — a baseline
 *     recovery point is ALWAYS retained, regardless of keep counts.
 *  2. It falls inside the grace window (`startedAt >= now - graceDays`).
 *  3. It is among the `dailyKeep` most-recent eligible backups (daily tier).
 *  4. It is the latest eligible backup in one of the `monthlyKeep` most-recent
 *     calendar months that contain an eligible backup (monthly tier).
 */
export function selectBackupsToPrune(
  runs: PrunableBackup[],
  policy: BackupRetentionPolicy,
  now: Date,
): PrunableBackup[] {
  const eligible = runs
    .filter(
      (r) => r.status === "success" && r.location != null && r.prunedAt == null,
    )
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()); // newest first

  if (eligible.length === 0) return [];

  const protectedIds = new Set<string>();

  // Rule 1 — always keep the most-recent successful backup.
  protectedIds.add(eligible[0]!.id);

  // Rule 2 — grace window.
  const graceCutoff = now.getTime() - policy.graceDays * DAY_MS;
  for (const r of eligible) {
    if (r.startedAt.getTime() >= graceCutoff) protectedIds.add(r.id);
  }

  // Rule 3 — daily tier: the N most-recent eligible backups.
  for (const r of eligible.slice(0, policy.dailyKeep)) {
    protectedIds.add(r.id);
  }

  // Rule 4 — monthly tier: latest eligible backup per calendar month, for the
  // most-recent `monthlyKeep` months that have one. `eligible` is newest-first,
  // so the first backup seen for a month is that month's latest, and Map
  // insertion order tracks recency.
  const latestPerMonth = new Map<string, string>();
  for (const r of eligible) {
    const key = monthKey(r.startedAt);
    if (!latestPerMonth.has(key)) latestPerMonth.set(key, r.id);
  }
  let monthsTaken = 0;
  for (const id of latestPerMonth.values()) {
    if (monthsTaken >= policy.monthlyKeep) break;
    protectedIds.add(id);
    monthsTaken++;
  }

  return eligible.filter((r) => !protectedIds.has(r.id));
}
