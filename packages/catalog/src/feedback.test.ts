import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { auditOutbox, feedback, parents, users } from "@bm/db";
import {
  createFeedbackInvitation,
  listPendingFeedbackForParent,
  submitFeedback,
  FeedbackInvitationNotFoundError,
  FeedbackNotOwnedError,
  InvalidFeedbackRatingError,
  FeedbackCommentTooLongError,
} from "./feedback.js";

/**
 * P6-E04-S01 (Story 34.1) — Feedback Engine FOUNDATION. The pure module that
 * creates an invitation per completed paid touchpoint (idempotent on
 * source_type+source_id), lists a parent's pending invitations, and records a
 * one-tap 0–5 rating + optional ≤200-char comment ONCE (AC2/AC3).
 */
describe("feedback module (P6-E04-S01 / Story 34.1)", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  let seq = 0;
  async function seedParent() {
    seq += 1;
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: `+25470000${String(1000 + seq).slice(-4)}`, pinHash: "x" })
      .returning();
    await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Amina", lastName: "Mum" });
    return u!.id;
  }

  // --- AC1/AC3: invitation creation + idempotency ---------------------------

  it("AC1: creates an open invitation for a completed touchpoint", async () => {
    const parentId = await seedParent();
    const inv = await createFeedbackInvitation(dbh.db, {
      sourceType: "salon",
      sourceId: "att-1",
      parentId,
      attributedStaffId: null,
    });
    expect(inv).not.toBeNull();
    expect(inv!.sourceType).toBe("salon");
    expect(inv!.sourceId).toBe("att-1");
    expect(inv!.parentId).toBe(parentId);
    expect(inv!.rating).toBeNull();
    expect(inv!.submittedAt).toBeNull();
    expect(inv!.token).toBeTruthy();
  });

  it("AC3: the same touchpoint twice yields exactly ONE row (idempotent)", async () => {
    const parentId = await seedParent();
    const first = await createFeedbackInvitation(dbh.db, {
      sourceType: "salon",
      sourceId: "att-dup",
      parentId,
    });
    const second = await createFeedbackInvitation(dbh.db, {
      sourceType: "salon",
      sourceId: "att-dup",
      parentId,
    });
    // A replay returns null (nothing newly created) and never duplicates the row.
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    const rows = await dbh.db
      .select()
      .from(feedback)
      .where(and(eq(feedback.sourceType, "salon"), eq(feedback.sourceId, "att-dup")));
    expect(rows).toHaveLength(1);
  });

  it("carries the attributed staff id when supplied", async () => {
    const parentId = await seedParent();
    const inv = await createFeedbackInvitation(dbh.db, {
      sourceType: "salon",
      sourceId: "att-staff",
      parentId,
      attributedStaffId: "11111111-1111-1111-1111-111111111111",
    });
    expect(inv!.attributedStaffId).toBe("11111111-1111-1111-1111-111111111111");
  });

  // --- AC2/AC3: submit (0–5 + optional comment, once) -----------------------

  it("AC2: submit records a 0–5 rating + optional ≤200-char comment", async () => {
    const parentId = await seedParent();
    const inv = await createFeedbackInvitation(dbh.db, {
      sourceType: "salon",
      sourceId: "att-sub",
      parentId,
    });
    const out = await submitFeedback(dbh.db, {
      token: inv!.token,
      parentId,
      rating: 5,
      comment: "Lovely cut",
    });
    expect(out.rating).toBe(5);
    expect(out.comment).toBe("Lovely cut");
    expect(out.submittedAt).not.toBeNull();
  });

  it("AC2: a comment is optional", async () => {
    const parentId = await seedParent();
    const inv = await createFeedbackInvitation(dbh.db, {
      sourceType: "salon",
      sourceId: "att-nc",
      parentId,
    });
    const out = await submitFeedback(dbh.db, { token: inv!.token, parentId, rating: 0 });
    expect(out.rating).toBe(0);
    expect(out.comment).toBeNull();
  });

  it("AC2: rejects a rating outside 0..5", async () => {
    const parentId = await seedParent();
    const inv = await createFeedbackInvitation(dbh.db, {
      sourceType: "salon",
      sourceId: "att-bad",
      parentId,
    });
    await expect(
      submitFeedback(dbh.db, { token: inv!.token, parentId, rating: 6 }),
    ).rejects.toBeInstanceOf(InvalidFeedbackRatingError);
    await expect(
      submitFeedback(dbh.db, { token: inv!.token, parentId, rating: -1 }),
    ).rejects.toBeInstanceOf(InvalidFeedbackRatingError);
    await expect(
      submitFeedback(dbh.db, { token: inv!.token, parentId, rating: 2.5 }),
    ).rejects.toBeInstanceOf(InvalidFeedbackRatingError);
  });

  it("AC2: rejects a comment longer than 200 chars", async () => {
    const parentId = await seedParent();
    const inv = await createFeedbackInvitation(dbh.db, {
      sourceType: "salon",
      sourceId: "att-long",
      parentId,
    });
    await expect(
      submitFeedback(dbh.db, { token: inv!.token, parentId, rating: 4, comment: "x".repeat(201) }),
    ).rejects.toBeInstanceOf(FeedbackCommentTooLongError);
  });

  it("AC3: a second submit is a no-op — the first rating is NEVER overwritten", async () => {
    const parentId = await seedParent();
    const inv = await createFeedbackInvitation(dbh.db, {
      sourceType: "salon",
      sourceId: "att-once",
      parentId,
    });
    const first = await submitFeedback(dbh.db, {
      token: inv!.token,
      parentId,
      rating: 5,
      comment: "first",
    });
    // Replay / re-submit with a different rating: must return the ORIGINAL, unchanged.
    const replay = await submitFeedback(dbh.db, {
      token: inv!.token,
      parentId,
      rating: 1,
      comment: "second",
    });
    expect(replay.rating).toBe(5);
    expect(replay.comment).toBe("first");
    expect(replay.submittedAt!.getTime()).toBe(first.submittedAt!.getTime());
  });

  it("submitting an unknown token throws not-found", async () => {
    const parentId = await seedParent();
    await expect(
      submitFeedback(dbh.db, {
        token: "00000000-0000-0000-0000-000000000000",
        parentId,
        rating: 3,
      }),
    ).rejects.toBeInstanceOf(FeedbackInvitationNotFoundError);
  });

  // --- ownership ------------------------------------------------------------

  it("ownership: a parent CANNOT submit another parent's invitation", async () => {
    const owner = await seedParent();
    const intruder = await seedParent();
    const inv = await createFeedbackInvitation(dbh.db, {
      sourceType: "salon",
      sourceId: "att-own",
      parentId: owner,
    });
    await expect(
      submitFeedback(dbh.db, { token: inv!.token, parentId: intruder, rating: 5 }),
    ).rejects.toBeInstanceOf(FeedbackNotOwnedError);
    // And the invitation stays pending (untouched).
    const [row] = await dbh.db.select().from(feedback).where(eq(feedback.id, inv!.id));
    expect(row!.submittedAt).toBeNull();
  });

  // --- pending list (scoped to the parent) ----------------------------------

  it("lists ONLY the authed parent's pending invitations (scoped + open only)", async () => {
    const mine = await seedParent();
    const other = await seedParent();
    await createFeedbackInvitation(dbh.db, { sourceType: "salon", sourceId: "p-1", parentId: mine });
    await createFeedbackInvitation(dbh.db, { sourceType: "order", sourceId: "p-2", parentId: mine });
    await createFeedbackInvitation(dbh.db, { sourceType: "salon", sourceId: "p-3", parentId: other });
    // Submit one of mine → it drops out of the pending list.
    const submitted = await createFeedbackInvitation(dbh.db, {
      sourceType: "salon",
      sourceId: "p-4",
      parentId: mine,
    });
    await submitFeedback(dbh.db, { token: submitted!.token, parentId: mine, rating: 5 });

    const pending = await listPendingFeedbackForParent(dbh.db, mine);
    const ids = pending.map((p) => p.sourceId).sort();
    expect(ids).toEqual(["p-1", "p-2"]);
    expect(pending.every((p) => p.token)).toBe(true);
  });

  // --- audit ----------------------------------------------------------------

  it("audits feedback.submitted on submit", async () => {
    const parentId = await seedParent();
    const inv = await createFeedbackInvitation(dbh.db, {
      sourceType: "salon",
      sourceId: "att-audit",
      parentId,
    });
    await submitFeedback(dbh.db, { token: inv!.token, parentId, rating: 4 });
    const rows = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "feedback.submitted"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actorUserId).toBe(parentId);
  });
});
