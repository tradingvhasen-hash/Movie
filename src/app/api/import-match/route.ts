import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Large imports use the browser catalog matcher for now. The server version
 * required the same fully decoded 48k-title catalog that exhausted the Render
 * instance. ImportLibrary treats this 503 as a signal to run its existing
 * exact local fallback.
 */
export async function POST() {
  return NextResponse.json(
    { error: "server_import_match_disabled" },
    { status: 503, headers: { "cache-control": "no-store" } }
  );
}
