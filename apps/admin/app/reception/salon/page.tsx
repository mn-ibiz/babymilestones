"use client";

import { useCallback, useEffect, useState } from "react";
import type { SalonCounterBoard, SalonCounterBooking } from "@bm/contracts";
import {
  canCapturePhoto,
  canReassign,
  reassignTargetOptions,
  salonBookingLabel,
  salonBookingState,
  salonCheckInMessage,
  salonReassignMessage,
  salonStateLabel,
} from "../../../lib/salon-counter";

/** Read the CSRF double-submit cookie the client echoes on mutating calls. */
function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

/**
 * Salon counter screen (P3-E03-S03 / Story 25.3). Shows today's salon bookings
 * grouped by stylist, by hour (AC1). Tapping "Check in" posts the wallet debit +
 * commission line (AC2). "Mark complete" records completion with an optional,
 * consent-gated photo reference (AC3 — the photo field is shown only when the
 * child has photo consent). The walk-in form composes parent-create + book-now +
 * check-in in one call (AC4).
 */
export default function SalonCounterPage() {
  const [board, setBoard] = useState<SalonCounterBoard | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoRef, setPhotoRef] = useState<Record<string, string>>({});

  const loadBoard = useCallback(async () => {
    const res = await fetch("/reception/salon/board", { credentials: "include" });
    if (res.ok) setBoard((await res.json()) as SalonCounterBoard);
  }, []);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  async function checkIn(b: SalonCounterBooking) {
    setBusy(true);
    try {
      const res = await fetch("/reception/salon/checkin", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
        body: JSON.stringify({ bookingId: b.bookingId }),
      });
      const body = (await res.json().catch(() => ({}))) as { outcome?: string; error?: string };
      setFlash(res.ok && body.outcome ? salonCheckInMessage(body.outcome) : (body.error ?? "Check-in failed"));
    } finally {
      setBusy(false);
      await loadBoard();
    }
  }

  async function reassign(b: SalonCounterBooking, toStaffId: string) {
    if (!toStaffId) return;
    setBusy(true);
    try {
      const res = await fetch("/reception/salon/reassign", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
        body: JSON.stringify({ bookingId: b.bookingId, toStaffId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; commissionMoved?: boolean };
      setFlash(res.ok ? salonReassignMessage(body.commissionMoved === true) : (body.error ?? "Could not reassign"));
    } finally {
      setBusy(false);
      await loadBoard();
    }
  }

  async function markComplete(b: SalonCounterBooking) {
    setBusy(true);
    // The photo reference is only sent when the child consented (AC3); the server
    // also re-checks consent and drops it otherwise.
    const ref = canCapturePhoto(b) ? photoRef[b.bookingId] : undefined;
    try {
      const res = await fetch("/reception/salon/complete", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
        body: JSON.stringify({ bookingId: b.bookingId, ...(ref ? { photoRef: ref } : {}) }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; photoStored?: boolean };
      setFlash(res.ok ? (body.photoStored ? "Completed — photo saved." : "Completed.") : (body.error ?? "Could not complete"));
    } finally {
      setBusy(false);
      await loadBoard();
    }
  }

  return (
    <main className="p-4">
      <h1 className="text-lg font-semibold">Salon counter</h1>
      {flash && <p role="status">{flash}</p>}

      <WalkInForm
        onDone={(msg) => {
          setFlash(msg);
          void loadBoard();
        }}
      />

      <section aria-label="Today's salon bookings">
        <h2>Today&apos;s salon bookings</h2>
        {board && board.stylists.length === 0 && <p>No salon bookings today.</p>}
        {board?.stylists.map((stylist) => (
          <section key={stylist.staffId} aria-label={`Stylist ${stylist.staffName}`}>
            <h3>{stylist.staffName}</h3>
            {stylist.hours.map((group) => (
              <div key={group.hour}>
                <h4>{group.hour}</h4>
                <ul>
                  {group.bookings.map((b) => (
                    <li key={b.bookingId}>
                      <strong>{salonBookingLabel(b)}</strong>
                      {b.photoConsent && <span aria-label="photo on file"> 📷</span>}{" "}
                      <span>{salonStateLabel(b)}</span>{" "}
                      {salonBookingState(b) === "awaiting_checkin" && (
                        <button type="button" disabled={busy} onClick={() => checkIn(b)}>
                          Check in
                        </button>
                      )}
                      {salonBookingState(b) === "in_service" && (
                        <>
                          {canCapturePhoto(b) && (
                            <label>
                              Photo ref
                              <input
                                type="text"
                                value={photoRef[b.bookingId] ?? ""}
                                onChange={(e) =>
                                  setPhotoRef((p) => ({ ...p, [b.bookingId]: e.target.value }))
                                }
                              />
                            </label>
                          )}
                          <button type="button" disabled={busy} onClick={() => markComplete(b)}>
                            Mark complete
                          </button>
                        </>
                      )}
                      {board && canReassign(b) && reassignTargetOptions(board, b).length > 0 && (
                        <label>
                          {" "}
                          Reassign to
                          <select
                            aria-label={`Reassign ${b.childName}`}
                            disabled={busy}
                            defaultValue=""
                            onChange={(e) => {
                              const to = e.target.value;
                              e.target.value = "";
                              void reassign(b, to);
                            }}
                          >
                            <option value="">Choose stylist…</option>
                            {reassignTargetOptions(board, b).map((t) => (
                              <option key={t.staffId} value={t.staffId}>
                                {t.staffName}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </section>
    </main>
  );
}

/**
 * Walk-in registration (AC4): one form that creates the parent + child, books a
 * salon slot for now with the chosen stylist, and checks the child in — all via
 * `POST /reception/salon/walk-in`.
 */
function WalkInForm({ onDone }: { onDone: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    childFirstName: "",
    childLastName: "",
    childDateOfBirth: "",
    photoConsent: false,
    serviceId: "",
    staffId: "",
  });
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/reception/salon/walk-in", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          childFirstName: form.childFirstName,
          ...(form.childLastName ? { childLastName: form.childLastName } : {}),
          childDateOfBirth: form.childDateOfBirth,
          photoConsent: form.photoConsent,
          serviceId: form.serviceId,
          staffId: form.staffId,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        onDone("Walk-in checked in.");
        setOpen(false);
      } else {
        onDone(body.error ?? "Walk-in failed");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        New walk-in
      </button>
    );
  }

  return (
    <section aria-label="Walk-in" role="dialog">
      <h2>New walk-in</h2>
      <label>
        First name
        <input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
      </label>
      <label>
        Last name
        <input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
      </label>
      <label>
        Phone
        <input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
      </label>
      <label>
        Child first name
        <input value={form.childFirstName} onChange={(e) => set("childFirstName", e.target.value)} />
      </label>
      <label>
        Child last name
        <input value={form.childLastName} onChange={(e) => set("childLastName", e.target.value)} />
      </label>
      <label>
        Child date of birth
        <input type="date" value={form.childDateOfBirth} onChange={(e) => set("childDateOfBirth", e.target.value)} />
      </label>
      <label>
        Photo consent
        <input type="checkbox" checked={form.photoConsent} onChange={(e) => set("photoConsent", e.target.checked)} />
      </label>
      <label>
        Service id
        <input value={form.serviceId} onChange={(e) => set("serviceId", e.target.value)} />
      </label>
      <label>
        Stylist id
        <input value={form.staffId} onChange={(e) => set("staffId", e.target.value)} />
      </label>
      <button type="button" disabled={busy} onClick={submit}>
        Register + check in
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </section>
  );
}
