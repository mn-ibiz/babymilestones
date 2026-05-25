import { NextResponse } from "next/server";
import { checkReadiness } from "../../../lib/health.js";

// Readiness (X8-S02 AC1): the app's only dependency is the upstream API.
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const result = await checkReadiness();
  return NextResponse.json(
    { status: result.ready ? "ok" : "unavailable", checks: result.checks },
    { status: result.ready ? 200 : 503 },
  );
}
