import { emailLightRegex, isProfileComplete, type ParentProfile } from "@bm/contracts";

/** Empty draft used by the inline (post-PIN-setup) form and the dashboard edit. */
export interface ProfileDraft {
  firstName: string;
  lastName: string;
  email: string;
  residentialArea: string;
}

export const emptyDraft: ProfileDraft = {
  firstName: "",
  lastName: "",
  email: "",
  residentialArea: "",
};

/** Seed the edit form from an existing profile (AC4). */
export function draftFromProfile(profile: ParentProfile): ProfileDraft {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email ?? "",
    residentialArea: profile.residentialArea ?? "",
  };
}

/**
 * Client-side validation mirroring the contract (AC2). Returns per-field errors;
 * empty object means valid. The server re-validates — this is just fast UX.
 */
export function validateDraft(draft: ProfileDraft): Partial<Record<keyof ProfileDraft, string>> {
  const errors: Partial<Record<keyof ProfileDraft, string>> = {};
  if (draft.firstName.trim().length === 0) errors.firstName = "First name is required";
  if (draft.lastName.trim().length === 0) errors.lastName = "Last name is required";
  const email = draft.email.trim();
  if (email.length > 0 && !emailLightRegex.test(email)) {
    errors.email = "Enter a valid email address";
  }
  return errors;
}

/**
 * AC3: should the profile-completion banner be shown? True until a complete
 * profile exists (i.e. after skip, and before the names are filled in).
 */
export function shouldShowCompletionBanner(profile: ParentProfile | null | undefined): boolean {
  return !isProfileComplete(profile);
}
