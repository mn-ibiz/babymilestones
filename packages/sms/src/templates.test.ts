import { describe, expect, it } from "vitest";
import { renderTemplate } from "./templates.js";

/**
 * P2-E07-S02 AC1 — outstanding-balance nudge templates. Each renders a
 * tiered reminder from the owed amount (KES); the copy escalates with the age
 * of the debt (day1 → day7 → day30). All three are registered + render from a
 * single `amountKes` field and carry the brand sign-off.
 */
describe("outstanding-balance nudge templates (P2-E07-S02 AC1)", () => {
  it("renders the day-1 gentle reminder", () => {
    expect(renderTemplate("outstanding.day1", { amountKes: "1,200" })).toBe(
      "You have an outstanding balance of KES 1,200 at Baby Milestones. Please top up your wallet at your convenience.",
    );
  });

  it("renders the day-7 follow-up reminder", () => {
    expect(renderTemplate("outstanding.day7", { amountKes: "1,200" })).toBe(
      "Reminder: your Baby Milestones balance of KES 1,200 is still outstanding. Please top up your wallet to settle it.",
    );
  });

  it("renders the day-30 final reminder", () => {
    expect(renderTemplate("outstanding.day30", { amountKes: "1,200" })).toBe(
      "Your Baby Milestones balance of KES 1,200 has been outstanding for 30 days. Please settle it to keep your account in good standing.",
    );
  });

  it("requires the amountKes field for every outstanding template", () => {
    for (const key of ["outstanding.day1", "outstanding.day7", "outstanding.day30"]) {
      expect(() => renderTemplate(key, {})).toThrow(/amountKes/);
    }
  });
});

/**
 * P5-E01-S02 AC5 — coaching 1:1 booking SMS-stubs: a confirmation when the slot is
 * booked and a day-before reminder. Both render from the child name + offering +
 * date/time and carry the brand sign-off.
 */
describe("coaching booking templates (P5-E01-S02 AC5)", () => {
  it("renders the booking confirmation", () => {
    expect(
      renderTemplate("coaching.confirmed", {
        childName: "Ada",
        offeringName: "Sleep coaching",
        coachName: "Coach Amina",
        date: "2026-06-15",
        time: "09:00",
      }),
    ).toBe(
      "Your 1:1 Sleep coaching for Ada with Coach Amina is booked for 2026-06-15 at 09:00. — Baby Milestones",
    );
  });

  it("renders the day-before reminder", () => {
    expect(
      renderTemplate("coaching.reminder", {
        childName: "Ada",
        offeringName: "Sleep coaching",
        coachName: "Coach Amina",
        date: "2026-06-15",
        time: "09:00",
      }),
    ).toBe(
      "Reminder: Ada's 1:1 Sleep coaching with Coach Amina is tomorrow, 2026-06-15 at 09:00. — Baby Milestones",
    );
  });

  it("requires the core fields for both coaching templates", () => {
    for (const key of ["coaching.confirmed", "coaching.reminder"]) {
      expect(() => renderTemplate(key, {})).toThrow(/childName|offeringName|coachName|date|time/);
    }
  });
});
