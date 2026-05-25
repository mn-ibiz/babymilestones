"use client";

import { useEffect, useState } from "react";
import {
  buildBrandingPayload,
  validateSettingForm,
} from "../../../../lib/settings-view";

/**
 * Branding editor (P1-E10-S04 AC1): store name, logo URL, primary/secondary
 * colours. Reads/writes the `branding` general settings section via
 * `/admin/settings/branding`; the API re-validates and audits the save (AC3).
 */
export default function BrandingSettingsPage() {
  const [form, setForm] = useState({
    storeName: "",
    logoUrl: "",
    primaryColour: "",
    secondaryColour: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/admin/settings/branding", { credentials: "include" });
      if (!res.ok) {
        setError(res.status === 403 ? "You do not have access to settings." : "Failed to load.");
        return;
      }
      const body = (await res.json()) as {
        value: { storeName?: string; logoUrl?: string; primaryColour?: string; secondaryColour?: string };
      };
      setForm({
        storeName: body.value.storeName ?? "",
        logoUrl: body.value.logoUrl ?? "",
        primaryColour: body.value.primaryColour ?? "",
        secondaryColour: body.value.secondaryColour ?? "",
      });
    })();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    const payload = buildBrandingPayload(form);
    const found = validateSettingForm("branding", payload);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const res = await fetch("/admin/settings/branding", {
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
      <h1>Branding</h1>
      <form onSubmit={onSubmit} aria-label="Branding">
        <label>
          Store name
          <input name="storeName" value={form.storeName} onChange={set("storeName")} />
        </label>
        {errors.storeName ? <p role="alert">{errors.storeName}</p> : null}
        <label>
          Logo URL
          <input name="logoUrl" value={form.logoUrl} onChange={set("logoUrl")} />
        </label>
        {errors.logoUrl ? <p role="alert">{errors.logoUrl}</p> : null}
        <label>
          Primary colour
          <input name="primaryColour" value={form.primaryColour} onChange={set("primaryColour")} placeholder="#1a2b3c" />
        </label>
        {errors.primaryColour ? <p role="alert">{errors.primaryColour}</p> : null}
        <label>
          Secondary colour
          <input
            name="secondaryColour"
            value={form.secondaryColour}
            onChange={set("secondaryColour")}
            placeholder="#aabbcc"
          />
        </label>
        {errors.secondaryColour ? <p role="alert">{errors.secondaryColour}</p> : null}
        <button type="submit">Save</button>
      </form>
      {status ? <p data-save-status>{status}</p> : null}
    </section>
  );
}
