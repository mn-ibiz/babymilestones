"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ServiceUnit } from "@bm/contracts";
import {
  attributionRoleLabel,
  attributionRoleOptions,
  coachingFormatOptions,
  DEFAULT_TAX_TREATMENT,
  formatPriceKes,
  parseAgeStageTags,
  priceHistoryRows,
  serviceUnitOptions,
  taxTreatmentLabel,
  taxTreatmentOptions,
  unitLabel,
  validatePriceForm,
  validateServiceForm,
} from "../../lib/services-form";

/**
 * Admin service catalogue + effective-dated prices (P1-E07-S01). Admin manages
 * the paid services and their prices without code changes. A price change never
 * overwrites history — it appends a new effective-dated row (AC2/AC3) — and the
 * full history is rendered. The server re-validates + enforces `manage service`.
 */
interface Service {
  id: string;
  name: string;
  description: string | null;
  unit: ServiceUnit;
  isActive: boolean;
  attributionRoleRequired: string | null;
  taxTreatment: string;
  format: string | null;
  coachingDurationMinutes: number | null;
  coachingCapacity: number | null;
  ageStageTags: string[] | null;
}

interface Price {
  amountCents: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/** Read the CSRF double-submit cookie the client echoes on mutating calls. */
function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

const EMPTY_SERVICE = {
  name: "",
  unit: "" as ServiceUnit | "",
  description: "",
  attributionRoleRequired: "",
  taxTreatment: DEFAULT_TAX_TREATMENT as string,
  format: "",
  coachingDurationMinutes: "",
  coachingCapacity: "",
  ageStageTags: "",
};
const today = () => new Date().toISOString().slice(0, 10);

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [form, setForm] = useState(EMPTY_SERVICE);
  const serviceErrors = useMemo(
    () =>
      validateServiceForm({
        name: form.name,
        unit: form.unit,
        attributionRoleRequired: form.attributionRoleRequired,
        taxTreatment: form.taxTreatment,
        format: form.format,
        coachingDurationMinutes: form.coachingDurationMinutes === "" ? null : Number(form.coachingDurationMinutes),
        coachingCapacity: form.coachingCapacity === "" ? null : Number(form.coachingCapacity),
      }),
    [form],
  );
  const isCoaching = form.unit === "coaching";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prices, setPrices] = useState<Price[]>([]);
  const [priceForm, setPriceForm] = useState({ amountKes: 0, effectiveFrom: today() });
  const priceErrors = useMemo(
    () => validatePriceForm({ amountCents: Math.round(priceForm.amountKes * 100), effectiveFrom: priceForm.effectiveFrom }),
    [priceForm],
  );

  const load = useCallback(async () => {
    const res = await fetch("/admin/services", { credentials: "include" });
    if (res.ok) setServices(((await res.json()) as { services: Service[] }).services);
  }, []);

  const loadPrices = useCallback(async (serviceId: string) => {
    const res = await fetch(`/admin/services/${serviceId}/prices`, { credentials: "include" });
    if (res.ok) setPrices(((await res.json()) as { prices: Price[] }).prices);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (Object.keys(serviceErrors).length > 0 || form.unit === "") return;
      const isCoachingUnit = form.unit === "coaching";
      const res = await fetch("/admin/services", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
        body: JSON.stringify({
          name: form.name.trim(),
          unit: form.unit,
          description: form.description.trim() || null,
          attributionRoleRequired: form.attributionRoleRequired || null,
          taxTreatment: form.taxTreatment || DEFAULT_TAX_TREATMENT,
          // Coaching offering attributes (P5-E01-S01 / Story 31.1 AC2). Only sent
          // for the coaching unit; empty/blank collapses to null server-side.
          ...(isCoachingUnit
            ? {
                format: form.format || null,
                coachingDurationMinutes:
                  form.coachingDurationMinutes === ""
                    ? null
                    : Number(form.coachingDurationMinutes),
                coachingCapacity:
                  form.coachingCapacity === "" ? null : Number(form.coachingCapacity),
                ageStageTags: parseAgeStageTags(form.ageStageTags),
              }
            : {}),
        }),
      });
      if (res.ok) {
        setForm(EMPTY_SERVICE);
        await load();
      }
    },
    [serviceErrors, form, load],
  );

  const onSelect = useCallback(
    async (id: string) => {
      setSelectedId(id);
      await loadPrices(id);
    },
    [loadPrices],
  );

  const onSetPrice = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedId || Object.keys(priceErrors).length > 0) return;
      const res = await fetch(`/admin/services/${selectedId}/prices`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
        body: JSON.stringify({
          amountCents: Math.round(priceForm.amountKes * 100),
          effectiveFrom: priceForm.effectiveFrom,
        }),
      });
      if (res.ok) {
        setPriceForm({ amountKes: 0, effectiveFrom: today() });
        await loadPrices(selectedId);
      }
    },
    [selectedId, priceErrors, priceForm, loadPrices],
  );

  const onToggleActive = useCallback(
    async (svc: Service) => {
      const res = await fetch(`/admin/services/${svc.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
        body: JSON.stringify({ isActive: !svc.isActive }),
      });
      if (res.ok) await load();
    },
    [load],
  );

  const historyRows = useMemo(() => priceHistoryRows(prices), [prices]);

  return (
    <main>
      <h1>Services</h1>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Unit</th>
            <th>Attribution</th>
            <th>Tax</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.id}>
              <td>
                <button type="button" onClick={() => onSelect(s.id)}>
                  {s.name}
                </button>
              </td>
              <td>{unitLabel(s.unit)}</td>
              <td>
                {s.attributionRoleRequired
                  ? attributionRoleLabel(s.attributionRoleRequired)
                  : "—"}
              </td>
              <td>{taxTreatmentLabel(s.taxTreatment)}</td>
              <td>{s.isActive ? "Active" : "Inactive"}</td>
              <td>
                <button type="button" onClick={() => onToggleActive(s)}>
                  {s.isActive ? "Deactivate" : "Reactivate"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Add a service</h2>
      <form onSubmit={onCreate}>
        <label>
          Name
          <input
            name="name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            aria-invalid={Boolean(serviceErrors.name)}
            required
          />
        </label>
        <label>
          Unit
          <select
            name="unit"
            value={form.unit}
            onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value as ServiceUnit }))}
            aria-invalid={Boolean(serviceErrors.unit)}
            required
          >
            <option value="">Choose…</option>
            {serviceUnitOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Description
          <input
            name="description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </label>
        <label>
          Attribution role
          <select
            name="attributionRoleRequired"
            value={form.attributionRoleRequired}
            onChange={(e) =>
              setForm((f) => ({ ...f, attributionRoleRequired: e.target.value }))
            }
            aria-invalid={Boolean(serviceErrors.attributionRoleRequired)}
          >
            <option value="">None (attribution optional)</option>
            {attributionRoleOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {isCoaching && (
          <fieldset>
            <legend>Coaching offering</legend>
            <label>
              Format
              <select
                name="format"
                value={form.format}
                onChange={(e) => setForm((f) => ({ ...f, format: e.target.value }))}
                aria-invalid={Boolean(serviceErrors.format)}
              >
                <option value="">Choose…</option>
                {coachingFormatOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Duration (minutes)
              <input
                name="coachingDurationMinutes"
                type="number"
                min={1}
                value={form.coachingDurationMinutes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, coachingDurationMinutes: e.target.value }))
                }
                aria-invalid={Boolean(serviceErrors.coachingDurationMinutes)}
              />
            </label>
            <label>
              Group capacity (seats)
              <input
                name="coachingCapacity"
                type="number"
                min={1}
                placeholder="1 for 1:1, more for a group"
                value={form.coachingCapacity}
                onChange={(e) => setForm((f) => ({ ...f, coachingCapacity: e.target.value }))}
                aria-invalid={Boolean(serviceErrors.coachingCapacity)}
              />
            </label>
            <label>
              Age-stage tags
              <input
                name="ageStageTags"
                placeholder="expecting, 0-3mo, 3-6mo"
                value={form.ageStageTags}
                onChange={(e) => setForm((f) => ({ ...f, ageStageTags: e.target.value }))}
              />
            </label>
          </fieldset>
        )}
        <label>
          Tax treatment
          <select
            name="taxTreatment"
            value={form.taxTreatment}
            onChange={(e) => setForm((f) => ({ ...f, taxTreatment: e.target.value }))}
            aria-invalid={Boolean(serviceErrors.taxTreatment)}
          >
            {taxTreatmentOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={Object.keys(serviceErrors).length > 0}>
          Create service
        </button>
      </form>

      {selectedId && (
        <section>
          <h2>Price history</h2>
          <table>
            <thead>
              <tr>
                <th>Amount (KES)</th>
                <th>Effective from</th>
                <th>Effective to</th>
              </tr>
            </thead>
            <tbody>
              {historyRows.map((r, i) => (
                <tr key={`${r.effectiveFrom}-${i}`} aria-current={r.isCurrent ? "true" : undefined}>
                  <td>{r.amountLabel}</td>
                  <td>{r.effectiveFrom}</td>
                  <td>{r.effectiveTo}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Set a new price</h3>
          <form onSubmit={onSetPrice}>
            <label>
              Amount (KES)
              <input
                name="amountKes"
                type="number"
                value={priceForm.amountKes}
                onChange={(e) => setPriceForm((p) => ({ ...p, amountKes: Number(e.target.value) }))}
                aria-invalid={Boolean(priceErrors.amount)}
              />
            </label>
            <label>
              Effective from
              <input
                name="effectiveFrom"
                type="date"
                value={priceForm.effectiveFrom}
                onChange={(e) => setPriceForm((p) => ({ ...p, effectiveFrom: e.target.value }))}
                aria-invalid={Boolean(priceErrors.effectiveFrom)}
                required
              />
            </label>
            <button type="submit" disabled={Object.keys(priceErrors).length > 0}>
              Save new price
            </button>
          </form>
          <p>Current price: {historyRows.find((r) => r.isCurrent)?.amountLabel ?? formatPriceKes(0)}</p>
        </section>
      )}
    </main>
  );
}
