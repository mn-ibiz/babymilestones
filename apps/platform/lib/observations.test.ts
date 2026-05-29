import { describe, expect, it } from "vitest";
import { filterObservations, type ObservationFeedItem } from "@bm/contracts";
import { observationDate, observationSummary, serviceOptions } from "./observations";

function item(over: Partial<ObservationFeedItem>): ObservationFeedItem {
  return {
    id: "o1",
    childId: "c1",
    mood: "😊",
    activities: [],
    note: null,
    attendantName: "A",
    serviceId: "svc1",
    serviceName: "Soft Play",
    date: "2026-05-20T10:00:00.000Z",
    ...over,
  };
}

describe("observations feed helpers (P2-E03-S04)", () => {
  it("lists distinct service filter options (AC2)", () => {
    const items = [
      item({ serviceId: "a", serviceName: "Soft Play" }),
      item({ serviceId: "b", serviceName: "Music" }),
      item({ serviceId: "a", serviceName: "Soft Play" }),
    ];
    expect(serviceOptions(items)).toEqual([
      { id: "a", name: "Soft Play" },
      { id: "b", name: "Music" },
    ]);
  });

  it("formats the date and a summary (AC1)", () => {
    expect(observationDate(item({ date: "2026-05-20T10:00:00.000Z" }))).toBe("2026-05-20");
    expect(observationSummary(item({ activities: ["Snack", "Nap"], note: "Happy" }))).toBe("Snack, Nap — Happy");
    expect(observationSummary(item({ activities: [], note: null }))).toBe("");
  });

  it("client-filters by date range and service via the shared contract rule (AC2)", () => {
    const items = [
      item({ id: "1", serviceId: "a", date: "2026-05-01T10:00:00.000Z" }),
      item({ id: "2", serviceId: "b", date: "2026-05-20T10:00:00.000Z" }),
    ];
    expect(filterObservations(items, { from: "2026-05-10" }).map((o) => o.id)).toEqual(["2"]);
    expect(filterObservations(items, { serviceId: "a" }).map((o) => o.id)).toEqual(["1"]);
  });
});
