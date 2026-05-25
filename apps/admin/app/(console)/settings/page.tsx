"use client";

import { useEffect, useState } from "react";
import type { SettingsSection } from "../../../lib/settings-view";

/**
 * Settings sub-app index (P1-E10-S04 AC1). A single place that aggregates every
 * system-wide configuration surface: the SMS provider and float-account sections
 * link out to their dedicated screens; the general sections (loyalty, branding,
 * receipt branding) link to their key/value editors here under /settings/*.
 *
 * The API (`/admin/settings`) re-checks `manage config` and tags each section
 * with whether the caller can reach it — the float sub-section additionally
 * requires the treasury grant (AC2). A section the caller cannot access is shown
 * disabled rather than hidden, so the area is self-documenting.
 */
export default function SettingsPage() {
  const [sections, setSections] = useState<SettingsSection[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/admin/settings", { credentials: "include" });
      if (!res.ok) {
        setError(res.status === 403 ? "You do not have access to settings." : "Failed to load.");
        return;
      }
      setError(null);
      const body = (await res.json()) as { sections: SettingsSection[] };
      setSections(body.sections);
    })();
  }, []);

  if (error) return <p role="alert">{error}</p>;

  return (
    <section>
      <h1>Settings</h1>
      <p>Manage system-wide configuration: SMS, float, loyalty, and branding — all from one place.</p>
      <ul aria-label="Settings sections">
        {sections.map((s) =>
          s.accessible ? (
            <li key={s.key}>
              <a href={s.href}>{s.label}</a>
              {s.kind === "linked" ? " ↗" : null}
            </li>
          ) : (
            <li key={s.key} data-disabled-section aria-disabled="true">
              <span>{s.label}</span> <em>(requires treasury access)</em>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
