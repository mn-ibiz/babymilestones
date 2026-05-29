"use client";

import { useCallback, useEffect, useState } from "react";
import type { AttendanceBookingCard, AttendanceSlot } from "@bm/contracts";
import {
  bulkCandidates,
  checkInProgress,
  isAwaitingCheckIn,
  outcomeMessage,
  slotLabel,
} from "../../../lib/attendance";

/** Read the CSRF double-submit cookie the client echoes on mutating calls. */
function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

/**
 * Attendant check-in screen (P2-E03-S02). Lists today's session slots (AC1);
 * tapping a slot loads its booking list as child cards with name + photo (only
 * when consented) + a drop-off time field (AC2). Check-in posts the wallet debit
 * and records checked_in_at (AC3). "Check in all" performs the bulk path (AC4).
 */
export default function AttendancePage() {
  const [slots, setSlots] = useState<AttendanceSlot[]>([]);
  const [selected, setSelected] = useState<AttendanceSlot | null>(null);
  const [cards, setCards] = useState<AttendanceBookingCard[]>([]);
  const [dropOff, setDropOff] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSlots = useCallback(async () => {
    const res = await fetch("/reception/attendance/slots", { credentials: "include" });
    if (res.ok) setSlots(((await res.json()) as { slots: AttendanceSlot[] }).slots);
  }, []);

  const loadCards = useCallback(async (slot: AttendanceSlot) => {
    setSelected(slot);
    const res = await fetch(`/reception/attendance/slots/${slot.slotId}/bookings`, {
      credentials: "include",
    });
    if (res.ok) setCards(((await res.json()) as { bookings: AttendanceBookingCard[] }).bookings);
  }, []);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  async function checkIn(bookingId: string) {
    setBusy(true);
    // The drop-off input is a LOCAL wall-clock "HH:MM"; combine it with the slot's
    // calendar date and parse as local time (no trailing Z), so .toISOString()
    // normalizes to the correct instant rather than mislabeling EAT as UTC.
    const time = dropOff[bookingId];
    const droppedOffAt =
      time && selected ? new Date(`${selected.slotDate}T${time}:00`).toISOString() : undefined;
    try {
      const res = await fetch("/reception/attendance/checkin", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
        body: JSON.stringify({ bookingId, ...(droppedOffAt ? { droppedOffAt } : {}) }),
      });
      const body = (await res.json().catch(() => ({}))) as { outcome?: string; error?: string };
      setFlash(res.ok && body.outcome ? outcomeMessage(body.outcome as never) : (body.error ?? "Check-in failed"));
    } finally {
      setBusy(false);
      if (selected) await loadCards(selected);
      await loadSlots();
    }
  }

  async function checkInAll() {
    const bookingIds = bulkCandidates(cards);
    if (bookingIds.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/reception/attendance/checkin/bulk", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
        body: JSON.stringify({ bookingIds }),
      });
      const body = (await res.json().catch(() => ({}))) as { results?: Array<{ ok: boolean }> };
      const ok = (body.results ?? []).filter((r) => r.ok).length;
      setFlash(`Checked in ${ok} of ${bookingIds.length}.`);
    } finally {
      setBusy(false);
      if (selected) await loadCards(selected);
      await loadSlots();
    }
  }

  return (
    <main className="p-4">
      <h1 className="text-lg font-semibold">Check-in</h1>
      {flash && <p role="status">{flash}</p>}

      <section aria-label="Today's sessions">
        <h2>Today&apos;s sessions</h2>
        {slots.length === 0 && <p>No booked sessions today.</p>}
        <ul>
          {slots.map((s) => (
            <li key={s.slotId}>
              <button type="button" onClick={() => loadCards(s)}>
                {slotLabel(s)} — {checkInProgress(s)}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selected && (
        <section aria-label="Slot bookings">
          <h2>{slotLabel(selected)}</h2>
          <button type="button" onClick={checkInAll} disabled={busy || bulkCandidates(cards).length === 0}>
            Check in all
          </button>
          <ul>
            {cards.map((c) => (
              <li key={c.bookingId}>
                <strong>{c.childName}</strong>
                {c.photoConsent && <span aria-label="photo on file"> 📷</span>}{" "}
                {isAwaitingCheckIn(c) ? (
                  <>
                    <label>
                      Drop-off
                      <input
                        type="time"
                        value={dropOff[c.bookingId] ?? ""}
                        onChange={(e) =>
                          setDropOff((d) => ({ ...d, [c.bookingId]: e.target.value }))
                        }
                      />
                    </label>
                    <button type="button" onClick={() => checkIn(c.bookingId)} disabled={busy}>
                      Check in
                    </button>
                  </>
                ) : (
                  <span>✓ checked in</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
