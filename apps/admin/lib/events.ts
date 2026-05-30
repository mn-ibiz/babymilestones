import type { EventDto, EventTierDto as EventTicketTierDto } from "@bm/contracts";

/**
 * Pure presentation helpers for the admin events screen (P4-E05-S01).
 * Framework-free so they unit-test without a DOM.
 */

const UNIT_LABELS: Record<string, string> = {
  reading_corner: "Reading Corner",
  talent_recital: "Talent Recital",
  general: "General",
};

export function unitLabel(unit: string): string {
  return UNIT_LABELS[unit] ?? unit;
}

export function formatPriceCents(cents: number): string {
  if (cents === 0) return "Free";
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

export function eventStatusLabel(event: Pick<EventDto, "published">): string {
  return event.published ? "Published" : "Draft";
}

/** Lowest tier price across the event's tiers, or null when there are none. */
export function fromPriceCents(tiers: Pick<EventTicketTierDto, "priceCents">[]): number | null {
  if (tiers.length === 0) return null;
  return tiers.reduce((min, t) => (t.priceCents < min ? t.priceCents : min), tiers[0]!.priceCents);
}

export function totalAllotment(tiers: Pick<EventTicketTierDto, "allotment">[]): number {
  return tiers.reduce((sum, t) => sum + t.allotment, 0);
}

export interface EventRow {
  id: string;
  name: string;
  unit: string;
  status: string;
  tierCount: number;
  capacity: number;
  fromPrice: string;
}

export function toEventRow(event: EventDto): EventRow {
  const from = fromPriceCents(event.tiers);
  return {
    id: event.id,
    name: event.name,
    unit: unitLabel(event.unit),
    status: eventStatusLabel(event),
    tierCount: event.tiers.length,
    capacity: event.capacity,
    fromPrice: from === null ? "—" : formatPriceCents(from),
  };
}
