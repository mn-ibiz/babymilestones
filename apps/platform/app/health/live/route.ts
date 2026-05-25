import { NextResponse } from "next/server";

// Liveness (X8-S02 AC1): process-up, no I/O. Kept dynamic so it is never
// statically cached and always reflects a live process.
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json({ status: "ok" });
}
