import { eq } from "drizzle-orm";
import { children, parents, users, wallets } from "@bm/db";
import type { Database } from "@bm/db";

/**
 * The full data-portability bundle for one parent (Kenya DPA right of access).
 * Covers everything the platform holds: the account, the parent profile,
 * children (incl. consent flags), and a wallet summary. Bookings, the wallet
 * ledger, and receipts are included as arrays so the export shape is stable;
 * they populate once their owning epics (P1-E03 ledger, bookings) land —
 * today they are empty for every parent.
 */
export interface ParentExport {
  exportedAt: string;
  account: {
    userId: string;
    phone: string;
    role: string;
    createdAt: string;
  } | null;
  parent: Record<string, unknown> | null;
  children: Record<string, unknown>[];
  consent: {
    smsMarketingOptIn: boolean | null;
    childPhotoConsent: { childId: string; firstName: string; photoConsent: boolean }[];
  };
  walletSummary: { walletId: string; createdAt: string } | null;
  bookings: Record<string, unknown>[];
  walletLedger: Record<string, unknown>[];
  receipts: Record<string, unknown>[];
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/**
 * Read everything the platform holds about `userId` into a structured bundle.
 * Pure read — no writes, no side effects. Ownership is the caller's concern
 * (the userId is already authorized).
 */
export async function gatherParentExport(db: Database, userId: string): Promise<ParentExport> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const [parent] = await db.select().from(parents).where(eq(parents.userId, userId));
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));

  const kids = parent
    ? await db.select().from(children).where(eq(children.parentId, parent.id))
    : [];

  return {
    exportedAt: new Date().toISOString(),
    account: user
      ? {
          userId: user.id,
          phone: user.phone,
          role: user.role,
          createdAt: user.createdAt.toISOString(),
        }
      : null,
    parent: parent
      ? {
          id: parent.id,
          firstName: parent.firstName,
          lastName: parent.lastName,
          email: parent.email,
          residentialArea: parent.residentialArea,
          createdAt: parent.createdAt.toISOString(),
          updatedAt: parent.updatedAt.toISOString(),
        }
      : null,
    children: kids.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      dateOfBirth: c.dateOfBirth,
      gender: c.gender,
      allergiesNotes: c.allergiesNotes,
      photoConsent: c.photoConsent,
      archivedAt: iso(c.archivedAt),
      createdAt: c.createdAt.toISOString(),
    })),
    consent: {
      smsMarketingOptIn: parent ? parent.smsMarketingOptIn : null,
      childPhotoConsent: kids.map((c) => ({
        childId: c.id,
        firstName: c.firstName,
        photoConsent: c.photoConsent,
      })),
    },
    walletSummary: wallet
      ? { walletId: wallet.id, createdAt: wallet.createdAt.toISOString() }
      : null,
    // Populated once P1-E03 (ledger) and the bookings epic land. Empty today so
    // the export schema stays stable.
    bookings: [],
    walletLedger: [],
    receipts: [],
  };
}

/** Serialize a {@link ParentExport} into the ZIP entries the parent downloads. */
export function exportToZipEntries(data: ParentExport): { name: string; data: Buffer }[] {
  const json = (v: unknown): Buffer => Buffer.from(JSON.stringify(v, null, 2), "utf8");
  return [
    { name: "export.json", data: json(data) },
    { name: "parent.json", data: json(data.parent) },
    { name: "children.json", data: json(data.children) },
    { name: "consent.json", data: json(data.consent) },
    { name: "wallet-ledger.json", data: json({ summary: data.walletSummary, entries: data.walletLedger }) },
    { name: "bookings.json", data: json(data.bookings) },
    { name: "receipts.json", data: json(data.receipts) },
  ];
}
