import {
  PICKUP_PHONE_MAX,
  PICKUP_PHOTO_URL_MAX,
  PICKUP_TEXT_MAX,
  type PickupAuthorisation,
} from "@bm/contracts";

/** Editable draft for the add/edit authorised-pickup form (P2-E03-S01 AC1). */
export interface PickupDraft {
  name: string;
  phone: string;
  relationship: string;
  photoUrl: string;
}

export const emptyPickupDraft: PickupDraft = {
  name: "",
  phone: "",
  relationship: "",
  photoUrl: "",
};

/** Seed the edit form from an existing pickup — all fields preserved (AC2). */
export function draftFromPickup(pickup: PickupAuthorisation): PickupDraft {
  return {
    name: pickup.name,
    phone: pickup.phone,
    relationship: pickup.relationship,
    photoUrl: pickup.photoUrl ?? "",
  };
}

/**
 * Client-side validation mirroring the contract (AC1). Returns per-field errors;
 * empty object means valid. The server re-validates.
 */
export function validatePickupDraft(draft: PickupDraft): Partial<Record<keyof PickupDraft, string>> {
  const errors: Partial<Record<keyof PickupDraft, string>> = {};
  if (draft.name.trim().length === 0) errors.name = "Name is required";
  else if (draft.name.trim().length > PICKUP_TEXT_MAX) errors.name = `Name must be ${PICKUP_TEXT_MAX} characters or fewer`;
  if (draft.phone.trim().length === 0) errors.phone = "Phone is required";
  else if (draft.phone.trim().length > PICKUP_PHONE_MAX)
    errors.phone = `Phone must be ${PICKUP_PHONE_MAX} characters or fewer`;
  if (draft.relationship.trim().length === 0) errors.relationship = "Relationship is required";
  else if (draft.relationship.trim().length > PICKUP_TEXT_MAX)
    errors.relationship = `Relationship must be ${PICKUP_TEXT_MAX} characters or fewer`;
  if (draft.photoUrl.trim().length > PICKUP_PHOTO_URL_MAX)
    errors.photoUrl = `Photo URL must be ${PICKUP_PHOTO_URL_MAX} characters or fewer`;
  return errors;
}

/** Build the request body from a draft (collapses an empty photo URL to null). */
export function pickupBody(draft: PickupDraft): {
  name: string;
  phone: string;
  relationship: string;
  photoUrl: string | null;
} {
  const photo = draft.photoUrl.trim();
  return {
    name: draft.name.trim(),
    phone: draft.phone.trim(),
    relationship: draft.relationship.trim(),
    photoUrl: photo === "" ? null : photo,
  };
}
