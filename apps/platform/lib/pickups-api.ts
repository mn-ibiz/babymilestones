import type { PickupAuthorisation } from "@bm/contracts";
import { pickupBody, type PickupDraft } from "./pickups";

/** Read the CSRF double-submit cookie the client echoes on mutating calls. */
function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

async function unwrap(res: Response): Promise<PickupAuthorisation> {
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }
  return ((await res.json()) as { pickup: PickupAuthorisation }).pickup;
}

/** GET the authorised pickups for one child (AC1, AC2). */
export async function fetchPickups(childId: string): Promise<PickupAuthorisation[]> {
  const res = await fetch(`/parents/me/children/${encodeURIComponent(childId)}/pickups`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to load pickups (${res.status})`);
  return ((await res.json()) as { pickups: PickupAuthorisation[] }).pickups;
}

/** POST a new authorised pickup (AC1, AC2). */
export async function addPickup(childId: string, draft: PickupDraft): Promise<PickupAuthorisation> {
  const res = await fetch(`/parents/me/children/${encodeURIComponent(childId)}/pickups`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
    body: JSON.stringify(pickupBody(draft)),
  });
  return unwrap(res);
}

/** PATCH an edited authorised pickup (AC2). */
export async function updatePickup(
  childId: string,
  pickupId: string,
  draft: PickupDraft,
): Promise<PickupAuthorisation> {
  const res = await fetch(
    `/parents/me/children/${encodeURIComponent(childId)}/pickups/${encodeURIComponent(pickupId)}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
      body: JSON.stringify(pickupBody(draft)),
    },
  );
  return unwrap(res);
}

/** DELETE an authorised pickup (AC2). */
export async function deletePickup(childId: string, pickupId: string): Promise<void> {
  const res = await fetch(
    `/parents/me/children/${encodeURIComponent(childId)}/pickups/${encodeURIComponent(pickupId)}`,
    {
      method: "DELETE",
      credentials: "include",
      headers: { "x-csrf-token": readCsrfToken() },
    },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }
}
