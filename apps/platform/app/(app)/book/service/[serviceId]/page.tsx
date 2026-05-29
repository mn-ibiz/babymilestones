"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Child, ServiceAvailability } from "@bm/contracts";
import { fetchChildren } from "../../../../../lib/children-api";
import { fetchAvailability } from "../../../../../lib/book-slots-api";
import { buildWeekGrid, slotState } from "../../../../../lib/book-slots";

/**
 * Parent slot-browse page (P2-E01-S02). Pick a child, then see this week's
 * available Play / Talent slots for the service as a 7-day grid (AC1) with
 * remaining capacity. Slots out of the child's age range hide behind an
 * eligibility notice (AC2); past / earlier-today slots are greyed + disabled
 * (AC3). Booking the slot itself lands with P2-E01-S03.
 *
 * Lives at `/book/service/[serviceId]` — `/book/[unit]` is the pre-auth
 * WhatsApp deep-link funnel (P1-E12-S03), so this authed browse uses a distinct
 * static `service/` segment to avoid a dynamic-slug collision.
 */
export default function BookServicePage() {
  const params = useParams<{ serviceId: string }>();
  const serviceId = params.serviceId;

  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState<string>("");
  const [availability, setAvailability] = useState<ServiceAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchChildren()
      .then((kids) => {
        setChildren(kids);
        if (kids[0]) setChildId(kids[0].id);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load children"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!childId) return;
    setError(null);
    setAvailability(null); // drop the prior child's grid while the refetch is in flight
    fetchAvailability(serviceId, childId)
      .then(setAvailability)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load availability"));
  }, [serviceId, childId]);

  const week = useMemo(
    () => (availability ? buildWeekGrid(availability.slots, availability.windowStart) : []),
    [availability],
  );

  if (loading) return <p className="p-4 text-sm text-gray-500">Loading…</p>;
  if (children.length === 0) {
    return (
      <p className="p-4 text-sm text-gray-600">
        Add a child to your profile first, then come back to browse slots.
      </p>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-4">
      <h1 className="text-lg font-semibold">Available slots</h1>

      <label className="mt-3 block text-sm">
        <span className="text-gray-600">Child</span>
        <select
          className="mt-1 block w-full rounded border border-gray-300 p-2"
          value={childId}
          onChange={(e) => setChildId(e.target.value)}
        >
          {children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.firstName} {c.lastName ?? ""} ({c.ageInMonths} mo)
            </option>
          ))}
        </select>
      </label>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      {availability && !availability.eligible ? (
        <p className="mt-4 rounded bg-amber-50 p-3 text-sm text-amber-800">
          This service isn’t available for your child’s age
          {availability.ageMinMonths != null || availability.ageMaxMonths != null
            ? ` (it’s for ${ageRangeLabel(availability.ageMinMonths, availability.ageMaxMonths)}).`
            : "."}
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {week.map((col) => (
            <div key={col.date} className="rounded border border-gray-200 p-2">
              <div className="text-xs font-medium text-gray-500">
                {col.weekdayLabel}
                <span className="block text-gray-400">{col.dayLabel}</span>
              </div>
              <ul className="mt-2 space-y-1">
                {col.slots.length === 0 ? (
                  <li className="text-xs text-gray-300">—</li>
                ) : (
                  col.slots.map((s) => {
                    const state = slotState(s);
                    return (
                      <li
                        key={s.id}
                        aria-disabled={state !== "available"}
                        className={[
                          "rounded px-2 py-1 text-xs",
                          state === "available"
                            ? "bg-emerald-50 text-emerald-800"
                            : state === "full"
                              ? "bg-gray-100 text-gray-400"
                              : "bg-gray-50 text-gray-300 line-through",
                        ].join(" ")}
                        title={
                          state === "past"
                            ? "This slot has passed"
                            : state === "full"
                              ? "This slot is full"
                              : `${s.remainingCapacity} place${s.remainingCapacity === 1 ? "" : "s"} left`
                        }
                      >
                        {s.startTime}
                        {state === "available" ? ` · ${s.remainingCapacity} left` : ""}
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

/** Human label for an age range in months, e.g. "0–12 months". */
function ageRangeLabel(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${min}–${max} months`;
  if (min != null) return `${min}+ months`;
  if (max != null) return `up to ${max} months`;
  return "all ages";
}
