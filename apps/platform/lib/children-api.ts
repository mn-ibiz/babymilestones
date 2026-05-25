import type { Child } from "@bm/contracts";
import type { ChildDraft } from "./children";

/** Read the CSRF double-submit cookie the client echoes on mutating calls. */
function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

function bodyOf(draft: ChildDraft) {
  return {
    firstName: draft.firstName,
    lastName: draft.lastName,
    dateOfBirth: draft.dateOfBirth,
    gender: draft.gender,
    allergiesNotes: draft.allergiesNotes,
  };
}

async function unwrapChild(res: Response): Promise<Child> {
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }
  return ((await res.json()) as { child: Child }).child;
}

/** GET the authed parent's children (incl. derived age — AC2). */
export async function fetchChildren(): Promise<Child[]> {
  const res = await fetch("/parents/me/children", { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load children (${res.status})`);
  return ((await res.json()) as { children: Child[] }).children;
}

/** POST a new child (AC1). */
export async function addChild(draft: ChildDraft): Promise<Child> {
  const res = await fetch("/parents/me/children", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
    body: JSON.stringify(bodyOf(draft)),
  });
  return unwrapChild(res);
}

/** PUT an edited child — all fields preserved (AC3). */
export async function updateChild(id: string, draft: ChildDraft): Promise<Child> {
  const res = await fetch(`/parents/me/children/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
    body: JSON.stringify(bodyOf(draft)),
  });
  return unwrapChild(res);
}

/** DELETE (soft-delete) a child — sets archived_at (AC4). */
export async function archiveChild(id: string): Promise<Child> {
  const res = await fetch(`/parents/me/children/${id}`, {
    method: "DELETE",
    credentials: "include",
    headers: { "x-csrf-token": readCsrfToken() },
  });
  return unwrapChild(res);
}

/** POST to restore a soft-deleted child — clears archived_at (AC3). */
export async function restoreChild(id: string): Promise<Child> {
  const res = await fetch(`/parents/me/children/${id}/restore`, {
    method: "POST",
    credentials: "include",
    headers: { "x-csrf-token": readCsrfToken() },
  });
  return unwrapChild(res);
}

/** PUT a child's photo consent flag (P1-E02-S04 AC1, AC2). */
export async function setPhotoConsent(id: string, photoConsent: boolean): Promise<Child> {
  const res = await fetch(`/parents/me/children/${id}/consent/photo`, {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
    body: JSON.stringify({ photoConsent }),
  });
  return unwrapChild(res);
}
