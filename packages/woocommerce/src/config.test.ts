import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { wooConfig } from "@bm/db";
import {
  saveWooConfig,
  getWooConfig,
  getWooConfigPublic,
  resolveWooClientConfig,
} from "./config.js";
import { isEncryptedSecret } from "./crypto.js";

/**
 * WooCommerce credential persistence (Story 29.6, AC3). Secrets are encrypted
 * at rest and NEVER returned to the client (write-only). The public projection
 * exposes only whether each credential is set.
 */
const KEY = "test-master-key-for-woo-config-tests";

describe("woo config persistence (Story 29.6 AC3)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("persists the consumer key/secret ENCRYPTED at rest", async () => {
    await saveWooConfig(dbh.db, {
      input: { siteUrl: "https://shop.example.com", consumerKey: "ck_plain", consumerSecret: "cs_plain" },
      encryptionKey: KEY,
    });
    const [row] = await dbh.db.select().from(wooConfig);
    expect(row!.siteUrl).toBe("https://shop.example.com");
    // The stored columns are ciphertext, NOT the plaintext (AC3).
    expect(row!.consumerKeyEnc).not.toBe("ck_plain");
    expect(row!.consumerSecretEnc).not.toBe("cs_plain");
    expect(isEncryptedSecret(row!.consumerKeyEnc!)).toBe(true);
    expect(isEncryptedSecret(row!.consumerSecretEnc!)).toBe(true);
  });

  it("public projection NEVER returns the secret (write-only field, AC3)", async () => {
    await saveWooConfig(dbh.db, {
      input: { siteUrl: "https://shop.example.com", consumerKey: "ck_plain", consumerSecret: "cs_plain" },
      encryptionKey: KEY,
    });
    const pub = await getWooConfigPublic(dbh.db);
    expect(pub.siteUrl).toBe("https://shop.example.com");
    expect(pub.hasConsumerKey).toBe(true);
    expect(pub.hasConsumerSecret).toBe(true);
    // Defensive: no secret-bearing field exists anywhere in the public shape.
    const serialized = JSON.stringify(pub);
    expect(serialized).not.toContain("cs_plain");
    expect(serialized).not.toContain("ck_plain");
    expect(pub).not.toHaveProperty("consumerSecret");
    expect(pub).not.toHaveProperty("consumerKey");
    expect(pub).not.toHaveProperty("consumerSecretEnc");
  });

  it("returns an empty public projection when nothing is configured", async () => {
    const pub = await getWooConfigPublic(dbh.db);
    expect(pub.siteUrl).toBeNull();
    expect(pub.hasConsumerKey).toBe(false);
    expect(pub.hasConsumerSecret).toBe(false);
  });

  it("upserts a single row (singleton) and updates the site URL on re-save", async () => {
    await saveWooConfig(dbh.db, {
      input: { siteUrl: "https://a.example.com", consumerKey: "ck1", consumerSecret: "cs1" },
      encryptionKey: KEY,
    });
    await saveWooConfig(dbh.db, {
      input: { siteUrl: "https://b.example.com" },
      encryptionKey: KEY,
    });
    const rows = await dbh.db.select().from(wooConfig);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.siteUrl).toBe("https://b.example.com");
  });

  it("omitting the secrets on update KEEPS the previously-stored encrypted values", async () => {
    await saveWooConfig(dbh.db, {
      input: { siteUrl: "https://a.example.com", consumerKey: "ck_keep", consumerSecret: "cs_keep" },
      encryptionKey: KEY,
    });
    await saveWooConfig(dbh.db, {
      input: { siteUrl: "https://b.example.com" }, // no secrets
      encryptionKey: KEY,
    });
    const resolved = await resolveWooClientConfig(dbh.db, KEY);
    expect(resolved).not.toBeNull();
    expect(resolved!.siteUrl).toBe("https://b.example.com");
    // The decrypted secrets are still the originals.
    expect(resolved!.consumerKey).toBe("ck_keep");
    expect(resolved!.consumerSecret).toBe("cs_keep");
  });

  it("resolveWooClientConfig decrypts the stored secrets for server-side client use", async () => {
    await saveWooConfig(dbh.db, {
      input: { siteUrl: "https://shop.example.com", consumerKey: "ck_x", consumerSecret: "cs_y" },
      encryptionKey: KEY,
    });
    const resolved = await resolveWooClientConfig(dbh.db, KEY);
    expect(resolved).toEqual({
      siteUrl: "https://shop.example.com",
      consumerKey: "ck_x",
      consumerSecret: "cs_y",
    });
  });

  it("resolveWooClientConfig returns null when credentials are incomplete", async () => {
    await saveWooConfig(dbh.db, {
      input: { siteUrl: "https://shop.example.com" }, // no creds yet
      encryptionKey: KEY,
    });
    expect(await resolveWooClientConfig(dbh.db, KEY)).toBeNull();
  });

  it("getWooConfig returns the raw row (server-internal) or null", async () => {
    expect(await getWooConfig(dbh.db)).toBeNull();
    await saveWooConfig(dbh.db, {
      input: { siteUrl: "https://shop.example.com", consumerKey: "ck", consumerSecret: "cs" },
      encryptionKey: KEY,
    });
    const row = await getWooConfig(dbh.db);
    expect(row?.siteUrl).toBe("https://shop.example.com");
  });
});
