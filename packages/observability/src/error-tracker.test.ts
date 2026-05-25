import { describe, expect, it } from "vitest";
import {
  InMemoryErrorTracker,
  NoopErrorTracker,
  type ErrorTracker,
} from "./error-tracker.js";

describe("NoopErrorTracker", () => {
  it("accepts captures without throwing and reports nothing", () => {
    const tracker: ErrorTracker = new NoopErrorTracker();
    expect(() => tracker.captureException(new Error("boom"))).not.toThrow();
  });
});

describe("InMemoryErrorTracker", () => {
  it("records captured exceptions with their context", () => {
    const tracker = new InMemoryErrorTracker();
    const err = new Error("kaboom");
    tracker.captureException(err, { correlationId: "cid-1", tags: { route: "/x" } });
    expect(tracker.events).toHaveLength(1);
    const event = tracker.events[0]!;
    expect(event.error).toBe(err);
    expect(event.context?.correlationId).toBe("cid-1");
    expect(event.context?.tags?.route).toBe("/x");
  });

  it("records messages", () => {
    const tracker = new InMemoryErrorTracker();
    tracker.captureMessage("something off", { correlationId: "cid-2" });
    expect(tracker.events).toHaveLength(1);
    expect(tracker.events[0]!.message).toBe("something off");
  });

  it("can be cleared", () => {
    const tracker = new InMemoryErrorTracker();
    tracker.captureException(new Error("a"));
    tracker.clear();
    expect(tracker.events).toHaveLength(0);
  });
});
