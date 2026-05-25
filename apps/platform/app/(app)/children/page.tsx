"use client";

import { useEffect, useState } from "react";
import type { Child } from "@bm/contracts";
import {
  ageLabel,
  allergiesSummary,
  draftFromChild,
  partitionChildren,
  type ChildDraft,
} from "../../../lib/children";
import {
  addChild,
  archiveChild,
  fetchChildren,
  restoreChild,
  setPhotoConsent,
  updateChild,
} from "../../../lib/children-api";
import { ChildForm } from "../../components/ChildForm";

/**
 * Parent children registry (P1-E11-S02). Mobile-first. Lists active children as
 * cards showing name, derived age in months and an allergies summary (AC1).
 * Supports add / edit / archive (AC2). Archived children live under their own
 * "Archived" section with a restore action (AC3). All data flows through the
 * ownership-scoped epic-2-3 endpoints — the server enforces ownership.
 */
export default function ChildrenPage() {
  const [kids, setKids] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Child | null>(null);
  const [adding, setAdding] = useState(false);

  async function reload() {
    setKids(await fetchChildren());
  }

  useEffect(() => {
    reload()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load children"))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(draft: ChildDraft) {
    await addChild(draft);
    setAdding(false);
    await reload();
  }

  async function handleEdit(draft: ChildDraft) {
    if (!editing) return;
    await updateChild(editing.id, draft);
    setEditing(null);
    await reload();
  }

  async function handleArchive(child: Child) {
    await archiveChild(child.id);
    await reload();
  }

  async function handleRestore(child: Child) {
    await restoreChild(child.id);
    await reload();
  }

  async function handlePhotoConsent(child: Child, photoConsent: boolean) {
    await setPhotoConsent(child.id, photoConsent);
    await reload();
  }

  if (loading) return <main>Loading…</main>;
  if (error) return <main role="alert">{error}</main>;

  const { active, archived } = partitionChildren(kids);

  return (
    <main>
      <h1>Your children</h1>

      {active.length === 0 && <p>No children added yet.</p>}
      <ul aria-label="Active children">
        {active.map((child) => (
          <li key={child.id}>
            <p>
              <strong>
                {child.firstName} {child.lastName ?? ""}
              </strong>{" "}
              — {ageLabel(child)}
            </p>
            <p>{allergiesSummary(child)}</p>
            <label>
              <input
                type="checkbox"
                checked={child.photoConsent}
                onChange={(e) => handlePhotoConsent(child, e.target.checked)}
              />
              Photo consent
            </label>
            <button type="button" onClick={() => setEditing(child)}>
              Edit
            </button>
            <button type="button" onClick={() => handleArchive(child)}>
              Archive
            </button>
          </li>
        ))}
      </ul>

      {editing ? (
        <section aria-label="Edit child">
          <h2>Edit child</h2>
          <ChildForm
            initial={draftFromChild(editing)}
            submitLabel="Save changes"
            onSubmit={handleEdit}
            onCancel={() => setEditing(null)}
          />
        </section>
      ) : adding ? (
        <section aria-label="Add child">
          <h2>Add a child</h2>
          <ChildForm submitLabel="Add child" onSubmit={handleAdd} onCancel={() => setAdding(false)} />
        </section>
      ) : (
        <button type="button" onClick={() => setAdding(true)}>
          Add a child
        </button>
      )}

      {archived.length > 0 && (
        <section aria-label="Archived children">
          <h2>Archived</h2>
          <ul>
            {archived.map((child) => (
              <li key={child.id}>
                <span>
                  {child.firstName} {child.lastName ?? ""} — {ageLabel(child)}
                </span>
                <button type="button" onClick={() => handleRestore(child)}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
