"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Background jobs console (P3-E06-S01 AC4). Super-admin only — the API guards the
 * endpoints; this surface lists the registered jobs with their most recent run
 * and offers a "Run now" button per job. A 403 from the API renders a forbidden
 * notice rather than the table.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

type LatestRun = {
  id: string;
  status: "running" | "success" | "failed";
  trigger: "schedule" | "manual";
  startedAt: string;
  endedAt: string | null;
  error: string | null;
};

type JobRow = { name: string; latestRun: LatestRun | null };

export const dynamic = "force-dynamic";

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/admin/jobs`, { credentials: "include" });
      if (r.status === 403) throw new Error("You do not have permission to view background jobs.");
      if (!r.ok) throw new Error(`Failed to load jobs (${r.status})`);
      const d = await r.json();
      setJobs(d.jobs ?? []);
      setError(null);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runNow = useCallback(
    async (name: string) => {
      setRunning(name);
      try {
        // Mutating call: send the CSRF double-submit token the app stores in a
        // readable cookie (matches the rest of the admin console).
        const csrf = document.cookie
          .split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith("bm_csrf="))
          ?.slice("bm_csrf=".length);
        const r = await fetch(`${API_BASE}/admin/jobs/${encodeURIComponent(name)}/run`, {
          method: "POST",
          credentials: "include",
          headers: csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {},
        });
        if (!r.ok) throw new Error(`Run failed (${r.status})`);
        await load();
      } catch (e) {
        setError(String((e as Error).message ?? e));
      } finally {
        setRunning(null);
      }
    },
    [load],
  );

  return (
    <main style={{ padding: 24 }}>
      <h1>Background jobs</h1>
      {loading && <p>Loading…</p>}
      {error && <p role="alert">{error}</p>}
      {!error && (
        <table>
          <thead>
            <tr>
              <th>Job</th>
              <th>Last run</th>
              <th>Status</th>
              <th>When</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.name}>
                <td>{j.name}</td>
                <td>{j.latestRun ? j.latestRun.trigger : "—"}</td>
                <td>{j.latestRun ? j.latestRun.status : "never run"}</td>
                <td>
                  {j.latestRun?.startedAt
                    ? new Date(j.latestRun.startedAt).toLocaleString()
                    : "—"}
                </td>
                <td>
                  <button
                    type="button"
                    disabled={running === j.name}
                    onClick={() => void runNow(j.name)}
                  >
                    {running === j.name ? "Running…" : "Run now"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
