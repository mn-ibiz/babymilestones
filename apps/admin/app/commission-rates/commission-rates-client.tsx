"use client";

import { useState } from "react";
import {
  validateCommissionRateForm,
  type CommissionRateFormValues,
} from "../../lib/commission-rate-form";

/**
 * Admin commission-rate management client (P3-E01-S01). Minimal shell: pick a
 * staff member, set a new rate effective from an instant. The server auto-closes
 * the previous open rate and audits the change.
 */
export function CommissionRatesClient() {
  const [values, setValues] = useState<CommissionRateFormValues>({
    ratePercent: "",
    effectiveFrom: "",
    reason: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateCommissionRateForm(values);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    // POST /admin/staff/:id/commission-rates — wired to the API in the integration layer.
  }

  return (
    <form onSubmit={onSubmit}>
      <input
        aria-label="Rate percent"
        value={values.ratePercent}
        onChange={(e) => setValues({ ...values, ratePercent: e.target.value })}
      />
      {errors.ratePercent && <p role="alert">{errors.ratePercent}</p>}
      <input
        aria-label="Effective from"
        type="datetime-local"
        value={values.effectiveFrom}
        onChange={(e) => setValues({ ...values, effectiveFrom: e.target.value })}
      />
      {errors.effectiveFrom && <p role="alert">{errors.effectiveFrom}</p>}
      <input
        aria-label="Reason"
        value={values.reason ?? ""}
        onChange={(e) => setValues({ ...values, reason: e.target.value })}
      />
      <button type="submit">Save rate</button>
    </form>
  );
}
