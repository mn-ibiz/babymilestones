"use client";

import { useEffect, useState } from "react";
import {
  buildLoyaltyPayload,
  validateSettingForm,
} from "../../../../lib/settings-view";

/**
 * Loyalty rates editor (P1-E10-S04 AC1). Reads/writes the `loyalty` general
 * settings section via `/admin/settings/loyalty`. The API re-validates and
 * audits the save (AC3); this screen mirrors the contract for instant feedback.
 */
export default function LoyaltySettingsPage() {
  const [form, setForm] = useState({ earnRatePer100: "", redeemValuePerPoint: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/admin/settings/loyalty", { credentials: "include" });
      if (!res.ok) {
        setError(res.status === 403 ? "You do not have access to settings." : "Failed to load.");
        return;
      }
      const body = (await res.json()) as { value: { earnRatePer100: number; redeemValuePerPoint: number } };
      setForm({
        earnRatePer100: String(body.value.earnRatePer100),
        redeemValuePerPoint: String(body.value.redeemValuePerPoint),
      });
    })();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    const payload = buildLoyaltyPayload(form);
    const found = validateSettingForm("loyalty", payload);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const res = await fetch("/admin/settings/loyalty", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setStatus(res.ok ? "Saved." : "Save failed.");
  };

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  if (error) return <p role="alert">{error}</p>;

  return (
    <section>
      <h1>Loyalty rates</h1>
      <form onSubmit={onSubmit} aria-label="Loyalty rates">
        <label>
          Points earned per KES 100
          <input name="earnRatePer100" value={form.earnRatePer100} onChange={set("earnRatePer100")} />
        </label>
        {errors.earnRatePer100 ? <p role="alert">{errors.earnRatePer100}</p> : null}
        <label>
          KES value per point
          <input
            name="redeemValuePerPoint"
            value={form.redeemValuePerPoint}
            onChange={set("redeemValuePerPoint")}
          />
        </label>
        {errors.redeemValuePerPoint ? <p role="alert">{errors.redeemValuePerPoint}</p> : null}
        <button type="submit">Save</button>
      </form>
      {status ? <p data-save-status>{status}</p> : null}
    </section>
  );
}
