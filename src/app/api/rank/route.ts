import { NextResponse } from "next/server";
import { normalizeProfile, type TasteProfile } from "@/lib/engine/taste";
import {
  recommend,
  watchedGrid,
  type ReachSetting,
} from "@/lib/engine/recommend";
import {
  getServerCatalog,
  serverTitlesFor,
  serverVectorOf,
} from "@/lib/server-catalog";

export const runtime = "nodejs";

type RankBody = {
  surface?: "rank" | "grid";
  mode?: "swipe" | "discover";
  profile?: Partial<TasteProfile>;
  excludeIds?: unknown;
  count?: unknown;
  seed?: unknown;
  likedIds?: unknown;
  dislikedIds?: unknown;
  seenIds?: unknown;
  watchedIds?: unknown;
  homeLanguages?: unknown;
  reach?: unknown;
  withReasons?: boolean;
};

const ids = (value: unknown, max = 12_000): string[] =>
  Array.isArray(value)
    ? value.filter((x): x is string => typeof x === "string").slice(0, max)
    : [];

const reachOf = (value: unknown): ReachSetting =>
  value === "medium" || value === "wide" ? value : "narrow";

export async function POST(req: Request) {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > 2_000_000) {
    return NextResponse.json({ error: "request_too_large" }, { status: 413 });
  }

  let body: RankBody;
  try {
    body = (await req.json()) as RankBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const profile = normalizeProfile(
    body.profile && typeof body.profile === "object" ? body.profile : undefined
  );
  const count = Math.max(1, Math.min(80, Number(body.count) || 26));
  const seed = Number.isFinite(Number(body.seed)) ? Number(body.seed) : 1;
  const excludeIds = new Set(ids(body.excludeIds));
  const reach = reachOf(body.reach);
  const pool = await getServerCatalog();

  if (body.surface === "grid") {
    const watched = await serverTitlesFor(ids(body.watchedIds));
    const titles = watchedGrid(pool, profile, {
      excludeIds,
      count,
      seed,
      watched,
      reach,
    });
    return NextResponse.json({ titles });
  }

  const mode = body.mode === "discover" ? "discover" : "swipe";
  const [likedTitles, dislikedTitles, seenTitles] = await Promise.all([
    serverTitlesFor(ids(body.likedIds)),
    serverTitlesFor(ids(body.dislikedIds)),
    serverTitlesFor(ids(body.seenIds)),
  ]);
  const homeLanguages = ids(body.homeLanguages, 5)
    .map((x) => x.toLowerCase().split("-")[0])
    .filter(Boolean);

  const recs = recommend(pool, profile, {
    excludeIds,
    count,
    seed,
    vectorFor: serverVectorOf,
    likedTitles,
    dislikedTitles,
    seenTitles,
    homeLanguages,
    mode,
    reach,
  });

  return NextResponse.json({
    titles: recs.map((r) => r.title),
    match: body.withReasons ? recs.map((r) => r.match) : undefined,
    reasons: body.withReasons
      ? recs.map((r) => r.reasons.map((reason) => reason.label))
      : undefined,
    becauseOf: body.withReasons
      ? recs.map((r) => r.becauseOf ?? null)
      : undefined,
  });
}
