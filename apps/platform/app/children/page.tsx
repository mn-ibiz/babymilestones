"use client";

import { useEffect, useState } from "react";
import type { Child } from "@bm/contracts";
import { ageLabel, draftFromChild, type ChildDraft } from "../../lib/children";
import { addChild, archiveChild, fetchChildren, updateChild } from "../../lib/children-api";
import { ChildForm } from "../components/ChildForm";

/**
 * Parent children registry (P1-E02-S03 AC1, AC3, AC4). Lists active children
 * with their derived age (AC2), and supports add / edit / archive. Archived
 * children are hidden from the list but never hard-deleted server-side.
 */
export default function ChildrenPage() {
  const [kids, setKids] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Child | null>(null);
  const [adding, setAdding] = useState(false);

  async function reload() {
    const all = await fetchChildren();
    setKids(all.filter((c) => c.archivedAt === null));
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
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

  if (loading) return <main>Loading…</main>;

  return (
    <main>
      <h1>Your children</h1>

      {kids.length === 0 && <p>No children added yet.</p>}
      <ul>
        {kids.map((child) => (
          <li key={child.id}>
            <span>
              {child.firstName} {child.lastName ?? ""} — {ageLabel(child)}
            </span>
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
    </main>
  );
}
