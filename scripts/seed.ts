/**
 * Dhawq catalog seeder — pulls popular movies & TV from TMDB, builds the
 * feature vectors and item similarities, and uploads everything to Supabase.
 *
 * Usage:
 *   TMDB_API_KEY=...  SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/seed.ts [--pages 50] [--dry]
 *
 *   --pages N  pages per TMDB list (2 lists × 2 types × N pages × 20, minus
 *              overlap and low-vote titles; default 250 → ~10-15k titles,
 *              TMDB caps each list at 500 pages → ~40k max)
 *   --dry      fetch + featurize only, write JSON to ./seed-output.json,
 *              skip the Supabase upload (works without Supabase keys)
 *
 * TMDB free tier allows 40 req/10s; the script throttles accordingly.
 * Everything here is one-time, deterministic math — no AI services.
 */
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { featurize, cosine, DIM } from "../src/lib/engine/features";
import type { Title, TitleType } from "../src/lib/types";

const TMDB = "https://api.themoviedb.org/3";
const API_KEY = process.env.TMDB_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const PAGES = Math.min(Number(args[args.indexOf("--pages") + 1]) || 250, 500);
const ONBOARDING_COUNT = 60;

if (!API_KEY) {
  console.error("Missing TMDB_API_KEY env var. Get one free at themoviedb.org → Settings → API.");
  process.exit(1);
}
if (!DRY && (!SUPABASE_URL || !SERVICE_KEY)) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or pass --dry to skip upload).");
  process.exit(1);
}

// TMDB genre id → slug (movies + tv merged)
const GENRES: Record<number, string> = {
  28: "action", 12: "adventure", 16: "animation", 35: "comedy", 80: "crime",
  99: "documentary", 18: "drama", 10751: "family", 14: "fantasy", 36: "history",
  27: "horror", 10402: "music", 9648: "mystery", 10749: "romance", 878: "scifi",
  53: "thriller", 10752: "war", 37: "western", 10759: "action", 10762: "kids",
  10763: "news", 10764: "reality", 10765: "scifi", 10766: "soap", 10767: "talk",
  10768: "politics",
};

let lastRequests: number[] = [];
async function tmdb(path: string, params: Record<string, string> = {}): Promise<any> {
  // throttle: ≤35 requests / 10s
  const now = Date.now();
  lastRequests = lastRequests.filter((t) => now - t < 10_000);
  if (lastRequests.length >= 35) {
    await new Promise((r) => setTimeout(r, 10_000 - (now - lastRequests[0]) + 100));
  }
  lastRequests.push(Date.now());

  const url = new URL(`${TMDB}${path}`);
  url.searchParams.set("api_key", API_KEY!);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`TMDB ${res.status} for ${path}`);
      return await res.json();
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}

async function discoverIds(type: TitleType): Promise<Set<number>> {
  const ids = new Set<number>();
  const lists = type === "movie" ? ["popular", "top_rated"] : ["popular", "top_rated"];
  for (const list of lists) {
    for (let page = 1; page <= PAGES; page++) {
      const data = await tmdb(`/${type}/${list}`, { page: String(page) });
      for (const r of data.results ?? []) ids.add(r.id);
      if (page >= (data.total_pages ?? 1)) break;
      if (page % 10 === 0) console.log(`  ${type}/${list}: page ${page}, ${ids.size} ids`);
    }
  }
  return ids;
}

async function fetchTitle(type: TitleType, tmdbId: number): Promise<Title | null> {
  try {
    const d = await tmdb(`/${type}/${tmdbId}`, {
      append_to_response: "keywords,credits,translations",
    });
    const en = {
      title: type === "movie" ? d.title : d.name,
      overview: d.overview ?? "",
    };
    const arTrans = (d.translations?.translations ?? []).find(
      (t: any) => t.iso_639_1 === "ar"
    )?.data;
    const keywords: string[] = (
      type === "movie" ? d.keywords?.keywords : d.keywords?.results
    )?.map((k: any) => k.name) ?? [];
    const director =
      type === "movie"
        ? d.credits?.crew?.find((c: any) => c.job === "Director")?.name
        : d.created_by?.[0]?.name;
    const cast: string[] = (d.credits?.cast ?? []).slice(0, 5).map((c: any) => c.name);
    const year = Number(
      (type === "movie" ? d.release_date : d.first_air_date)?.slice(0, 4)
    );
    if (!en.title || !year || (d.vote_count ?? 0) < 50) return null;

    return {
      id: `${type}-${tmdbId}`,
      type,
      tmdbId,
      title: { en: en.title, ar: arTrans?.title || arTrans?.name || en.title },
      overview: { en: en.overview, ar: arTrans?.overview || en.overview },
      year,
      genres: [...new Set((d.genres ?? []).map((g: any) => GENRES[g.id]).filter(Boolean))] as string[],
      keywords,
      people: { director, cast },
      originalLanguage: d.original_language ?? "en",
      rating: d.vote_average ?? 0,
      voteCount: d.vote_count ?? 0,
      popularity: d.popularity ?? 0,
      posterPath: d.poster_path ?? null,
      backdropPath: d.backdrop_path ?? null,
    };
  } catch (e) {
    console.warn(`  skip ${type}-${tmdbId}: ${(e as Error).message}`);
    return null;
  }
}

function pickOnboarding(titles: Title[], vectors: Map<string, Float32Array>) {
  // farthest-point sampling over the most popular slice → diverse famous anchors
  const pool = [...titles].sort((a, b) => b.popularity - a.popularity).slice(0, 400);
  const picked: Title[] = [pool[0]];
  const rest = pool.slice(1);
  while (picked.length < ONBOARDING_COUNT && rest.length > 0) {
    let bestIdx = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < rest.length; i++) {
      let minDist = Infinity;
      for (const p of picked) {
        const d = 1 - cosine(vectors.get(rest[i].id)!, vectors.get(p.id)!);
        if (d < minDist) minDist = d;
      }
      const val = minDist + Math.log10(1 + rest[i].popularity) * 0.05;
      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    }
    picked.push(rest.splice(bestIdx, 1)[0]);
  }
  const ids = new Set(picked.map((p) => p.id));
  for (const t of titles) t.onboarding = ids.has(t.id);
}

function computeSimilarities(titles: Title[], vectors: Map<string, Float32Array>, topK = 30) {
  console.log(`Computing top-${topK} similarities for ${titles.length} titles…`);
  const rows: { title_id: string; similar_title_id: string; score: number }[] = [];
  for (let i = 0; i < titles.length; i++) {
    const scores: { id: string; s: number }[] = [];
    const vi = vectors.get(titles[i].id)!;
    for (let j = 0; j < titles.length; j++) {
      if (i === j) continue;
      scores.push({ id: titles[j].id, s: cosine(vi, vectors.get(titles[j].id)!) });
    }
    scores.sort((a, b) => b.s - a.s);
    for (const { id, s } of scores.slice(0, topK)) {
      rows.push({ title_id: titles[i].id, similar_title_id: id, score: Number(s.toFixed(4)) });
    }
    if (i % 250 === 0) console.log(`  ${i}/${titles.length}`);
  }
  return rows;
}

function toVectorLiteral(v: Float32Array): string {
  return `[${Array.from(v, (x) => Number(x.toFixed(6))).join(",")}]`;
}

async function main() {
  console.log(`Seeding Dhawq catalog (pages=${PAGES}, dry=${DRY})`);

  const [movieIds, tvIds] = [await discoverIds("movie"), await discoverIds("tv")];
  console.log(`Found ${movieIds.size} movies, ${tvIds.size} tv shows. Fetching details…`);

  const titles: Title[] = [];
  let done = 0;
  const jobs: [TitleType, number][] = [
    ...[...movieIds].map((id) => ["movie", id] as [TitleType, number]),
    ...[...tvIds].map((id) => ["tv", id] as [TitleType, number]),
  ];
  for (const [type, id] of jobs) {
    const t = await fetchTitle(type, id);
    if (t) titles.push(t);
    if (++done % 100 === 0) console.log(`  details: ${done}/${jobs.length} (${titles.length} kept)`);
  }
  console.log(`Fetched ${titles.length} titles. Vectorizing…`);

  const vectors = new Map<string, Float32Array>();
  for (const t of titles) vectors.set(t.id, featurize(t));

  pickOnboarding(titles, vectors);

  if (DRY) {
    const simRows = computeSimilarities(titles.slice(0, 500), vectors);
    writeFileSync("./seed-output.json", JSON.stringify({ titles, similarities: simRows.length }, null, 1));
    console.log(`Dry run complete → ./seed-output.json (${titles.length} titles, dim=${DIM})`);
    return;
  }

  const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!);
  console.log("Uploading titles…");
  for (let i = 0; i < titles.length; i += 200) {
    const batch = titles.slice(i, i + 200).map((t) => ({
      id: t.id,
      tmdb_id: t.tmdbId,
      type: t.type,
      title_en: t.title.en,
      title_ar: t.title.ar,
      overview_en: t.overview.en,
      overview_ar: t.overview.ar,
      year: t.year,
      genres: t.genres,
      keywords: t.keywords,
      director: t.people.director ?? null,
      cast_names: t.people.cast,
      original_language: t.originalLanguage,
      rating: t.rating,
      vote_count: t.voteCount,
      popularity: t.popularity,
      poster_path: t.posterPath,
      backdrop_path: t.backdropPath,
      onboarding: t.onboarding ?? false,
      feature_vector: toVectorLiteral(vectors.get(t.id)!),
    }));
    const { error } = await supabase.from("titles").upsert(batch);
    if (error) throw new Error(`titles upsert failed: ${error.message}`);
    console.log(`  titles: ${Math.min(i + 200, titles.length)}/${titles.length}`);
  }

  console.log("Rebuilding item similarities in-database (HNSW)…");
  const { error: simError } = await supabase.rpc("rebuild_item_similarity", { top_k: 30 });
  if (simError) {
    console.warn(
      `  rpc timed out or failed (${simError.message}).\n` +
        "  Run this once in the Supabase SQL editor instead:\n" +
        "    select public.rebuild_item_similarity();"
    );
  }

  console.log(`✅ Done: ${titles.length} titles uploaded.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
