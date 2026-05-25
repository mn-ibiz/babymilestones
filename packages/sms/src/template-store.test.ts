import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { smsTemplates } from "@bm/db";
import {
  getActiveTemplate,
  interpolateTemplate,
  listActiveTemplates,
  listTemplateVersions,
  resolveTemplate,
  toPublicSmsTemplate,
} from "./template-store.js";

/**
 * P1-E09-S03 — registered + versioned SMS templates. Covers placeholder
 * interpolation, key-based resolution against the seeded registry, versioning
 * (one active per key, history retained), and clear failure on unknown/inactive
 * keys and missing placeholders.
 */
describe("sms template store (P1-E09-S03)", () => {
  it("interpolates {placeholder} tokens from the data bag", () => {
    expect(interpolateTemplate("KES {amountKes} added", { amountKes: 500 })).toBe(
      "KES 500 added",
    );
    expect(interpolateTemplate("code {code} now", { code: "123456" })).toBe("code 123456 now");
    // No placeholders → returned verbatim.
    expect(interpolateTemplate("static copy", {})).toBe("static copy");
  });

  it("throws on a missing or non-scalar placeholder", () => {
    expect(() => interpolateTemplate("hi {name}", {})).toThrow(/missing required placeholder "name"/);
    expect(() => interpolateTemplate("hi {name}", { name: null })).toThrow(/missing required/);
    expect(() => interpolateTemplate("x {obj}", { obj: { a: 1 } })).toThrow(/must be a scalar/);
  });

  it("resolves the active seeded template by key and renders placeholders (AC1/AC2)", async () => {
    const { db, close } = await createTestDb();
    try {
      const body = await resolveTemplate(db, "topup.success", { amountKes: 1000 });
      expect(body).toBe("A top-up of KES 1000 was added to your wallet.");

      const reset = await resolveTemplate(db, "auth.reset.code", { code: "987654" });
      expect(reset).toBe("Your Baby Milestones reset code is 987654. It expires in 10 minutes.");
    } finally {
      await close();
    }
  });

  it("fails clearly on an unknown or inactive key (unknown-key handled)", async () => {
    const { db, close } = await createTestDb();
    try {
      await expect(resolveTemplate(db, "nope.unknown", {})).rejects.toThrow(/no active template/);

      // Deactivate the only active row → resolution fails clearly.
      await db.update(smsTemplates).set({ isActive: false });
      await expect(resolveTemplate(db, "topup.success", { amountKes: 1 })).rejects.toThrow(
        /no active template/,
      );
    } finally {
      await close();
    }
  });

  it("supports multiple versions with exactly one active; resolves the active one (AC1)", async () => {
    const { db, close } = await createTestDb();
    try {
      // Ship a new copy revision: deactivate v1, insert active v2 (same key).
      await db
        .update(smsTemplates)
        .set({ isActive: false })
        .where(eq(smsTemplates.key, "topup.success"));
      await db.insert(smsTemplates).values({
        key: "topup.success",
        language: "en",
        version: 2,
        body: "Wallet credited: KES {amountKes}.",
        isActive: true,
      });

      const active = await getActiveTemplate(db, "topup.success");
      expect(active?.version).toBe(2);
      expect(await resolveTemplate(db, "topup.success", { amountKes: 750 })).toBe(
        "Wallet credited: KES 750.",
      );

      // History is retained — both versions on record.
      const versions = await listTemplateVersions(db, "topup.success");
      expect(versions.map((v) => v.version)).toEqual([2, 1]);
    } finally {
      await close();
    }
  });

  it("rejects a second active row for the same (key, language) at the DB level (AC1)", async () => {
    const { db, close } = await createTestDb();
    try {
      await expect(
        db.insert(smsTemplates).values({
          key: "topup.success",
          language: "en",
          version: 99,
          body: "dup {amountKes}",
          isActive: true,
        }),
      ).rejects.toThrow();
    } finally {
      await close();
    }
  });

  it("listActiveTemplates returns one active row per key, sorted (AC3 admin view)", async () => {
    const { db, close } = await createTestDb();
    try {
      const rows = await listActiveTemplates(db);
      const keys = rows.map((r) => r.key);
      expect(keys).toContain("topup.success");
      expect(keys).toContain("auth.reset.code");
      // Sorted ascending by key.
      expect([...keys].sort()).toEqual(keys);
      // Every returned row is active.
      expect(rows.every((r) => r.isActive)).toBe(true);

      const pub = toPublicSmsTemplate(rows[0]!);
      expect(pub).toHaveProperty("body");
      expect(pub).toHaveProperty("version");
    } finally {
      await close();
    }
  });
});
