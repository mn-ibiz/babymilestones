import { describe, expect, it } from "vitest";
import {
  emptyHandoffDraft,
  handoffBody,
  isVoiceInputSupported,
  summaryPreview,
  toggleActivity,
} from "./handoff";

describe("hand-off helpers (P2-E03-S03)", () => {
  it("defaults the mood to 😊 (AC1)", () => {
    expect(emptyHandoffDraft().mood).toBe("😊");
    expect(emptyHandoffDraft().activities).toEqual([]);
  });

  it("toggles activity chips (AC1)", () => {
    expect(toggleActivity([], "Snack")).toEqual(["Snack"]);
    expect(toggleActivity(["Snack"], "Snack")).toEqual([]);
    expect(toggleActivity(["Snack"], "Nap")).toEqual(["Snack", "Nap"]);
  });

  it("builds a request body, collapsing an empty note", () => {
    expect(handoffBody({ mood: "😊", activities: ["Nap"], note: "   " }, "b1")).toEqual({
      bookingId: "b1",
      mood: "😊",
      activities: ["Nap"],
      note: null,
    });
    expect(handoffBody({ mood: "😢", activities: [], note: "Cried at pickup" }, "b1").note).toBe("Cried at pickup");
  });

  it("previews the SMS summary line (AC2)", () => {
    expect(summaryPreview({ mood: "😄", activities: ["Story time", "Snack"], note: "Great day" })).toBe(
      "😄 · Story time, Snack — Great day",
    );
    expect(summaryPreview({ mood: "😊", activities: [], note: "" })).toBe("😊");
  });

  it("detects Web Speech API support for the voice button (AC3)", () => {
    expect(isVoiceInputSupported(undefined)).toBe(false);
    expect(isVoiceInputSupported({})).toBe(false);
    expect(isVoiceInputSupported({ webkitSpeechRecognition: function () {} })).toBe(true);
    expect(isVoiceInputSupported({ SpeechRecognition: function () {} })).toBe(true);
  });
});
