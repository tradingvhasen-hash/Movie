import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Ranking is intentionally browser-worker-first on the current Render tier.
 * A full server rank requires materializing the 48k-title catalog and its
 * indexes, which exceeded the live instance's memory budget and crashed
 * next-server. A fast 503 tells the client to use the identical local worker
 * path immediately.
 */
export async function POST() {
  return NextResponse.json(
    { error: "server_ranking_disabled" },
    { status: 503, headers: { "cache-control": "no-store" } }
  );
}
