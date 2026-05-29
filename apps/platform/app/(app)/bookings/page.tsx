"use client";

import { useEffect, useMemo, useState } from "react";
import type { ParentBooking, ServiceAvailability } from "@bm/contracts";
import {
  cancelBookingRequest,
  fetchAvailability,
  fetchParentBookings,
  rescheduleBookingRequest,
} from "../../../lib/book-slots-api";
import { attendanceLabel, categorizeBookings } from "../../../lib/bookings-list";

type Tab = "upcoming" | "today" | "past";

/** Today as YYYY-MM-DD (UTC) — matches the server window anchor. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Parent bookings dashboard (P2-E01-S07). Upcoming / Today / Past tabs (AC1);
 * each row shows service, child, date, status/attendance. A modifiable booking
 * (before the cut-off) offers Cancel + Reschedule CTAs (AC2), subject to the
 * S05/S06 rules the API enforces.
 */
export default function BookingsPage() {
  const [bookings, setBookings] = useState<ParentBooking[]>([]);
  const [tab, setTab] = useState<Tab>("upcoming");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Inline reschedule picker state.
  const [rescheduling, setRescheduling] = useState<ParentBooking | null>(null);
  const [availability, setAvailability] = useState<ServiceAvailability | null>(null);

  function reload() {
    setLoading(true);
    setError(null); // a transient reload failure must not trap the user on the error screen
    fetchParentBookings()
      .then(setBookings)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load bookings"))
      .finally(() => setLoading(false));
  }
  useEffect(reload, []);

  const tabs = useMemo(() => categorizeBookings(bookings, todayIso()), [bookings]);

  async function onCancel(b: ParentBooking) {
    if (!window.confirm(`Cancel ${b.serviceName} on ${b.slotDate} at ${b.startTime}?`)) return;
    setBusy(true);
    setFlash(null);
    try {
      await cancelBookingRequest(b.bookingId);
      setFlash("Booking cancelled.");
    } catch (e: unknown) {
      setFlash(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setBusy(false);
      reload();
    }
  }

  function openReschedule(b: ParentBooking) {
    setRescheduling(b);
    setAvailability(null);
    setFlash(null);
    fetchAvailability(b.serviceId, b.childId)
      .then(setAvailability)
      .catch((e: unknown) => setFlash(e instanceof Error ? e.message : "Failed to load slots"));
  }

  async function onPickNewSlot(newSlotId: string) {
    if (!rescheduling) return;
    setBusy(true);
    try {
      await rescheduleBookingRequest(rescheduling.bookingId, newSlotId);
      setFlash("Booking rescheduled.");
      setRescheduling(null);
    } catch (e: unknown) {
      setFlash(e instanceof Error ? e.message : "Reschedule failed");
    } finally {
      setBusy(false);
      reload();
    }
  }

  if (loading) return <p className="p-4 text-sm text-gray-500">Loading…</p>;
  if (error) return <p className="p-4 text-sm text-red-600">{error}</p>;

  const rows = tabs[tab];

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="text-lg font-semibold">My bookings</h1>

      {flash ? <p className="mt-3 rounded bg-gray-100 p-2 text-sm text-gray-700">{flash}</p> : null}

      <div className="mt-3 flex gap-2 text-sm">
        {(["upcoming", "today", "past"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded px-3 py-1 ${tab === t ? "bg-ink text-white" : "bg-gray-100 text-gray-700"}`}
          >
            {t[0]!.toUpperCase() + t.slice(1)} ({tabs[t].length})
          </button>
        ))}
      </div>

      <ul className="mt-4 space-y-2">
        {rows.length === 0 ? (
          <li className="text-sm text-gray-500">Nothing here.</li>
        ) : (
          rows.map((b) => (
            <li key={b.bookingId} className="rounded border border-gray-200 p-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{b.serviceName}</span> · {b.childName}
                  <div className="text-gray-500">
                    {b.slotDate} at {b.startTime}
                  </div>
                </div>
                <span
                  className={`text-xs ${b.status === "cancelled" ? "text-gray-400 line-through" : "text-gray-600"}`}
                >
                  {attendanceLabel(b)}
                </span>
              </div>

              {b.canModify ? (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openReschedule(b)}
                    className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
                  >
                    Reschedule
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onCancel(b)}
                    className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}

              {rescheduling?.bookingId === b.bookingId ? (
                <div className="mt-2 rounded bg-gray-50 p-2">
                  <div className="text-xs font-medium text-gray-600">Pick a new slot</div>
                  {!availability ? (
                    <p className="text-xs text-gray-400">Loading slots…</p>
                  ) : (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {availability.slots
                        .filter((s) => s.available && s.id !== b.slotId)
                        .map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            disabled={busy}
                            onClick={() => onPickNewSlot(s.id)}
                            className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            {s.slotDate} {s.startTime}
                          </button>
                        ))}
                      <button
                        type="button"
                        onClick={() => setRescheduling(null)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs"
                      >
                        Close
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
