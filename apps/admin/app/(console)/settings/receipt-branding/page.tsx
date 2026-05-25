"use client";

import { useEffect, useState } from "react";
import {
  buildReceiptBrandingPayload,
  validateSettingForm,
} from "../../../../lib/settings-view";

/**
 * Receipt branding editor (P1-E10-S04 AC1): header/footer lines + whether to show
 * the logo on printed receipts. Reads/writes the `receipt_branding` general
 * settings section via `/admin/settings/receipt_branding`; the API re-validates
 * and audits the save (AC3).
 */
export default function ReceiptBrandingSettingsPage() {
  const [form, setForm] = useState({ headerLine: "", footerLine: "", showLogo: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/admin/settings/receipt_branding", { credentials: "include" });
      if (!res.ok) {
        setError(res.status === 403 ? "You do not have access to settings." : "Failed to load.");
        return;
      }
      const body = (await res.json()) as {
        value: { headerLine?: string; footerLine?: string; showLogo?: boolean };
      };
      setForm({
        headerLine: body.value.headerLine ?? "",
        footerLine: body.value.footerLine ?? "",
        showLogo: body.value.showLogo ?? false,
      });
    })();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    const payload = buildReceiptBrandingPayload(form);
    const found = validateSettingForm("receipt_branding", payload);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const res = await fetch("/admin/settings/receipt_branding", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setStatus(res.ok ? "Saved." : "Save failed.");
  };

  if (error) return <p role="alert">{error}</p>;

  return (
    <section>
      <h1>Receipt branding</h1>
      <form onSubmit={onSubmit} aria-label="Receipt branding">
        <label>
          Header line
          <input
            name="headerLine"
            value={form.headerLine}
            onChange={(e) => setForm((f) => ({ ...f, headerLine: e.target.value }))}
          />
        </label>
        {errors.headerLine ? <p role="alert">{errors.headerLine}</p> : null}
        <label>
          Footer line
          <input
            name="footerLine"
            value={form.footerLine}
            onChange={(e) => setForm((f) => ({ ...f, footerLine: e.target.value }))}
          />
        </label>
        {errors.footerLine ? <p role="alert">{errors.footerLine}</p> : null}
        <label>
          <input
            name="showLogo"
            type="checkbox"
            checked={form.showLogo}
            onChange={(e) => setForm((f) => ({ ...f, showLogo: e.target.checked }))}
          />
          Show logo on receipts
        </label>
        <button type="submit">Save</button>
      </form>
      {status ? <p data-save-status>{status}</p> : null}
    </section>
  );
}
