import { CHILD_NOTES_MAX, isoDateRegex, ageInMonths, type Child } from "@bm/contracts";

/** Editable draft for the add/edit child form (AC1, AC3). */
export interface ChildDraft {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  allergiesNotes: string;
}

export const emptyChildDraft: ChildDraft = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "",
  allergiesNotes: "",
};

/** Seed the edit form from an existing child — all fields preserved (AC3). */
export function draftFromChild(child: Child): ChildDraft {
  return {
    firstName: child.firstName,
    lastName: child.lastName ?? "",
    dateOfBirth: child.dateOfBirth,
    gender: child.gender ?? "",
    allergiesNotes: child.allergiesNotes ?? "",
  };
}

/**
 * Client-side validation mirroring the contract (AC1). Returns per-field
 * errors; empty object means valid. The server re-validates.
 */
export function validateChildDraft(draft: ChildDraft): Partial<Record<keyof ChildDraft, string>> {
  const errors: Partial<Record<keyof ChildDraft, string>> = {};
  if (draft.firstName.trim().length === 0) errors.firstName = "First name is required";
  const dob = draft.dateOfBirth.trim();
  if (dob.length === 0) {
    errors.dateOfBirth = "Date of birth is required";
  } else if (!isoDateRegex.test(dob)) {
    errors.dateOfBirth = "Date of birth must be YYYY-MM-DD";
  }
  if (draft.allergiesNotes.length > CHILD_NOTES_MAX) {
    errors.allergiesNotes = `Notes must be ${CHILD_NOTES_MAX} characters or fewer`;
  }
  return errors;
}

/** Human label for a child's derived age in months (AC2). */
export function ageLabel(child: Pick<Child, "dateOfBirth">): string {
  const months = ageInMonths(child.dateOfBirth);
  return months === 1 ? "1 month" : `${months} months`;
}

/** Max characters of the allergies note shown on a card before truncating. */
const ALLERGIES_SUMMARY_MAX = 60;

/**
 * Short allergies summary for a child card (AC1). Empty/whitespace notes show a
 * friendly "No known allergies"; long notes are truncated with an ellipsis.
 */
export function allergiesSummary(child: Pick<Child, "allergiesNotes">): string {
  const notes = (child.allergiesNotes ?? "").trim();
  if (notes.length === 0) return "No known allergies";
  if (notes.length <= ALLERGIES_SUMMARY_MAX) return notes;
  return `${notes.slice(0, ALLERGIES_SUMMARY_MAX - 1).trimEnd()}…`;
}

/**
 * Split children into active and archived buckets (AC1 lists active cards; AC3
 * lists archived ones under their own section). Archived === archivedAt set.
 */
export function partitionChildren(all: Child[]): { active: Child[]; archived: Child[] } {
  const active: Child[] = [];
  const archived: Child[] = [];
  for (const c of all) (c.archivedAt === null ? active : archived).push(c);
  return { active, archived };
}
