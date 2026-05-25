"use client";

import { useState } from "react";
import { emptyPinChange, validatePinChange, type PinChangeDraft } from "../../lib/pin-change";
import { changePin } from "../../lib/profile-api";

export interface PinChangeFormProps {
  /** Called after a successful change (the server has cleared other sessions). */
  onChanged?: () => void;
}

/**
 * PIN change flow (P1-E11-S04 AC3). Mobile-first. Requires the current PIN,
 * confirms the new PIN, and validates client-side via the tested pure function;
 * the API is the authority on current-PIN verification and weak-PIN rejection.
 * On success every other session is invalidated server-side.
 */
export function PinChangeForm({ onChanged }: PinChangeFormProps) {
  const [draft, setDraft] = useState<PinChangeDraft>(emptyPinChange);
  const [errors, setErrors] = useState<Partial<Record<keyof PinChangeDraft, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const set = (key: keyof PinChangeDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    setDone(false);
    const found = validatePinChange(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      await changePin({ currentPin: draft.currentPin, newPin: draft.newPin });
      setDraft(emptyPinChange);
      setDone(true);
      onChanged?.();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="Change PIN">
      <h2>Change your PIN</h2>

      <label>
        Current PIN
        <input
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          maxLength={4}
          value={draft.currentPin}
          onChange={set("currentPin")}
        />
      </label>
      {errors.currentPin && <p role="alert">{errors.currentPin}</p>}

      <label>
        New PIN
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={4}
          value={draft.newPin}
          onChange={set("newPin")}
        />
      </label>
      {errors.newPin && <p role="alert">{errors.newPin}</p>}

      <label>
        Confirm new PIN
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={4}
          value={draft.confirmPin}
          onChange={set("confirmPin")}
        />
      </label>
      {errors.confirmPin && <p role="alert">{errors.confirmPin}</p>}

      {serverError && <p role="alert">{serverError}</p>}
      {done && <p role="status">Your PIN has been changed.</p>}

      <button type="submit" disabled={saving}>
        {saving ? "Changing…" : "Change PIN"}
      </button>
    </form>
  );
}
