"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { BookableService, ServiceAvailability } from "@bm/contracts";
import { bookableSlotsByDate, canConfirmBooking } from "../../../lib/booking-flow";

/** Read the CSRF double-submit cookie the client echoes on mutating calls. */
function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

interface ReceptionChild {
  id: string;
  firstName: string;
  lastName: string | null;
  ageInMonths: number;
}

/**
 * Reception "New booking" for a walk-in (P2-E01-S04 AC1). Reached from a parent
 * profile (`?parentId=`). Pick a service → child → slot → confirm; the seat is
 * booked via the same atomic engine as the parent self-book. Staff attribution
 * (AC3) is enforced server-side — a service that requires it returns a clear
 * error here (the named-staff picker is a follow-on).
 */
export default function ReceptionBookingPage() {
  // useSearchParams requires a Suspense boundary under Next 15's CSR bailout.
  return (
    <Suspense fallback={<p className="p-4 text-sm text-gray-500">Loading…</p>}>
      <ReceptionBooking />
    </Suspense>
  );
}

function ReceptionBooking() {
  const params = useSearchParams();
  const parentId = params.get("parentId") ?? "";

  const [services, setServices] = useState<BookableService[]>([]);
  const [childrenList, setChildrenList] = useState<ReceptionChild[]>([]);
  const [serviceId, setServiceId] = useState<string>("");
  const [childId, setChildId] = useState<string>("");
  const [slotId, setSlotId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<ServiceAvailability | null>(null);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!parentId) return;
    void fetch("/api/reception/bookable-services", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { services: BookableService[] }) => setServices(d.services))
      .catch(() => setFlash({ kind: "err", text: "Failed to load services" }));
    void fetch(`/api/reception/parents/${parentId}/children`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: { children: ReceptionChild[] }) => setChildrenList(d.children))
      .catch(() => setFlash({ kind: "err", text: "Failed to load children" }));
  }, [parentId]);

  const loadAvailability = useCallback(() => {
    if (!serviceId || !childId) {
      setAvailability(null);
      return;
    }
    setSlotId(null);
    void fetch(
      `/api/reception/parents/${parentId}/services/${serviceId}/availability?childId=${childId}`,
      { credentials: "include" },
    )
      .then((r) => r.json())
      .then((d: ServiceAvailability) => setAvailability(d))
      // Swallow refetch errors: the grid simply stays as-is. Never overwrite a
      // success/booking flash with a transient availability-reload error.
      .catch(() => undefined);
  }, [parentId, serviceId, childId]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  const days = useMemo(
    () => (availability ? bookableSlotsByDate(availability.slots) : []),
    [availability],
  );

  async function confirm() {
    if (!canConfirmBooking({ childId: childId || null, serviceId: serviceId || null, slotId })) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch("/api/reception/bookings", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
        body: JSON.stringify({ parentId, childId, slotId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setFlash({ kind: "err", text: err.error ?? `Booking failed (${res.status})` });
      } else {
        setFlash({ kind: "ok", text: "Booking confirmed." });
      }
    } finally {
      setBusy(false);
      setSlotId(null);
      loadAvailability();
    }
  }

  if (!parentId) {
    return <p className="p-4 text-sm text-gray-600">Open a parent profile to start a booking.</p>;
  }

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="text-lg font-semibold">New booking</h1>

      {flash ? (
        <p
          className={`mt-3 rounded p-3 text-sm ${
            flash.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
          }`}
        >
          {flash.text}
        </p>
      ) : null}

      <label className="mt-3 block text-sm">
        <span className="text-gray-600">Service</span>
        <select
          className="mt-1 block w-full rounded border border-gray-300 p-2"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
        >
          <option value="">Choose a service…</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.unit})
            </option>
          ))}
        </select>
      </label>

      <label className="mt-3 block text-sm">
        <span className="text-gray-600">Child</span>
        <select
          className="mt-1 block w-full rounded border border-gray-300 p-2"
          value={childId}
          onChange={(e) => setChildId(e.target.value)}
        >
          <option value="">Choose a child…</option>
          {childrenList.map((c) => (
            <option key={c.id} value={c.id}>
              {c.firstName} {c.lastName ?? ""} ({c.ageInMonths} mo)
            </option>
          ))}
        </select>
      </label>

      {availability && !availability.eligible ? (
        <p className="mt-4 rounded bg-amber-50 p-3 text-sm text-amber-800">
          This child’s age is outside this service’s range.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {days.length === 0 ? (
            <p className="text-sm text-gray-500">No bookable slots this week.</p>
          ) : (
            days.map((d) => (
              <div key={d.date}>
                <div className="text-xs font-medium text-gray-500">{d.date}</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {d.slots.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSlotId(s.id)}
                      className={`rounded px-2 py-1 text-xs ${
                        slotId === s.id
                          ? "bg-emerald-600 text-white"
                          : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      }`}
                    >
                      {s.startTime} · {s.remainingCapacity} left
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <button
        type="button"
        disabled={busy || !canConfirmBooking({ childId: childId || null, serviceId: serviceId || null, slotId })}
        onClick={confirm}
        className="mt-4 rounded bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {busy ? "Booking…" : "Confirm booking"}
      </button>
    </main>
  );
}
