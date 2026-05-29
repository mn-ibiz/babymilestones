"use client";

import { use, useEffect, useState } from "react";
import type { PickupAuthorisation } from "@bm/contracts";
import {
  draftFromPickup,
  emptyPickupDraft,
  validatePickupDraft,
  type PickupDraft,
} from "../../../../../lib/pickups";
import {
  addPickup,
  deletePickup,
  fetchPickups,
  updatePickup,
} from "../../../../../lib/pickups-api";

/**
 * Authorised pickup list per child (P2-E03-S01). The parent CRUDs (AC2) the
 * people who may collect this child — name, phone, optional photo URL and
 * relationship (AC1). The server enforces ownership + audits every change (AC3).
 */
export default function ChildPickupsPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = use(params);
  const [pickups, setPickups] = useState<PickupAuthorisation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PickupAuthorisation | null>(null);
  const [adding, setAdding] = useState(false);

  async function reload() {
    setPickups(await fetchPickups(childId));
  }

  useEffect(() => {
    reload()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load pickups"))
      .finally(() => setLoading(false));
  }, [childId]);

  async function handleAdd(draft: PickupDraft) {
    await addPickup(childId, draft);
    setAdding(false);
    await reload();
  }

  async function handleEdit(draft: PickupDraft) {
    if (!editing) return;
    await updatePickup(childId, editing.id, draft);
    setEditing(null);
    await reload();
  }

  async function handleDelete(pickup: PickupAuthorisation) {
    await deletePickup(childId, pickup.id);
    await reload();
  }

  if (loading) return <main>Loading…</main>;
  if (error) return <main role="alert">{error}</main>;

  return (
    <main>
      <h1>Authorised pickups</h1>
      <p>People allowed to collect this child.</p>

      {pickups.length === 0 && <p>No authorised pickups yet.</p>}
      <ul aria-label="Authorised pickups">
        {pickups.map((p) => (
          <li key={p.id}>
            <strong>{p.name}</strong> — {p.relationship} · {p.phone}
            <button type="button" onClick={() => setEditing(p)}>
              Edit
            </button>
            <button type="button" onClick={() => handleDelete(p)}>
              Remove
            </button>
          </li>
        ))}
      </ul>

      {editing ? (
        <section aria-label="Edit pickup">
          <h2>Edit pickup</h2>
          <PickupForm
            initial={draftFromPickup(editing)}
            submitLabel="Save changes"
            onSubmit={handleEdit}
            onCancel={() => setEditing(null)}
          />
        </section>
      ) : adding ? (
        <section aria-label="Add pickup">
          <h2>Add a pickup</h2>
          <PickupForm submitLabel="Add pickup" onSubmit={handleAdd} onCancel={() => setAdding(false)} />
        </section>
      ) : (
        <button type="button" onClick={() => setAdding(true)}>
          Add a pickup
        </button>
      )}
    </main>
  );
}

/** Add/edit form for an authorised pickup. Mirrors the contract validation (AC1). */
function PickupForm({
  initial = emptyPickupDraft,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: PickupDraft;
  submitLabel: string;
  onSubmit: (draft: PickupDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<PickupDraft>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof PickupDraft, string>>>({});
  const [busy, setBusy] = useState(false);

  function set<K extends keyof PickupDraft>(key: K, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validatePickupDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      await onSubmit(draft);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Name
        <input value={draft.name} onChange={(e) => set("name", e.target.value)} />
      </label>
      {errors.name && <span role="alert">{errors.name}</span>}
      <label>
        Phone
        <input value={draft.phone} onChange={(e) => set("phone", e.target.value)} />
      </label>
      {errors.phone && <span role="alert">{errors.phone}</span>}
      <label>
        Relationship
        <input value={draft.relationship} onChange={(e) => set("relationship", e.target.value)} />
      </label>
      {errors.relationship && <span role="alert">{errors.relationship}</span>}
      <label>
        Photo URL (optional)
        <input value={draft.photoUrl} onChange={(e) => set("photoUrl", e.target.value)} />
      </label>
      {errors.photoUrl && <span role="alert">{errors.photoUrl}</span>}
      <button type="submit" disabled={busy}>
        {submitLabel}
      </button>
      <button type="button" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
    </form>
  );
}
