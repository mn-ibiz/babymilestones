"use client";

import { useEffect, useState } from "react";
import { liveStatusLabel, toggleConfirmMessage } from "../../../lib/sms-live";

/**
 * Live/stub switch island (P5-E03-S02). Loads the current flag, lets an admin
 * flip it (with a confirm), and persists via PUT /api/admin/sms-live. Minimal,
 * dependency-free UI matching the existing admin surfaces.
 */
export function SmsLiveClient() {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    // credentials:include so the session + CSRF cookies are sent cross-origin —
    // without it the API never sees the session and this GET silently 401s to the
    // {enabled:false} fallback (and the PUT below is rejected). Matches sms-config.
    fetch("/api/admin/sms-live", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((j) => setEnabled(Boolean(j.enabled)))
      .catch(() => setStatus("error"));
  }, []);

  async function toggle() {
    const next = !enabled;
    if (!confirm(toggleConfirmMessage(next))) return;
    setStatus("saving...");
    const res = await fetch("/api/admin/sms-live", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    if (res.ok) {
      const j = await res.json();
      setEnabled(Boolean(j.enabled));
      setStatus("saved");
    } else {
      setStatus("error");
    }
  }

  return (
    <section>
      <p>{liveStatusLabel(enabled)}</p>
      <button type="button" onClick={toggle}>
        {enabled ? "Switch to stub" : "Go live"}
      </button>
      {status && <p>{status}</p>}
    </section>
  );
}
