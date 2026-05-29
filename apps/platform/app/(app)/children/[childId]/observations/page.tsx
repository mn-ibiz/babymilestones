"use client";

import { use, useEffect, useMemo, useState } from "react";
import type { ObservationFeedItem } from "@bm/contracts";
import { observationDate, observationSummary, serviceOptions } from "../../../../../lib/observations";
import { fetchObservations } from "../../../../../lib/observations-api";

/**
 * Observations feed in the parent's account (P2-E03-S04). Read-only (AC3)
 * per-child timeline — mood, activities, note, attendant, date (AC1) — with date
 * range + service filters (AC2). The server enforces ownership and only returns
 * still-identifiable visits.
 */
export default function ChildObservationsPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = use(params);
  const [items, setItems] = useState<ObservationFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [serviceId, setServiceId] = useState("");

  // Distinct services come from the unfiltered first load so the dropdown stays
  // stable while filters narrow the list.
  const [allServices, setAllServices] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Clear any prior error so a recovering refetch (e.g. after a transient
    // failure or a filter change) restores the timeline instead of staying
    // stuck on the error screen.
    setError(null);
    fetchObservations(childId, {
      from: from || undefined,
      to: to || undefined,
      serviceId: serviceId || undefined,
    })
      .then((rows) => {
        if (cancelled) return;
        setItems(rows);
        if (allServices.length === 0) setAllServices(serviceOptions(rows));
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [childId, from, to, serviceId]);

  const services = useMemo(() => (allServices.length ? allServices : serviceOptions(items)), [allServices, items]);

  if (error) return <main role="alert">{error}</main>;

  return (
    <main>
      <h1>Observations</h1>
      <p>What your child did at each session.</p>

      <section aria-label="Filters">
        <label>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label>
          Service
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            <option value="">All services</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {loading ? (
        <p>Loading…</p>
      ) : items.length === 0 ? (
        <p>No observations yet.</p>
      ) : (
        <ul aria-label="Observation timeline">
          {items.map((o) => (
            <li key={o.id}>
              <span aria-label="mood">{o.mood}</span> <strong>{observationDate(o)}</strong>
              {o.serviceName ? ` · ${o.serviceName}` : ""}
              <div>{observationSummary(o)}</div>
              <small>— {o.attendantName}</small>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
