import { expect, it } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { parents, smsOutbox, users } from "@bm/db";
import {
  ConsentAwareSmsSender,
  PACKAGE,
  StubSmsSender,
  createSmsSender,
  isMarketingOptedIn,
  renderTemplate,
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

it("renders a template body from data", () => {
  expect(renderTemplate("auth.reset.code", { code: "123456" })).toBe(
    "Your Baby Milestones reset code is 123456. It expires in 10 minutes.",
  );
  expect(renderTemplate("raw", { body: "hello" })).toBe("hello");
});

it("renderTemplate throws on an unknown template", () => {
  expect(() => renderTemplate("nope.unknown", {})).toThrow(/unknown template/);
});

it("send() returns a queued id and writes a rendered sms_outbox row (AC1, AC2)", async () => {
  const { db, close } = await createTestDb();
  try {
    const result = await new StubSmsSender(db).send({
      to: "+254712345678",
      template: "auth.reset.code",
      data: { code: "987654" },
    });
    expect(result.id).toMatch(/[0-9a-f-]{36}/);

    const rows = await db.select().from(smsOutbox);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(result.id);
    expect(rows[0]!.phone).toBe("+254712345678");
    expect(rows[0]!.template).toBe("auth.reset.code");
    // Rendered body, captured template + data, queued status — no network call.
    expect(rows[0]!.body).toBe(
      "Your Baby Milestones reset code is 987654. It expires in 10 minutes.",
    );
    expect(rows[0]!.data).toEqual({ code: "987654" });
    expect(rows[0]!.status).toBe("queued");
  } finally {
    await close();
  }
});

it("send() resolves the registered DB template by key and interpolates data (P1-E09-S03)", async () => {
  const { db, close } = await createTestDb();
  try {
    const result = await new StubSmsSender(db).send({
      to: "+254712345678",
      template: "topup.success",
      data: { amountKes: 1500 },
    });
    const rows = await db.select().from(smsOutbox);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(result.id);
    // Body comes from the seeded sms_templates row, not an inline string.
    expect(rows[0]!.body).toBe("A top-up of KES 1500 was added to your wallet.");
    expect(rows[0]!.template).toBe("topup.success");
  } finally {
    await close();
  }
});

it("send() falls back to the in-code renderer for unregistered keys (e.g. raw)", async () => {
  const { db, close } = await createTestDb();
  try {
    await new StubSmsSender(db).send({ to: "+254712345678", template: "raw", data: { body: "hi" } });
    const rows = await db.select().from(smsOutbox);
    expect(rows[0]!.body).toBe("hi");
  } finally {
    await close();
  }
});

it("send() throws on a template key that is neither registered nor in-code", async () => {
  const { db, close } = await createTestDb();
  try {
    await expect(
      new StubSmsSender(db).send({ to: "+254712345678", template: "nope.unknown", data: {} }),
    ).rejects.toThrow(/unknown template/);
  } finally {
    await close();
  }
});

it("createSmsSender selects the stub by default and on provider=stub (AC3)", async () => {
  const { db, close } = await createTestDb();
  try {
    expect(createSmsSender(db)).toBeInstanceOf(StubSmsSender);
    expect(createSmsSender(db, { provider: "stub" })).toBeInstanceOf(StubSmsSender);
    // The live provider is the one-line swap reserved for P5-E03.
    expect(() => createSmsSender(db, { provider: "live" })).toThrow(/P5-E03/);
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
    const txn = await sender.sendTransactional({
      to: "+254712345678",
      template: "raw",
      data: { body: "booking confirmed" },
    });
    expect(txn.id).toBeTruthy();

    // Marketing to an opted-out parent is dropped; to an opted-in parent it sends.
    expect(
      await sender.sendMarketing(optedOut, { to: "+254712345678", template: "raw", data: { body: "promo" } }),
    ).toBeNull();
    expect(
      await sender.sendMarketing(optedIn, { to: "+254799999999", template: "raw", data: { body: "promo" } }),
    ).not.toBeNull();

    const rows = await db.select().from(smsOutbox);
    // One transactional + one allowed marketing = 2 (the dropped one never hit the outbox).
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.body === "booking confirmed")).toBe(true);
    expect(rows.filter((r) => r.body === "promo")).toHaveLength(1);
  } finally {
    await close();
  }
});

it("gates the receipt copy on SMS consent (P1-E05-S06 AC3)", async () => {
  const { db, close } = await createTestDb();
  try {
    const optedOut = await makeParent(db, "+254712345678", false);
    const optedIn = await makeParent(db, "+254799999999", true);
    const sender = new ConsentAwareSmsSender(db, new StubSmsSender(db));

    expect(
      await sender.sendReceipt(optedOut, {
        to: "+254712345678",
        template: "reception.receipt",
        data: { body: "receipt" },
      }),
    ).toBeNull();
    expect(
      await sender.sendReceipt(optedIn, {
        to: "+254799999999",
        template: "reception.receipt",
        data: { body: "receipt" },
      }),
    ).not.toBeNull();

    const rows = await db.select().from(smsOutbox);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.template).toBe("reception.receipt");
  } finally {
    await close();
  }
});
