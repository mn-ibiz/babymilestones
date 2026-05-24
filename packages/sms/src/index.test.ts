import { expect, it } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { parents, smsOutbox, users } from "@bm/db";
import {
  ConsentAwareSmsSender,
  PACKAGE,
  StubSmsSender,
  isMarketingOptedIn,
} from "./index.js";

/** Insert a parent with the given opt-in and return its id. */
async function makeParent(
  db: Awaited<ReturnType<typeof createTestDb>>["db"],
  phone: string,
  optIn: boolean,
): Promise<string> {
  const [u] = await db.insert(users).values({ phone, pinHash: "x" }).returning();
  const [p] = await db
    .insert(parents)
    .values({ userId: u!.id, firstName: "A", lastName: "B", smsMarketingOptIn: optIn })
    .returning();
  return p!.id;
}

it("identifies itself", () => {
  expect(PACKAGE).toBe("@bm/sms");
});

it("stub sender records the message in sms_outbox", async () => {
  const { db, close } = await createTestDb();
  try {
    await new StubSmsSender(db).send({
      phone: "+254712345678",
      body: "hello",
      template: "test.template",
    });
    const rows = await db.select().from(smsOutbox);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.phone).toBe("+254712345678");
    expect(rows[0]!.body).toBe("hello");
    expect(rows[0]!.template).toBe("test.template");
  } finally {
    await close();
  }
});

it("marketing gate defaults closed and reflects opt-in (P1-E02-S04 AC3)", async () => {
  const { db, close } = await createTestDb();
  try {
    const off = await makeParent(db, "+254712345678", false);
    const on = await makeParent(db, "+254799999999", true);
    expect(await isMarketingOptedIn(db, off)).toBe(false);
    expect(await isMarketingOptedIn(db, on)).toBe(true);
    // Unknown parent → fail closed.
    expect(await isMarketingOptedIn(db, "00000000-0000-0000-0000-000000000000")).toBe(false);
  } finally {
    await close();
  }
});

it("gates marketing sends by opt-in but always sends transactional (AC3)", async () => {
  const { db, close } = await createTestDb();
  try {
    const optedOut = await makeParent(db, "+254712345678", false);
    const optedIn = await makeParent(db, "+254799999999", true);
    const sender = new ConsentAwareSmsSender(db, new StubSmsSender(db));

    // Transactional always sends regardless of opt-in.
    expect(await sender.sendTransactional({ phone: "+254712345678", body: "booking confirmed" })).toBe(
      true,
    );

    // Marketing to an opted-out parent is dropped; to an opted-in parent it sends.
    expect(await sender.sendMarketing(optedOut, { phone: "+254712345678", body: "promo" })).toBe(false);
    expect(await sender.sendMarketing(optedIn, { phone: "+254799999999", body: "promo" })).toBe(true);

    const rows = await db.select().from(smsOutbox);
    // One transactional + one allowed marketing = 2 (the dropped one never hit the outbox).
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.body === "booking confirmed")).toBe(true);
    expect(rows.filter((r) => r.body === "promo")).toHaveLength(1);
  } finally {
    await close();
  }
});
