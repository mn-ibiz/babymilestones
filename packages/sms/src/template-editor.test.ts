import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { smsTemplates } from "@bm/db";
import { and, eq } from "drizzle-orm";
import {
  extractPlaceholders,
  validateTemplateBody,
  saveTemplateVersion,
} from "./template-editor.js";
import { getActiveTemplate, listTemplateVersions } from "./template-store.js";

/**
 * P5-E03-S04 (Epic 33-4) — SMS template editor WRITE side. Covers placeholder
 * extraction, the missing-placeholder validation (AC2), and the new-version
 * save that retains prior versions and keeps exactly one active row (AC3).
 */
describe("sms template editor (33-4)", () => {
  describe("extractPlaceholders", () => {
    it("returns deduped {token}s in first-seen order", () => {
      expect(extractPlaceholders("Hi {name}, balance KES {amount}. Bye {name}.")).toEqual([
        "name",
        "amount",
      ]);
    });
    it("returns [] for a body with no placeholders", () => {
      expect(extractPlaceholders("No tokens here.")).toEqual([]);
    });
  });

  describe("validateTemplateBody (AC2)", () => {
    it("flags an empty body", () => {
      const v = validateTemplateBody("   ");
      expect(v.valid).toBe(false);
      expect(v.issues.join(" ")).toMatch(/empty/i);
    });
    it("flags a missing required placeholder", () => {
      const v = validateTemplateBody("Hello there", ["name"]);
      expect(v.valid).toBe(false);
      expect(v.missing).toEqual(["name"]);
      expect(v.issues.join(" ")).toMatch(/\{name\}/);
    });
    it("passes when all required placeholders are present", () => {
      const v = validateTemplateBody("Hi {name}, you have {amount}.", ["name", "amount"]);
      expect(v.valid).toBe(true);
      expect(v.issues).toEqual([]);
      expect(v.placeholders).toEqual(["name", "amount"]);
    });
  });

  describe("saveTemplateVersion (AC3)", () => {
    let db: Awaited<ReturnType<typeof createTestDb>>["db"];
    beforeEach(async () => {
      const t = await createTestDb();
      db = t.db;
    });

    it("creates v1 for a brand-new key and makes it active", async () => {
      const row = await saveTemplateVersion(db, { key: "new.key", body: "Hi {name}" });
      expect(row.version).toBe(1);
      expect(row.isActive).toBe(true);
      const active = await getActiveTemplate(db, "new.key");
      expect(active?.body).toBe("Hi {name}");
    });

    it("saves a new version, retains the old, and keeps exactly one active (AC3)", async () => {
      const v1 = await saveTemplateVersion(db, { key: "edit.key", body: "v1 {x}" });
      const v2 = await saveTemplateVersion(db, { key: "edit.key", body: "v2 {x}" });

      expect(v1.version).toBe(1);
      expect(v2.version).toBe(2);

      // Both versions retained.
      const versions = await listTemplateVersions(db, "edit.key");
      expect(versions.map((r) => r.version)).toEqual([2, 1]);

      // Exactly one active row, and it is v2.
      const active = await db
        .select()
        .from(smsTemplates)
        .where(and(eq(smsTemplates.key, "edit.key"), eq(smsTemplates.isActive, true)));
      expect(active).toHaveLength(1);
      expect(active[0]!.version).toBe(2);
      expect(active[0]!.body).toBe("v2 {x}");
    });
  });
});
