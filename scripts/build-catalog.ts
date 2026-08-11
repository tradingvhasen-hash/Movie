/**
 * Builds the bundled catalog shipped with the static site.
 *
 *   TMDB_API_KEY=... npx tsx scripts/build-catalog.ts [--count 5000]
 *
 * Writes src/lib/data/catalog.json — plain metadata only. Feature vectors
 * are derived in the browser by lib/catalog.ts (featurize is a pure
 * function), which keeps the download small: storing 384 floats per title
 * would multiply the file size by ~6x for no benefit.
 *
 * Fields are trimmed deliberately (overview clipped, ≤10 keywords, ≤4 cast)
 * because every byte here is downloaded by every visitor.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { encodeCatalog } from "../src/lib/data/catalog-codec";
import type { Title, TitleType } from "../src/lib/types";

const API_KEY = process.env.TMDB_API_KEY;
if (!API_KEY) {
  console.error("Missing TMDB_API_KEY");
  process.exit(1);
}

const args = process.argv.slice(2);
const TARGET = Number(args[args.indexOf("--count") + 1]) || 5000;
/* served as a static asset so it is cached separately from the JS bundle
   and parsed by the browser's native JSON parser */
const OUT = "public/catalog.json";

const MIN_VOTES = 60;
const TODAY = new Date().toISOString().slice(0, 10);

/** not narrative works — they pollute taste vectors and the swipe deck */
const EXCLUDED_GENRES = new Set(["news", "talk", "reality", "soap"]);
/** valid catalog entries, but poor signals for cold-start calibration */
const NON_CALIBRATION_GENRES = new Set(["documentary"]);
const MAX_OVERVIEW = 200;
const MAX_KEYWORDS = 10;
const MAX_CAST = 4;
const ONBOARDING_COUNT = 80;

const GENRES: Record<number, string> = {
  28: "action", 12: "adventure", 16: "animation", 35: "comedy", 80: "crime",
  99: "documentary", 18: "drama", 10751: "family", 14: "fantasy", 36: "history",
  27: "horror", 10402: "music", 9648: "mystery", 10749: "romance", 878: "scifi",
  53: "thriller", 10752: "war", 37: "western", 10759: "action", 10762: "kids",
  10763: "news", 10764: "reality", 10765: "scifi", 10766: "soap", 10767: "talk",
  10768: "politics",
};

/* ── throttled fetch ───────────────────────────────────────── */
const LIMIT = 25; // requests per second, safely under TMDB's ceiling
let stamps: number[] = [];
let gate: Promise<void> = Promise.resolve();

/** serialize slot reservation so concurrent workers can't overshoot */
function reserveSlot(): Promise<void> {
  gate = gate.then(async () => {
    for (;;) {
      const now = Date.now();
      stamps = stamps.filter((t) => now - t < 1000);
      if (stamps.length < LIMIT) {
        stamps.push(now);
        return;
      }
      await new Promise((r) => setTimeout(r, 1000 - (now - stamps[0]) + 10));
    }
  });
  return gate;
}

async function tmdb(path: string, params: Record<string, string> = {}): Promise<any> {
  await reserveSlot();

  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set("api_key", API_KEY!);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`${res.status} ${path}`);
      return await res.json();
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
    }
  }
}

/** Collect ids from popular/top-rated plus year-sliced discover for depth */
async function collectIds(type: TitleType, want: number): Promise<number[]> {
  const ids = new Set<number>();
  const dateField = type === "movie" ? "primary_release_date" : "first_air_date";

  for (const list of ["popular", "top_rated"]) {
    for (let page = 1; page <= 60 && ids.size < want; page++) {
      const data = await tmdb(`/${type}/${list}`, { page: String(page) });
      for (const r of data.results ?? []) ids.add(r.id);
      if (page >= (data.total_pages ?? 1)) break;
    }
    console.log(`  ${type}/${list}: ${ids.size} ids`);
  }

  // year slices keep the catalog from being only the last few years
  const thisYear = new Date().getFullYear();
  for (let year = thisYear; year >= 1970 && ids.size < want; year--) {
    for (let page = 1; page <= 3 && ids.size < want; page++) {
      const data = await tmdb(`/discover/${type}`, {
        page: String(page),
        sort_by: "vote_count.desc",
        [`${dateField}.gte`]: `${year}-01-01`,
        [`${dateField}.lte`]: year === thisYear ? TODAY : `${year}-12-31`,
        "vote_count.gte": String(MIN_VOTES),
      });
      for (const r of data.results ?? []) ids.add(r.id);
      if (page >= (data.total_pages ?? 1)) break;
    }
    if (year % 10 === 0) console.log(`  ${type}/discover ${year}: ${ids.size} ids`);
  }
  return [...ids].slice(0, want);
}

function clip(text: string, max: number): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

async function fetchTitle(type: TitleType, id: number): Promise<Title | null> {
  try {
    const d = await tmdb(`/${type}/${id}`, {
      append_to_response: "keywords,credits,translations",
    });
    const titleEn: string = type === "movie" ? d.title : d.name;
    const released: string | undefined =
      type === "movie" ? d.release_date : d.first_air_date;
    const year = Number(released?.slice(0, 4));
    if (!titleEn || !year || (d.vote_count ?? 0) < MIN_VOTES) return null;
    if (d.adult) return null;
    // TMDB popularity spikes for unreleased titles; asking "have you watched
    // this?" about a film that isn't out yet is nonsense, so drop them
    if (!released || released > TODAY) return null;

    const genres = [
      ...new Set((d.genres ?? []).map((g: any) => GENRES[g.id]).filter(Boolean)),
    ] as string[];
    // no genres usually means a stub entry; excluded genres aren't narrative works
    if (genres.length === 0 || genres.some((g) => EXCLUDED_GENRES.has(g))) return null;

    const ar = (d.translations?.translations ?? []).find(
      (t: any) => t.iso_639_1 === "ar"
    )?.data;
    const keywords: string[] = (
      (type === "movie" ? d.keywords?.keywords : d.keywords?.results) ?? []
    )
      .map((k: any) => k.name)
      .slice(0, MAX_KEYWORDS);
    const director =
      type === "movie"
        ? d.credits?.crew?.find((c: any) => c.job === "Director")?.name
        : d.created_by?.[0]?.name;
    const cast: string[] = (d.credits?.cast ?? [])
      .slice(0, MAX_CAST)
      .map((c: any) => c.name);

    return {
      id: `${type}-${id}`,
      type,
      tmdbId: id,
      title: { en: titleEn, ar: ar?.title || ar?.name || titleEn },
      // Arabic overviews are omitted: the UI is English-only right now and
      // they cost ~30% of the payload every visitor downloads. Arabic
      // titles stay (cheap, and useful for search).
      overview: { en: clip(d.overview ?? "", MAX_OVERVIEW), ar: "" },
      year,
      genres,
      keywords,
      people: { director, cast },
      originalLanguage: d.original_language ?? "en",
      rating: Math.round((d.vote_average ?? 0) * 10) / 10,
      voteCount: d.vote_count ?? 0,
      popularity: Math.round((d.popularity ?? 0) * 10) / 10,
      posterPath: d.poster_path ?? null,
    };
  } catch {
    return null;
  }
}

/** run n workers over the job list so fetching stays near the rate limit */
async function pool<T, R>(
  items: T[],
  workers: number,
  fn: (item: T, i: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

/**
 * Mark a diverse, widely-seen subset as the cold-start calibration deck.
 * Ranked by vote count, not TMDB "popularity": popularity is a trending
 * metric that spikes for titles released weeks ago, and asking a new user
 * about films nobody has had time to watch teaches the engine nothing.
 * Titles also need a year of circulation for the same reason.
 */
function markOnboarding(titles: Title[]) {
  const cutoff = new Date().getFullYear() - 1;
  const eligible = titles.filter(
    (t) =>
      t.year <= cutoff && !t.genres.some((g) => NON_CALIBRATION_GENRES.has(g))
  );
  const byGenre = new Map<string, Title[]>();
  for (const t of eligible.sort((a, b) => b.voteCount - a.voteCount)) {
    const g = t.genres[0] ?? "other";
    if (!byGenre.has(g)) byGenre.set(g, []);
    byGenre.get(g)!.push(t);
  }
  // round-robin across genres so the intro deck spans taste space
  const picked: Title[] = [];
  const lists = [...byGenre.values()];
  for (let round = 0; picked.length < ONBOARDING_COUNT; round++) {
    let added = false;
    for (const list of lists) {
      if (list[round]) {
        picked.push(list[round]);
        added = true;
        if (picked.length >= ONBOARDING_COUNT) break;
      }
    }
    if (!added) break;
  }
  const ids = new Set(picked.map((p) => p.id));
  for (const t of titles) if (ids.has(t.id)) t.onboarding = true;
}

async function main() {
  const started = Date.now();
  // over-fetch ~18% because low-vote and adult titles get filtered out
  const movieWant = Math.round(TARGET * 0.62 * 1.18);
  const tvWant = Math.round(TARGET * 0.38 * 1.18);
  console.log(`Collecting ids (target ${TARGET}: ${movieWant} movie / ${tvWant} tv)…`);
  const movieIds = await collectIds("movie", movieWant);
  const tvIds = await collectIds("tv", tvWant);
  console.log(`Ids: ${movieIds.length} movies, ${tvIds.length} tv. Fetching details…`);

  const jobs: [TitleType, number][] = [
    ...movieIds.map((id) => ["movie", id] as [TitleType, number]),
    ...tvIds.map((id) => ["tv", id] as [TitleType, number]),
  ];

  let done = 0;
  const results = await pool(jobs, 8, async ([type, id]) => {
    const t = await fetchTitle(type, id);
    if (++done % 250 === 0) {
      const rate = done / ((Date.now() - started) / 1000);
      const left = Math.round((jobs.length - done) / rate / 60);
      console.log(`  ${done}/${jobs.length} — ${rate.toFixed(1)}/s, ~${left} min left`);
    }
    return t;
  });

  const titles = results.filter((t): t is Title => t !== null);
  titles.sort((a, b) => b.popularity - a.popularity);
  markOnboarding(titles);

  mkdirSync(dirname(OUT), { recursive: true });
  const json = JSON.stringify(encodeCatalog(titles));
  writeFileSync(OUT, json);

  const movies = titles.filter((t) => t.type === "movie").length;
  console.log(
    `\n✅ ${titles.length} titles (${movies} movies, ${titles.length - movies} tv)` +
      `\n   ${(json.length / 1024 / 1024).toFixed(2)} MB → ${OUT}` +
      `\n   ${Math.round((Date.now() - started) / 60000)} min elapsed`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
