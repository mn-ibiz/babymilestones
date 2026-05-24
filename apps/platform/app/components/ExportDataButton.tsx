"use client";

import { useState } from "react";
import { requestDataExport } from "../../lib/profile-api";

/**
 * "Export my data" button (P1-E02-S05 AC1). Kicks off an async export of the
 * parent's full record (profile, children, consent, wallet, bookings, receipts)
 * and tells the parent the download link will arrive by SMS (AC2). Generation
 * happens in the background — no file is returned inline.
 */
export function ExportDataButton() {
  const [state, setState] = useState<"idle" | "requesting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setState("requesting");
    try {
      await requestDataExport();
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("idle");
    }
  }

  return (
    <section aria-label="Data export">
      <h2>Your data</h2>
      <p>
        Download everything we hold about you and your children under Kenya&apos;s Data
        Protection Act.
      </p>
      <button type="button" onClick={onClick} disabled={state === "requesting"}>
        {state === "requesting" ? "Preparing…" : "Export my data"}
      </button>
      {state === "done" && (
        <p role="status">
          We&apos;re preparing your export. We&apos;ll text you a one-time download link
          (valid 7 days) when it&apos;s ready.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
