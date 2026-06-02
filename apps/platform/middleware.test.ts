import { describe, expect, it } from "vitest";
import { middleware } from "./middleware";

/**
 * Edge guard contract (P1-E01-S04 + P6-E06-S04). The public marketing routes —
 * including the parenting-stories blog (`/blog`, `/blog/<slug>`) — must render for
 * unauthenticated visitors (SEO), while an authed-only path bounces to login.
 */
function reqFor(pathname: string, hasSession: boolean) {
  const url = new URL(`https://babymilestones.co.ke${pathname}`);
  // NextRequest.nextUrl is a clonable URL; mirror just `.clone()` for the redirect path.
  const nextUrl = Object.assign(url, {
    clone: () => new URL(url.toString()),
  });
  return {
    nextUrl,
    cookies: {
      get: (name: string) =>
        hasSession && name === "bm_session" ? { value: "tok" } : undefined,
    },
  } as unknown as Parameters<typeof middleware>[0];
}

describe("platform middleware — blog is public (P6-E06-S04 / Story 36.4)", () => {
  it("lets an unauthenticated visitor reach the blog index", () => {
    const res = middleware(reqFor("/blog", false));
    // NextResponse.next() carries no redirect Location header.
    expect(res.headers.get("location")).toBeNull();
  });

  it("lets an unauthenticated visitor reach a blog article", () => {
    const res = middleware(reqFor("/blog/weaning-101", false));
    expect(res.headers.get("location")).toBeNull();
  });

  it("still bounces an authed-only path to login when unauthenticated", () => {
    const res = middleware(reqFor("/home", false));
    expect(res.headers.get("location")).toContain("/login");
  });
});
