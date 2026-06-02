"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Child, SalonAvailability, SalonSlotOption } from "@bm/contracts";
import { fetchChildren } from "../../../../../lib/children-api";
import {
  bookSalonSlotRequest,
  fetchLeastBusyStylist,
  fetchSalonAvailability,
} from "../../../../../lib/book-slots-api";
import { ANY_STYLIST, groupSalonSlotsByDate } from "../../../../../lib/salon-book";

/**
 * Kids-Only Salon booking page (P3-E03-S02 / Story 25.2). The flow: pick a child,
 * pick a stylist (default "Any available", AC1), pick a date, then the available
 * slots for that date (AC1). A specific stylist filters to only their open slots
 * (AC2). Confirming books the slot, attributing the stylist — when "Any
 * available" the server resolves the least-busy stylist on that date (AC3) — and
 * raises a pending invoice (AC4).
 *
 * Lives at `/book/salon/[serviceId]`, distinct from the Play/Talent
 * `/book/service/[serviceId]` grid since salon slots are 1-seat, stylist-keyed.
 */
export default function BookSalonPage() {
  const params = useParams<{ serviceId: string }>();
  const serviceId = params.serviceId;

  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState<string>("");
  const [stylistId, setStylistId] = useState<string>(ANY_STYLIST);
  const [availability, setAvailability] = useState<SalonAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<SalonSlotOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const childName = useMemo(
    () => children.find((c) => c.id === childId)?.firstName ?? "your child",
    [children, childId],
  );

  const loadAvailability = useCallback(
    (filter: string) => {
      setError(null);
      setAvailability(null);
      return fetchSalonAvailability(serviceId, filter === ANY_STYLIST ? undefined : filter)
        .then(setAvailability)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load availability"));
    },
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

  useEffect(() => {
    setConfirming(null);
    void loadAvailability(stylistId);
  }, [stylistId, loadAvailability]);

  const dateGroups = useMemo(
    () => (availability ? groupSalonSlotsByDate(availability.slots) : []),
    [availability],
  );

  async function confirmBooking() {
    if (!confirming || !childId) return;
    setBusy(true);
    try {
      if (stylistId === ANY_STYLIST) {
        // "Any available": resolve the least-busy stylist on that date (AC3),
        // then book their open slot — re-fetch to land on that stylist's slot.
        const resolvedStaffId = await fetchLeastBusyStylist(serviceId, confirming.slotDate);
        const fresh = await fetchSalonAvailability(serviceId, resolvedStaffId);
        const target =
          fresh.slots.find((s) => s.slotDate === confirming.slotDate && s.startTime === confirming.startTime) ??
          fresh.slots.find((s) => s.slotDate === confirming.slotDate);
        if (!target) throw new Error("That stylist is no longer free at this time — please pick another");
        await bookSalonSlotRequest(target.id, childId, resolvedStaffId);
        setFlash({ kind: "ok", text: `Booked ${target.startTime} with ${target.staffName} for ${childName}.` });
      } else {
        await bookSalonSlotRequest(confirming.id, childId, stylistId);
        setFlash({ kind: "ok", text: `Booked ${confirming.startTime} with ${confirming.staffName} for ${childName}.` });
      }
    } catch (e: unknown) {
      setFlash({ kind: "err", text: e instanceof Error ? e.message : "Booking failed" });
    } finally {
      setConfirming(null);
      setBusy(false);
      void loadAvailability(stylistId);
    }
  }

  if (loading) return <p className="p-4 text-sm text-gray-500">Loading…</p>;
  if (children.length === 0) {
    return (
      <p className="p-4 text-sm text-gray-600">
        Add a child to your profile first, then come back to book a salon visit.
      </p>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-4">
      <h1 className="text-lg font-semibold">Book a salon visit</h1>

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
        <span className="text-gray-600">Stylist</span>
        <select
          className="mt-1 block w-full rounded border border-gray-300 p-2"
          value={stylistId}
          onChange={(e) => setStylistId(e.target.value)}
        >
          <option value={ANY_STYLIST}>Any available</option>
          {(availability?.stylists ?? []).map((s) => (
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
            Book <strong>{confirming.startTime}</strong> on <strong>{confirming.slotDate}</strong>
            {stylistId === ANY_STYLIST ? " with the next available stylist" : ` with ${confirming.staffName}`} for{" "}
            <strong>{childName}</strong>?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy}
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

      {dateGroups.length === 0 ? (
        <p className="mt-4 rounded bg-amber-50 p-3 text-sm text-amber-800">
          No open salon slots in the booking window. Try another stylist.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {dateGroups.map((g) => (
            <div key={g.date} className="rounded border border-gray-200 p-3">
              <div className="text-xs font-medium text-gray-500">
                {g.weekdayLabel} · {g.dayLabel}
              </div>
              <ul className="mt-2 flex flex-wrap gap-2">
                {g.slots.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setFlash(null);
                        setConfirming(s);
                      }}
                      className="rounded bg-emerald-50 px-2 py-1 text-left text-xs text-emerald-800 hover:bg-emerald-100"
                      title={stylistId === ANY_STYLIST ? `with ${s.staffName}` : undefined}
                    >
                      {s.startTime}
                      {stylistId === ANY_STYLIST ? <span className="ml-1 text-emerald-600">· {s.staffName}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
