import { describe, it, expect } from "vitest";
import {
  unitLabel,
  formatPriceCents,
  eventStatusLabel,
  fromPriceCents,
  totalAllotment,
  toEventRow,
} from "./events";
import type { EventDto } from "@bm/contracts";

const dto: EventDto = {
  id: "e1",
  name: "Spring Recital",
  slug: "spring-recital",
  description: null,
  unit: "talent_recital",
  startsAt: "2026-07-01T15:00:00.000Z",
  endsAt: "2026-07-01T18:00:00.000Z",
  venue: "Main Hall",
  capacity: 120,
  published: false,
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
  tiers: [
    { id: "t1", eventId: "e1", name: "Adult", priceCents: 50000, allotment: 100, saleStartsAt: null, saleEndsAt: null },
    { id: "t2", eventId: "e1", name: "Child", priceCents: 0, allotment: 20, saleStartsAt: null, saleEndsAt: null },
  ],
};

describe("admin events lib", () => {
  it("labels units and statuses", () => {
    expect(unitLabel("talent_recital")).toBe("Talent Recital");
    expect(unitLabel("unknown")).toBe("unknown");
    expect(eventStatusLabel({ published: true })).toBe("Published");
    expect(eventStatusLabel({ published: false })).toBe("Draft");
  });

  it("formats prices with a Free case", () => {
    expect(formatPriceCents(50000)).toBe("KES 500.00");
    expect(formatPriceCents(0)).toBe("Free");
  });

  it("computes from-price and total allotment", () => {
    expect(fromPriceCents(dto.tiers)).toBe(0);
    expect(fromPriceCents([])).toBeNull();
    expect(totalAllotment(dto.tiers)).toBe(120);
  });

  it("maps a dto to a row", () => {
    const row = toEventRow(dto);
    expect(row.name).toBe("Spring Recital");
    expect(row.unit).toBe("Talent Recital");
    expect(row.status).toBe("Draft");
    expect(row.tierCount).toBe(2);
    expect(row.fromPrice).toBe("Free");
  });
});
