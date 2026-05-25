import { describe, expect, it } from "vitest";
import type { SmsTemplatePublic } from "@bm/contracts";
import {
  canViewSmsTemplates,
  placeholdersOf,
  sortTemplatesForDisplay,
  templateVersionLabel,
} from "./sms-templates-view";

const t = (over: Partial<SmsTemplatePublic>): SmsTemplatePublic => ({
  id: "1",
  key: "k",
  language: "en",
  version: 1,
  body: "b",
  isActive: true,
  createdAt: "2026-05-25T00:00:00.000Z",
  updatedAt: "2026-05-25T00:00:00.000Z",
  ...over,
});

describe("sms templates view logic (P1-E09-S03)", () => {
  it("gates the view to manage-config roles (AC3)", () => {
    expect(canViewSmsTemplates("admin")).toBe(true);
    expect(canViewSmsTemplates("super_admin")).toBe(true);
    expect(canViewSmsTemplates("reception")).toBe(false);
  });

  it("sorts by key then language", () => {
    const sorted = sortTemplatesForDisplay([
      t({ key: "b.x" }),
      t({ key: "a.x", language: "sw" }),
      t({ key: "a.x", language: "en" }),
    ]);
    expect(sorted.map((x) => `${x.key}/${x.language}`)).toEqual(["a.x/en", "a.x/sw", "b.x/en"]);
  });

  it("labels version + active state", () => {
    expect(templateVersionLabel({ version: 2, isActive: true })).toBe("v2 (active)");
    expect(templateVersionLabel({ version: 1, isActive: false })).toBe("v1");
  });

  it("extracts placeholder tokens, de-duped, in first-seen order", () => {
    expect(placeholdersOf("Hi {name}, KES {amountKes}. Again {name}.")).toEqual([
      "name",
      "amountKes",
    ]);
    expect(placeholdersOf("no tokens")).toEqual([]);
  });
});
