"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Child, CoachingAvailability, CoachingSlotOption } from "@bm/contracts";
import { fetchChildren } from "../../../../../lib/children-api";
import { bookCoachingSlotRequest, fetchCoachingAvailability } from "../../../../../lib/book-slots-api";
import { coachingSeatsLabel, groupCoachingSlotsByDate } from "../../../../../lib/coaching-book";

/** Sentinel for "no coach picked yet" — a 1:1 session REQUIRES an explicit pick. */
const NO_COACH = "" as const;

/**
 * 1:1 Coaching booking page (P5-E01-S02 / Story 31.2). The flow: pick a child,
 * pick a coach (REQUIRED — a 1:1 session is privately held, so there is no "Any
 * available" fallback, AC2), pick a date, then the available slots for that date
 * (AC2). Confirming books the slot, attributing the coach (AC3) and raising a
 * pending invoice (AC4).
 *
 * Lives at `/book/coaching/[serviceId]`, distinct from the salon + session grids
 * since coaching slots are 1-seat, coach-keyed.
 */
export default function BookCoachingPage() {
  const params = useParams<{ serviceId: string }>();
  const serviceId = params.serviceId;

  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState<string>("");
  const [coachId, setCoachId] = useState<string>(NO_COACH);
  const [availability, setAvailability] = useState<CoachingAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<CoachingSlotOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const childName = useMemo(
    () => children.find((c) => c.id === childId)?.firstName ?? "your child",
    [children, childId],
  );

  const loadAvailability = useCallback(
    (filter: string) =>
      fetchCoachingAvailability(serviceId, filter === NO_COACH ? undefined : filter)
        .then(setAvailability)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load availability")),
    [serviceId],
  );

  useEffect(() => {
    fetchChildren()
      .then((kids) => {
        setChildren(kids);
        if (kids[0]) setChildId(kids[0].id);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load children"))
      .finally(() => setLoading(false));
  }, []);

  // Always load the full coach picker; narrow the slot list once a coach is picked.
  useEffect(() => {
    setError(null);
    setConfirming(null);
    void loadAvailability(coachId);
  }, [coachId, loadAvailability]);

  const dateGroups = useMemo(
    // Only show the slot grid once a coach is chosen (a 1:1 pick is required).
    () => (availability && coachId !== NO_COACH ? groupCoachingSlotsByDate(availability.slots) : []),
    [availability, coachId],
  );

  async function confirmBooking() {
    if (!confirming || !childId || coachId === NO_COACH) return;
    setBusy(true);
    try {
      await bookCoachingSlotRequest(confirming.id, childId, coachId);
      setFlash({ kind: "ok", text: `Booked ${confirming.startTime} with ${confirming.staffName} for ${childName}.` });
    } catch (e: unknown) {
      setFlash({ kind: "err", text: e instanceof Error ? e.message : "Booking failed" });
    } finally {
      setConfirming(null);
      setBusy(false);
      void loadAvailability(coachId);
    }
  }

  if (loading) return <p className="p-4 text-sm text-gray-500">Loading…</p>;
  if (children.length === 0) {
    return (
      <p className="p-4 text-sm text-gray-600">
        Add a child to your profile first, then come back to book a coaching session.
      </p>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-4">
      <h1 className="text-lg font-semibold">Book a 1:1 coaching session</h1>

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

      <label className="mt-3 block text-sm">
        <span className="text-gray-600">Coach</span>
        <select
          className="mt-1 block w-full rounded border border-gray-300 p-2"
          value={coachId}
          onChange={(e) => setCoachId(e.target.value)}
        >
          <option value={NO_COACH}>Choose a coach…</option>
          {(availability?.coaches ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </select>
      </label>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      {flash ? (
        <p
          className={`mt-4 rounded p-3 text-sm ${
            flash.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
          }`}
        >
          {flash.text}
        </p>
      ) : null}

      {confirming ? (
        <div className="mt-4 rounded border border-emerald-300 bg-emerald-50 p-3 text-sm">
          <p>
            Book <strong>{confirming.startTime}</strong> on <strong>{confirming.slotDate}</strong> with{" "}
            {confirming.staffName} for <strong>{childName}</strong>?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy || coachId === NO_COACH}
              onClick={confirmBooking}
              className="rounded bg-emerald-600 px-3 py-1 text-white disabled:opacity-50"
            >
              {busy ? "Booking…" : "Confirm"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(null)}
              className="rounded border border-gray-300 px-3 py-1"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {coachId === NO_COACH ? (
        <p className="mt-4 rounded bg-gray-50 p-3 text-sm text-gray-600">
          Pick a coach to see their open 1:1 session times.
        </p>
      ) : dateGroups.length === 0 ? (
        <p className="mt-4 rounded bg-amber-50 p-3 text-sm text-amber-800">
          No open session times for this coach in the booking window. Try another coach.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {dateGroups.map((g) => (
            <div key={g.date} className="rounded border border-gray-200 p-3">
              <div className="text-xs font-medium text-gray-500">
                {g.weekdayLabel} · {g.dayLabel}
              </div>
              <ul className="mt-2 flex flex-wrap gap-2">
                {g.slots.map((s) => {
                  const seats = coachingSeatsLabel(s);
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setFlash(null);
                          setConfirming(s);
                        }}
                        className="rounded bg-emerald-50 px-2 py-1 text-left text-xs text-emerald-800 hover:bg-emerald-100"
                      >
                        {s.startTime}
                        {seats ? <span className="ml-1 text-emerald-600">· {seats}</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
