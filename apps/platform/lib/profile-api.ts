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

export interface DataExportRequest {
  exportId: string;
  status: string;
}

/**
 * POST a data-portability export request (P1-E02-S05 AC1). Generation is async:
 * the API returns 202 immediately and the download link arrives by SMS (AC2).
 */
export async function requestDataExport(): Promise<DataExportRequest> {
  const res = await fetch("/parents/me/exports", {
    method: "POST",
    credentials: "include",
    headers: { "x-csrf-token": readCsrfToken() },
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Failed to request export (${res.status})`);
  }
  return (await res.json()) as DataExportRequest;
}

/** PUT the parent's SMS marketing opt-in (P1-E02-S04 AC1, AC2). */
export async function setSmsConsent(smsMarketingOptIn: boolean): Promise<ProfileState> {
  const res = await fetch("/parents/me/consent/sms", {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
    body: JSON.stringify({ smsMarketingOptIn }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Failed to save consent (${res.status})`);
  }
  return (await res.json()) as ProfileState;
}

/**
 * PUT the parent's PIN change (P1-E11-S04 AC3). The current PIN re-authenticates
 * the change; the server verifies it (argon2), rejects weak/duplicate new PINs,
 * rotates the hash, and invalidates every other session. Raw PINs are never
 * persisted in the client. CSRF is enforced via the double-submit token.
 */
export async function changePin(input: { currentPin: string; newPin: string }): Promise<void> {
  const res = await fetch("/parents/me/pin", {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
    body: JSON.stringify({ currentPin: input.currentPin, newPin: input.newPin }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Failed to change PIN (${res.status})`);
  }
}
