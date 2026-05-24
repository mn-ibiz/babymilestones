import { expect, it } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { smsOutbox } from "@bm/db";
import { PACKAGE, StubSmsSender } from "./index.js";

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
