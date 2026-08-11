import { NextResponse } from "next/server";
import { featurize } from "@/lib/engine/features";
import { calibrationDeck, recommend, type CandidateItem } from "@/lib/engine/recommend";
import type { TasteProfile } from "@/lib/engine/taste";
import { getServerSupabase } from "@/lib/supabase/server";
import { rowToTitle, type TitleRow } from "@/lib/supabase/rows";

/**
 * Cloud recommendation endpoint (active once Supabase is configured and
 * seeded). Stage 1: pgvector ANN candidate generation in Postgres.
 * Stage 2: the same blended-scoring + MMR engine used client-side.
 * Guests and signed-in users both use it — the taste profile travels with
 * the request, so no server-side user state is required.
 */
export async function POST(req: Request) {
  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "supabase_not_configured" },
      { status: 503 }
    );
  }

  let body: {
    profile: TasteProfile;
    exclude?: string[];
    likedIds?: string[];
    count?: number;
    mode?: "recommend" | "calibration";
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const exclude = (body.exclude ?? []).slice(0, 5000);
  const count = Math.min(Math.max(body.count ?? 10, 1), 50);

  if (body.mode === "calibration") {
    const { data, error } = await supabase.rpc("calibration_pool", {
      exclude_ids: exclude,
      pool_count: 80,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const pool: CandidateItem[] = (data as TitleRow[]).map((row) => {
      const title = rowToTitle(row);
      return { title, vector: featurize(title) };
    });
    const titles = calibrationDeck(pool, new Set(exclude), count);
    return NextResponse.json({ items: titles.map((title) => ({ title, score: 1 })) });
  }

  const profile = body.profile;
  if (!profile || !Array.isArray(profile.taste)) {
    return NextResponse.json({ error: "bad_profile" }, { status: 400 });
  }

  const tasteLiteral = `[${profile.taste.map((x) => Number(x) || 0).join(",")}]`;
  const { data, error } = await supabase.rpc("match_titles", {
    query_vector: tasteLiteral,
    exclude_ids: exclude,
    match_count: 200,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pool: CandidateItem[] = (data as TitleRow[]).map((row) => {
    const title = rowToTitle(row);
    return { title, vector: featurize(title) };
  });

  // collaborative bonus from co-occurrence with the user's likes
  const likedIds = (body.likedIds ?? []).slice(0, 300);
  const coBonus = new Map<string, number>();
  if (likedIds.length > 0) {
    const { data: cooc } = await supabase
      .from("co_occurrence")
      .select("title_a, title_b, both_liked")
      .in("title_a", likedIds)
      .limit(2000);
    for (const row of cooc ?? []) {
      const prev = coBonus.get(row.title_b) ?? 0;
      coBonus.set(row.title_b, Math.min(0.25, prev + Math.log10(1 + row.both_liked) * 0.05));
    }
  }

  const recs = recommend(pool, profile, {
    excludeIds: new Set(exclude),
    count,
    coOccurrenceBonus: coBonus,
  });

  return NextResponse.json({
    items: recs.map((r) => ({ title: r.title, score: r.score })),
  });
}
