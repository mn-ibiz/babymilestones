"use client";

import React, { useState } from "react";
import type { OrderTransitionAction, WcLocalStatus } from "@bm/contracts";
import { orderActionStates } from "../../lib/order-actions";
import { submitOrderTransition } from "../../lib/order-transitions-api";

/**
 * The POS order action sheet (Story 29.2 / P4-E04-S02). Shows the five workflow
 * actions (AC1) for one order; each is DISABLED when the move is illegal from the
 * order's current status, and reversal actions are disabled unless the staffer
 * may reverse (admin — AC4). Tapping `Mark dispatched` opens an inline rider /
 * courier / vehicle / contact capture before submit (AC5); the API stamps the
 * dispatch time. On a successful transition the parent is notified with the new
 * local status so the queue can refresh.
 */
export interface OrderActionSheetProps {
  wooOrderId: number;
  /** The order's current local workflow status (drives enablement — AC4). */
  current: WcLocalStatus;
  /** Whether the signed-in staffer may reverse to an earlier status (admin — AC4). */
  canReverse?: boolean;
  /** Notified with the new local status after a successful transition. */
  onTransitioned?: (next: WcLocalStatus) => void;
}

export function OrderActionSheet({
  wooOrderId,
  current,
  canReverse = false,
  onTransitioned,
}: OrderActionSheetProps) {
  const states = orderActionStates(current, { canReverse });
  const [pendingDispatch, setPendingDispatch] = useState(false);
  const [riderName, setRiderName] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: OrderTransitionAction, dispatch?: {
    riderName: string;
    vehicle?: string;
    contact?: string;
  }) {
    setBusy(true);
    setError(null);
    const outcome = await submitOrderTransition(wooOrderId, action, dispatch);
    setBusy(false);
    if (outcome.ok) {
      setPendingDispatch(false);
      onTransitioned?.(outcome.localStatus);
    } else {
      setError(outcome.error);
    }
  }

  function onAction(action: OrderTransitionAction, requiresDispatch: boolean) {
    if (requiresDispatch) {
      setPendingDispatch(true);
      return;
    }
    void run(action);
  }

  return (
    <div className="flex flex-col gap-2" role="group" aria-label={`Order #${wooOrderId} actions`}>
      <div className="flex flex-wrap gap-2">
        {states.map((s) => (
          <button
            key={s.action}
            type="button"
            disabled={!s.enabled || busy}
            aria-disabled={!s.enabled || busy}
            onClick={() => onAction(s.action, s.requiresDispatch)}
            className={`touch-target rounded-lg border px-4 text-sm ${
              s.enabled
                ? s.action === "cancel"
                  ? "border-danger text-danger"
                  : "border-brand text-brand"
                : "border-ink/10 text-ink/30"
            }`}
          >
            {s.label}
            {s.reversal && s.enabled ? " (reverse)" : ""}
          </button>
        ))}
      </div>

      {/* Rider / courier capture for a dispatch (AC5). */}
      {pendingDispatch && (
        <form
          className="flex flex-col gap-2 rounded-lg border border-ink/10 p-3"
          aria-label="Dispatch details"
          onSubmit={(e) => {
            e.preventDefault();
            if (!riderName.trim()) {
              setError("Rider/courier name is required");
              return;
            }
            void run("mark_dispatched", {
              riderName: riderName.trim(),
              ...(vehicle.trim() ? { vehicle: vehicle.trim() } : {}),
              ...(contact.trim() ? { contact: contact.trim() } : {}),
            });
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            Rider / courier name
            <input
              value={riderName}
              onChange={(e) => setRiderName(e.target.value)}
              className="touch-target rounded border border-ink/20 px-2"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Vehicle / plate
            <input
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
              className="touch-target rounded border border-ink/20 px-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Contact
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              className="touch-target rounded border border-ink/20 px-2"
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="touch-target rounded-lg border border-brand px-4 text-sm text-brand">
              Confirm dispatch
            </button>
            <button
              type="button"
              onClick={() => setPendingDispatch(false)}
              className="touch-target rounded-lg border border-ink/20 px-4 text-sm"
            >
              Back
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
