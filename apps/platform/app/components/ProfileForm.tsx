"use client";

import { useState } from "react";
import { emptyDraft, validateDraft, type ProfileDraft } from "../../lib/profile";
import { saveProfile } from "../../lib/profile-api";

export interface ProfileFormProps {
  /** Seed values for the dashboard edit (AC4); empty for the inline create. */
  initial?: ProfileDraft;
  /** Shown when the parent can defer the inline form (AC3). */
  allowSkip?: boolean;
  onSaved?: () => void;
  onSkip?: () => void;
}

/**
 * Parent profile form (P1-E02-S01). Backs both the inline post-PIN-setup
 * create (AC1, AC3 skip) and the dashboard edit (AC4). Client-side validation
 * mirrors the contract; the API re-validates.
 */
export function ProfileForm({ initial, allowSkip = false, onSaved, onSkip }: ProfileFormProps) {
  const [draft, setDraft] = useState<ProfileDraft>(initial ?? emptyDraft);
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileDraft, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof ProfileDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      await saveProfile(draft);
      onSaved?.();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="Parent profile">
      <label>
        First name
        <input value={draft.firstName} onChange={set("firstName")} required />
      </label>
      {errors.firstName && <p role="alert">{errors.firstName}</p>}

      <label>
        Last name
        <input value={draft.lastName} onChange={set("lastName")} required />
      </label>
      {errors.lastName && <p role="alert">{errors.lastName}</p>}

      <label>
        Email (optional)
        <input type="email" value={draft.email} onChange={set("email")} />
      </label>
      {errors.email && <p role="alert">{errors.email}</p>}

      <label>
        Residential area (optional)
        <input value={draft.residentialArea} onChange={set("residentialArea")} />
      </label>

      {serverError && <p role="alert">{serverError}</p>}

      <button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save profile"}
      </button>
      {allowSkip && (
        <button type="button" onClick={() => onSkip?.()} disabled={saving}>
          Skip for now
        </button>
      )}
    </form>
  );
}
