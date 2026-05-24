"use client";

import { useState } from "react";
import { CHILD_NOTES_MAX } from "@bm/contracts";
import { emptyChildDraft, validateChildDraft, type ChildDraft } from "../../lib/children";

export interface ChildFormProps {
  /** Seed values for the edit (AC3); empty for an add. */
  initial?: ChildDraft;
  submitLabel?: string;
  onSubmit: (draft: ChildDraft) => Promise<void>;
  onCancel?: () => void;
}

/**
 * Add/edit a child (P1-E02-S03). Backs both create (AC1) and edit (AC3 — every
 * field preserved). Client-side validation mirrors the contract; the API
 * re-validates.
 */
export function ChildForm({ initial, submitLabel = "Save child", onSubmit, onCancel }: ChildFormProps) {
  const [draft, setDraft] = useState<ChildDraft>(initial ?? emptyChildDraft);
  const [errors, setErrors] = useState<Partial<Record<keyof ChildDraft, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set =
    (key: keyof ChildDraft) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft((d) => ({ ...d, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const found = validateChildDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      await onSubmit(draft);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="Child details">
      <label>
        First name
        <input value={draft.firstName} onChange={set("firstName")} required />
      </label>
      {errors.firstName && <p role="alert">{errors.firstName}</p>}

      <label>
        Last name (optional)
        <input value={draft.lastName} onChange={set("lastName")} />
      </label>

      <label>
        Date of birth
        <input type="date" value={draft.dateOfBirth} onChange={set("dateOfBirth")} required />
      </label>
      {errors.dateOfBirth && <p role="alert">{errors.dateOfBirth}</p>}

      <label>
        Gender (optional)
        <input value={draft.gender} onChange={set("gender")} />
      </label>

      <label>
        Allergies / notes (optional)
        <textarea
          value={draft.allergiesNotes}
          onChange={set("allergiesNotes")}
          maxLength={CHILD_NOTES_MAX}
        />
      </label>
      {errors.allergiesNotes && <p role="alert">{errors.allergiesNotes}</p>}

      {serverError && <p role="alert">{serverError}</p>}

      <button type="submit" disabled={saving}>
        {saving ? "Saving…" : submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      )}
    </form>
  );
}
