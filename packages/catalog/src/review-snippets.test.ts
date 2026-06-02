import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { auditOutbox, children, feedback, parents, reviewSnippets, users } from "@bm/db";
import {
  buildAttributionLabel,
  childrenCountWord,
  curateReviewSnippet,
  publishReviewSnippet,
  unpublishReviewSnippet,
  reorderReviewSnippets,
  updateSnippetAttribution,
  listPublishedSnippets,
  listLatestPublishedSnippets,
  listSnippetsForAdmin,
  listFiveStarCandidates,
  generateDefaultAttribution,
  ReviewSnippetNotFiveStarError,
  ReviewSnippetNoCommentError,
  ReviewSnippetNotFoundError,
  REVIEW_QUOTE_MAX,
  REVIEW_ATTRIBUTION_MAX,
  HOME_TESTIMONIALS_LIMIT,
} from "./review-snippets.js";

/**
 * P6-E04-S04 (Story 34.4) — Public review snippets module. The admin curates which
 * 5-star comments to publish as testimonials; anonymisation is ENFORCED (a default
 * "Parent of <count>, <place>" label from real data, always editable, never a real
 * name — AC1). Publication/unpublication is audited (AC3). The public list exposes
 * ONLY the quote + attribution (AC2).
 */
describe("review-snippets module (P6-E04-S04 / Story 34.4)", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  let seq = 0;
  async function seedAdmin(): Promise<string> {
    seq += 1;
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: `+254711${String(100000 + seq).slice(-6)}`, pinHash: "x", role: "admin" })
      .returning();
    return u!.id;
  }

  /** Seed a parent (user + profile), optionally with N active children + a place. */
  async function seedParent(opts: { childCount?: number; place?: string | null } = {}): Promise<{
    userId: string;
    parentId: string;
  }> {
    seq += 1;
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: `+254700${String(100000 + seq).slice(-6)}`, pinHash: "x" })
      .returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "Real", lastName: "Name", residentialArea: opts.place ?? null })
      .returning();
    for (let i = 0; i < (opts.childCount ?? 0); i++) {
      await dbh.db.insert(children).values({ parentId: p!.id, firstName: `Kid${i}`, dateOfBirth: "2022-01-01" });
    }
    return { userId: u!.id, parentId: p!.id };
  }

  async function seedFeedback(opts: {
    parentUserId: string;
    rating?: number;
    comment?: string | null;
  }): Promise<string> {
    seq += 1;
    const [f] = await dbh.db
      .insert(feedback)
      .values({
        sourceType: "salon",
        sourceId: `att-${seq}`,
        parentId: opts.parentUserId,
        rating: opts.rating ?? 5,
        comment: opts.comment === undefined ? "Loved it" : opts.comment,
        submittedAt: new Date("2026-06-10T10:00:00Z"),
      })
      .returning();
    return f!.id;
  }

  // --- AC1: anonymised attribution generation ------------------------------

  describe("attribution label generation (AC1)", () => {
    it("renders 'Parent of <word>, <place>' from real data", () => {
      expect(buildAttributionLabel(2, "Nairobi")).toBe("Parent of two, Nairobi");
      expect(buildAttributionLabel(1, "Mombasa")).toBe("Parent of one, Mombasa");
      expect(buildAttributionLabel(3, "Kisumu")).toBe("Parent of three, Kisumu");
    });

    it("falls back to a numeric word above the spelled range", () => {
      expect(childrenCountWord(11)).toBe("11");
      expect(buildAttributionLabel(11, "Nairobi")).toBe("Parent of 11, Nairobi");
    });

    it("drops the place when unknown — still never a name", () => {
      expect(buildAttributionLabel(2, null)).toBe("Parent of two");
      expect(buildAttributionLabel(0, "")).toBe("Parent");
    });

    it("NEVER includes the parent's real name", () => {
      const label = buildAttributionLabel(2, "Nairobi");
      expect(label).not.toContain("Real");
      expect(label).not.toContain("Name");
    });

    it("generateDefaultAttribution counts active children + uses residential area", async () => {
      const parent = await seedParent({ childCount: 2, place: "Nairobi" });
      const label = await generateDefaultAttribution(dbh.db, parent.userId);
      expect(label).toBe("Parent of two, Nairobi");
    });

    it("generateDefaultAttribution ignores archived children", async () => {
      const parent = await seedParent({ childCount: 1, place: "Nairobi" });
      // Archive a second child — must not be counted.
      await dbh.db
        .insert(children)
        .values({ parentId: parent.parentId, firstName: "Gone", dateOfBirth: "2020-01-01", archivedAt: new Date() });
      const label = await generateDefaultAttribution(dbh.db, parent.userId);
      expect(label).toBe("Parent of one, Nairobi");
    });
  });

  // --- AC1: curate is reserved to 5-star feedback with a comment ------------

  describe("curateReviewSnippet (AC1)", () => {
    it("curates from a 5-star feedback, defaulting the anonymised attribution", async () => {
      const adminId = await seedAdmin();
      const parent = await seedParent({ childCount: 2, place: "Nairobi" });
      const feedbackId = await seedFeedback({ parentUserId: parent.userId, rating: 5, comment: "Best salon ever" });
      const snippet = await curateReviewSnippet(dbh.db, { feedbackId, actor: adminId });
      expect(snippet.quote).toBe("Best salon ever");
      expect(snippet.attributionLabel).toBe("Parent of two, Nairobi");
      expect(snippet.publishedAt).toBeNull();
    });

    it("accepts an explicit attribution override (privacy guarantee)", async () => {
      const adminId = await seedAdmin();
      const parent = await seedParent({ childCount: 2, place: "Nairobi" });
      const feedbackId = await seedFeedback({ parentUserId: parent.userId, rating: 5, comment: "Wonderful" });
      const snippet = await curateReviewSnippet(dbh.db, {
        feedbackId,
        actor: adminId,
        attributionLabel: "A happy parent, Kenya",
      });
      expect(snippet.attributionLabel).toBe("A happy parent, Kenya");
    });

    it("rejects a non-5-star feedback (AC1)", async () => {
      const adminId = await seedAdmin();
      const parent = await seedParent({ place: "Nairobi" });
      const feedbackId = await seedFeedback({ parentUserId: parent.userId, rating: 4, comment: "Good" });
      await expect(curateReviewSnippet(dbh.db, { feedbackId, actor: adminId })).rejects.toThrow(
        ReviewSnippetNotFiveStarError,
      );
    });

    it("rejects a 5-star feedback with no comment", async () => {
      const adminId = await seedAdmin();
      const parent = await seedParent({ place: "Nairobi" });
      const feedbackId = await seedFeedback({ parentUserId: parent.userId, rating: 5, comment: null });
      await expect(curateReviewSnippet(dbh.db, { feedbackId, actor: adminId })).rejects.toThrow(
        ReviewSnippetNoCommentError,
      );
    });

    it("trims the quote to the comment-length cap", async () => {
      const adminId = await seedAdmin();
      const parent = await seedParent({ place: "Nairobi" });
      const feedbackId = await seedFeedback({ parentUserId: parent.userId, rating: 5, comment: "Lovely place" });
      const snippet = await curateReviewSnippet(dbh.db, { feedbackId, actor: adminId, quote: "x".repeat(REVIEW_QUOTE_MAX + 50) });
      expect(snippet.quote.length).toBe(REVIEW_QUOTE_MAX);
    });
  });

  // --- AC3: publish / unpublish are audited --------------------------------

  describe("publish / unpublish (AC2 + AC3)", () => {
    async function curated(): Promise<{ adminId: string; snippetId: string }> {
      const adminId = await seedAdmin();
      const parent = await seedParent({ childCount: 1, place: "Nairobi" });
      const feedbackId = await seedFeedback({ parentUserId: parent.userId, rating: 5, comment: "Great" });
      const snippet = await curateReviewSnippet(dbh.db, { feedbackId, actor: adminId });
      return { adminId, snippetId: snippet.id };
    }

    it("publish sets published_at and writes a review_snippet.published audit row (AC3)", async () => {
      const { adminId, snippetId } = await curated();
      const published = await publishReviewSnippet(dbh.db, { snippetId, actor: adminId });
      expect(published.publishedAt).toBeInstanceOf(Date);
      const rows = await dbh.db
        .select()
        .from(auditOutbox)
        .where(and(eq(auditOutbox.action, "review_snippet.published"), eq(auditOutbox.targetId, snippetId)));
      expect(rows.length).toBe(1);
      // The audit payload never carries the parent's real name.
      expect(JSON.stringify(rows[0]!.payload)).not.toContain("Real");
    });

    it("unpublish clears published_at and writes a review_snippet.unpublished audit row (AC3)", async () => {
      const { adminId, snippetId } = await curated();
      await publishReviewSnippet(dbh.db, { snippetId, actor: adminId });
      const unpublished = await unpublishReviewSnippet(dbh.db, { snippetId, actor: adminId });
      expect(unpublished.publishedAt).toBeNull();
      const rows = await dbh.db
        .select()
        .from(auditOutbox)
        .where(eq(auditOutbox.action, "review_snippet.unpublished"));
      expect(rows.length).toBe(1);
    });

    it("publishing an unknown snippet throws ReviewSnippetNotFoundError", async () => {
      const adminId = await seedAdmin();
      await expect(
        publishReviewSnippet(dbh.db, { snippetId: "00000000-0000-0000-0000-000000000000", actor: adminId }),
      ).rejects.toThrow(ReviewSnippetNotFoundError);
    });
  });

  // --- AC1: edit attribution + reorder -------------------------------------

  it("updateSnippetAttribution overrides the displayed label", async () => {
    const adminId = await seedAdmin();
    const parent = await seedParent({ childCount: 1, place: "Nairobi" });
    const feedbackId = await seedFeedback({ parentUserId: parent.userId, rating: 5, comment: "Great" });
    const snippet = await curateReviewSnippet(dbh.db, { feedbackId, actor: adminId });
    const updated = await updateSnippetAttribution(dbh.db, {
      snippetId: snippet.id,
      attributionLabel: "Twice-over parent, Coast",
    });
    expect(updated.attributionLabel).toBe("Twice-over parent, Coast");
  });

  it("reorderReviewSnippets sets the display order", async () => {
    const adminId = await seedAdmin();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const parent = await seedParent({ childCount: 1, place: "Nairobi" });
      const feedbackId = await seedFeedback({ parentUserId: parent.userId, rating: 5, comment: `c${i}` });
      const s = await curateReviewSnippet(dbh.db, { feedbackId, actor: adminId });
      ids.push(s.id);
    }
    await reorderReviewSnippets(dbh.db, { orderedIds: [ids[2]!, ids[0]!, ids[1]!] });
    const rows = await dbh.db.select().from(reviewSnippets);
    const byId = new Map(rows.map((r) => [r.id, r.displayOrder]));
    expect(byId.get(ids[2]!)).toBe(0);
    expect(byId.get(ids[0]!)).toBe(1);
    expect(byId.get(ids[1]!)).toBe(2);
  });

  // --- AC2: public list exposes ONLY published quote + attribution ---------

  describe("listPublishedSnippets (AC2)", () => {
    it("returns ONLY published snippets, with NO parent identity / feedback id", async () => {
      const adminId = await seedAdmin();
      const parent = await seedParent({ childCount: 2, place: "Nairobi" });
      const fid = await seedFeedback({ parentUserId: parent.userId, rating: 5, comment: "Magic" });
      const snippet = await curateReviewSnippet(dbh.db, { feedbackId: fid, actor: adminId });
      // A second curated-but-unpublished snippet must not appear.
      const parent2 = await seedParent({ childCount: 1, place: "Mombasa" });
      const fid2 = await seedFeedback({ parentUserId: parent2.userId, rating: 5, comment: "Hidden" });
      await curateReviewSnippet(dbh.db, { feedbackId: fid2, actor: adminId });

      await publishReviewSnippet(dbh.db, { snippetId: snippet.id, actor: adminId });

      const published = await listPublishedSnippets(dbh.db);
      expect(published.length).toBe(1);
      const only = published[0]!;
      expect(only.quote).toBe("Magic");
      expect(only.attributionLabel).toBe("Parent of two, Nairobi");
      // PII-absence guarantee: the projection carries ONLY quote + attribution.
      expect(Object.keys(only).sort()).toEqual(["attributionLabel", "id", "quote"]);
      expect(JSON.stringify(published)).not.toContain("Real");
      expect(JSON.stringify(published)).not.toContain(parent.userId);
      expect(JSON.stringify(published)).not.toContain(fid);
    });

    it("orders by display_order then recency", async () => {
      const adminId = await seedAdmin();
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const parent = await seedParent({ childCount: 1, place: "Nairobi" });
        const fid = await seedFeedback({ parentUserId: parent.userId, rating: 5, comment: `q${i}` });
        const s = await curateReviewSnippet(dbh.db, { feedbackId: fid, actor: adminId });
        await publishReviewSnippet(dbh.db, { snippetId: s.id, actor: adminId });
        ids.push(s.id);
      }
      await reorderReviewSnippets(dbh.db, { orderedIds: [ids[2]!, ids[0]!, ids[1]!] });
      const published = await listPublishedSnippets(dbh.db);
      expect(published.map((p) => p.quote)).toEqual(["q2", "q0", "q1"]);
    });

    it("respects the limit", async () => {
      const adminId = await seedAdmin();
      for (let i = 0; i < 5; i++) {
        const parent = await seedParent({ childCount: 1, place: "Nairobi" });
        const fid = await seedFeedback({ parentUserId: parent.userId, rating: 5, comment: `q${i}` });
        const s = await curateReviewSnippet(dbh.db, { feedbackId: fid, actor: adminId });
        await publishReviewSnippet(dbh.db, { snippetId: s.id, actor: adminId });
      }
      const published = await listPublishedSnippets(dbh.db, { limit: 3 });
      expect(published.length).toBe(3);
    });
  });

  // --- 36.5 AC1: home auto-pulls the LATEST 3 published, by publish recency --
  describe("listLatestPublishedSnippets (P6-E06-S05 / Story 36.5 AC1)", () => {
    /** Curate + publish a snippet at an explicit publish time. */
    async function publishAt(adminId: string, comment: string, at: Date): Promise<string> {
      const parent = await seedParent({ childCount: 1, place: "Nairobi" });
      const fid = await seedFeedback({ parentUserId: parent.userId, rating: 5, comment });
      const s = await curateReviewSnippet(dbh.db, { feedbackId: fid, actor: adminId });
      await publishReviewSnippet(dbh.db, { snippetId: s.id, actor: adminId, at });
      return s.id;
    }

    it("defaults to exactly the latest 3 by published_at DESC (a 4th older one is excluded)", async () => {
      const adminId = await seedAdmin();
      // Publish four, oldest → newest. The oldest (q0) must be excluded.
      await publishAt(adminId, "q0", new Date("2026-06-01T10:00:00Z"));
      await publishAt(adminId, "q1", new Date("2026-06-02T10:00:00Z"));
      await publishAt(adminId, "q2", new Date("2026-06-03T10:00:00Z"));
      await publishAt(adminId, "q3", new Date("2026-06-04T10:00:00Z"));

      const latest = await listLatestPublishedSnippets(dbh.db);
      expect(latest.map((s) => s.quote)).toEqual(["q3", "q2", "q1"]);
    });

    it("orders by publish recency, NOT display_order (a newly-published snippet appears first)", async () => {
      const adminId = await seedAdmin();
      const idOld = await publishAt(adminId, "old", new Date("2026-06-01T10:00:00Z"));
      // Give the OLD one a low display_order — recency must still win for the home strip.
      await reorderReviewSnippets(dbh.db, { orderedIds: [idOld] });
      await publishAt(adminId, "newer", new Date("2026-06-05T10:00:00Z"));

      const latest = await listLatestPublishedSnippets(dbh.db);
      expect(latest.map((s) => s.quote)).toEqual(["newer", "old"]);
    });

    it("excludes unpublished snippets and carries no PII (only id/quote/attribution)", async () => {
      const adminId = await seedAdmin();
      await publishAt(adminId, "shown", new Date("2026-06-03T10:00:00Z"));
      // A curated-but-unpublished snippet must never appear.
      const parent = await seedParent({ childCount: 1, place: "Mombasa" });
      const fid = await seedFeedback({ parentUserId: parent.userId, rating: 5, comment: "draft" });
      await curateReviewSnippet(dbh.db, { feedbackId: fid, actor: adminId });

      const latest = await listLatestPublishedSnippets(dbh.db);
      expect(latest.map((s) => s.quote)).toEqual(["shown"]);
      expect(Object.keys(latest[0]!).sort()).toEqual(["attributionLabel", "id", "quote"]);
    });

    it("honours an explicit limit override", async () => {
      const adminId = await seedAdmin();
      await publishAt(adminId, "a", new Date("2026-06-01T10:00:00Z"));
      await publishAt(adminId, "b", new Date("2026-06-02T10:00:00Z"));
      const latest = await listLatestPublishedSnippets(dbh.db, { limit: 1 });
      expect(latest.map((s) => s.quote)).toEqual(["b"]);
    });

    it("exposes the home-strip limit of 3 (AC1)", () => {
      expect(HOME_TESTIMONIALS_LIMIT).toBe(3);
    });
  });

  // --- Admin views ---------------------------------------------------------

  it("listFiveStarCandidates returns 5-star feedback with a comment, not-yet-curated", async () => {
    const adminId = await seedAdmin();
    const parent = await seedParent({ childCount: 2, place: "Nairobi" });
    const candidateFid = await seedFeedback({ parentUserId: parent.userId, rating: 5, comment: "Curate me" });
    // 4-star → not a candidate.
    await seedFeedback({ parentUserId: parent.userId, rating: 4, comment: "Meh" });
    // 5-star without comment → not a candidate.
    await seedFeedback({ parentUserId: parent.userId, rating: 5, comment: null });
    // 5-star already curated → excluded.
    const alreadyFid = await seedFeedback({ parentUserId: parent.userId, rating: 5, comment: "Done" });
    await curateReviewSnippet(dbh.db, { feedbackId: alreadyFid, actor: adminId });

    const candidates = await listFiveStarCandidates(dbh.db);
    expect(candidates.map((c) => c.feedbackId)).toEqual([candidateFid]);
    expect(candidates[0]!.comment).toBe("Curate me");
    // The suggested default attribution rides along (never the real name).
    expect(candidates[0]!.suggestedAttribution).toBe("Parent of two, Nairobi");
  });

  it("listSnippetsForAdmin returns curated snippets with publish state + feedback id", async () => {
    const adminId = await seedAdmin();
    const parent = await seedParent({ childCount: 1, place: "Nairobi" });
    const fid = await seedFeedback({ parentUserId: parent.userId, rating: 5, comment: "Great" });
    const s = await curateReviewSnippet(dbh.db, { feedbackId: fid, actor: adminId });
    await publishReviewSnippet(dbh.db, { snippetId: s.id, actor: adminId });
    const admin = await listSnippetsForAdmin(dbh.db);
    expect(admin.length).toBe(1);
    expect(admin[0]!.feedbackId).toBe(fid);
    expect(admin[0]!.published).toBe(true);
  });

  it("exposes the contract caps", () => {
    expect(REVIEW_QUOTE_MAX).toBe(200);
    expect(REVIEW_ATTRIBUTION_MAX).toBe(120);
  });
});
