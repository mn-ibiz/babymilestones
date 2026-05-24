import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import {
  auditOutbox,
  children,
  dataExports,
  parents,
  smsOutbox,
  users,
  wallets,
} from "@bm/db";
import { gatherParentExport, exportToZipEntries } from "./gather.js";
import { createZip, listZipEntryNames } from "./zip.js";
import { InMemoryExportStorage } from "./storage.js";
import { runExport, EXPORT_TTL_MS } from "./run.js";

describe("parent data export (P1-E02-S05)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let userId: string;
  let parentId: string;

  beforeEach(async () => {
    dbh = await createTestDb();
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: "+254712345678", role: "parent" })
      .returning();
    userId = u!.id;
    await dbh.db.insert(wallets).values({ userId });
    const [p] = await dbh.db
      .insert(parents)
      .values({
        userId,
        firstName: "Amina",
        lastName: "Otieno",
        email: "amina@example.co.ke",
        residentialArea: "Kileleshwa",
        smsMarketingOptIn: true,
      })
      .returning();
    parentId = p!.id;
    await dbh.db.insert(children).values({
      parentId,
      firstName: "Zawadi",
      dateOfBirth: "2022-03-01",
      photoConsent: true,
    });
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("gathers the full record: account, parent, children, consent, wallet (AC1)", async () => {
    const bundle = await gatherParentExport(dbh.db, userId);
    expect(bundle.account?.phone).toBe("+254712345678");
    expect(bundle.parent?.firstName).toBe("Amina");
    expect(bundle.children).toHaveLength(1);
    expect(bundle.children[0]!.firstName).toBe("Zawadi");
    expect(bundle.consent.smsMarketingOptIn).toBe(true);
    expect(bundle.consent.childPhotoConsent[0]!.photoConsent).toBe(true);
    expect(bundle.walletSummary?.walletId).toBeTruthy();
    // Stable shape: ledger/bookings/receipts present (empty until their epics).
    expect(bundle.walletLedger).toEqual([]);
    expect(bundle.bookings).toEqual([]);
    expect(bundle.receipts).toEqual([]);
  });

  it("ZIP bundles JSON for all five data sets (AC1)", async () => {
    const bundle = await gatherParentExport(dbh.db, userId);
    const zip = createZip(exportToZipEntries(bundle));
    const names = listZipEntryNames(zip);
    expect(names).toEqual(
      expect.arrayContaining([
        "parent.json",
        "children.json",
        "consent.json",
        "wallet-ledger.json",
        "bookings.json",
        "receipts.json",
      ]),
    );
  });

  it("runExport stores the ZIP, sets a 7-day single-use token, SMSes the link, audits (AC2, AC3)", async () => {
    const storage = new InMemoryExportStorage();
    const fixedNow = Date.parse("2026-05-25T12:00:00Z");
    const [row] = await dbh.db.insert(dataExports).values({ userId }).returning();

    await runExport(row!.id, { db: dbh.db, storage, now: () => fixedNow });

    const [updated] = await dbh.db
      .select()
      .from(dataExports)
      .where(eq(dataExports.id, row!.id));
    expect(updated!.status).toBe("ready");
    expect(updated!.downloadToken).toBeTruthy();
    expect(updated!.storageKey).toBeTruthy();
    // AC2: link valid 7 days.
    expect(updated!.expiresAt!.getTime()).toBe(fixedNow + EXPORT_TTL_MS);

    // ZIP actually landed in the store.
    const stored = await storage.get(updated!.storageKey!);
    expect(stored).not.toBeNull();
    expect(listZipEntryNames(stored!)).toContain("parent.json");

    // AC2/AC3: SMS stub carries the single-use link.
    const sms = await dbh.db.select().from(smsOutbox);
    expect(sms).toHaveLength(1);
    expect(sms[0]!.body).toContain(updated!.downloadToken!);
    expect(sms[0]!.template).toBe("parent.data.export.ready");

    // AC3: audited.
    const events = await dbh.db.select().from(auditOutbox);
    expect(events.some((e) => e.action === "parent.data.export.completed")).toBe(true);
  });

  it("does not re-process a row that is already ready (single-run)", async () => {
    const storage = new InMemoryExportStorage();
    const [row] = await dbh.db.insert(dataExports).values({ userId }).returning();
    await runExport(row!.id, { db: dbh.db, storage });
    const [after1] = await dbh.db.select().from(dataExports).where(eq(dataExports.id, row!.id));
    const token1 = after1!.downloadToken;

    await runExport(row!.id, { db: dbh.db, storage });
    const [after2] = await dbh.db.select().from(dataExports).where(eq(dataExports.id, row!.id));
    expect(after2!.downloadToken).toBe(token1); // unchanged — not re-run
    expect(await dbh.db.select().from(smsOutbox)).toHaveLength(1);
  });
});
