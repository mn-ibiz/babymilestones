import type { ParentProfile } from "@bm/contracts";
import type { ProfileDraft } from "./profile";

export interface ProfileState {
  profile: ParentProfile | null;
  complete: boolean;
}

/** Read the CSRF double-submit cookie the client echoes on mutating calls. */
function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

/** GET the authed parent's profile + completion flag (AC3, AC4). */
export async function fetchProfile(): Promise<ProfileState> {
  const res = await fetch("/parents/me", { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load profile (${res.status})`);
  return (await res.json()) as ProfileState;
}

/** PUT (upsert) the authed parent's profile (AC1, AC2, AC4). */
export async function saveProfile(draft: ProfileDraft): Promise<ProfileState> {
  const res = await fetch("/parents/me", {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
    body: JSON.stringify({
      firstName: draft.firstName,
      lastName: draft.lastName,
      email: draft.email,
      residentialArea: draft.residentialArea,
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Failed to save profile (${res.status})`);
  }
  return (await res.json()) as ProfileState;
}
