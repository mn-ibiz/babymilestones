import { describe, it, expect } from "vitest";
import { liveStatusLabel, toggleConfirmMessage } from "./sms-live.js";

describe("sms-live helpers", () => {
  it("labels the live state", () => {
    expect(liveStatusLabel(true)).toMatch(/live/i);
    expect(liveStatusLabel(false)).toMatch(/stub/i);
  });

  it("confirms before enabling live", () => {
    expect(toggleConfirmMessage(true)).toMatch(/real messages/i);
    expect(toggleConfirmMessage(false)).toMatch(/not sent/i);
  });
});
