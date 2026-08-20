/**
 * One title, fetched and trimmed — the single definition of what a catalog
 * entry is.
 *
 * Extracted from `build-catalog.ts` so that a targeted extension of the
 * catalog and a full rebuild cannot drift in what they produce. Every floor,
 * exclusion and field limit lives here and nowhere else.
 */
import type { Title, TitleType } from "../../src/lib/types";

const API_KEY = process.env.TMDB_API_KEY;
if (!API_KEY) throw new Error("Missing TMDB_API_KEY");

const LANG_FLOORS: Record<string, number> = {
  en: 500,
  ja: 300,
  ko: 200,
  es: 200,
  fr: 200,
  it: 150,
  de: 150,
  zh: 150,
  pt: 100,
  ru: 100,
  hi: 50,
  tr: 40,
  th: 40,
  sv: 40,
  da: 40,
  no: 40,
  nl: 40,
  pl: 40,
  id: 30,
  fa: 25,
  ar: 20,
  ta: 20,
  te: 20,
  ml: 20,
  kn: 20,
  ur: 20,
  he: 20,
};
/** how many titles to take per non-English language, best-known first */
const PER_LANG = Number(process.env.PER_LANG ?? 400);
/** languages with no entry above are still allowed in, just not sought out */
const DEFAULT_FLOOR = 150;
const TODAY = new Date().toISOString().slice(0, 10);

/**
 * Not narrative works.
 *
 * `talk` and `news` used to be here, on the reasoning that a chat show is not
 * a story and would pollute the taste vectors. That reasoning was about
 * *recommending*, and the product's actual goal is for a person to get
 * everything they have ever watched into the site. The user named four titles
 * he loves and could never find: Key & Peele, The Daily Show, The Tonight
 * Show, Old Dads. Three were excluded by this line or the floor above, and a
 * whole way of watching — late-night, sketch, stand-up — was missing because
 * of a definition of "narrative" nobody asked for.
 *
 * `reality` and `soap` stay out: hundreds of near-identical episodes-as-series
 * that would swamp the deck without telling us anything.
 */
const EXCLUDED_GENRES = new Set(["reality", "soap"]);
/** valid catalog entries, but poor signals for cold-start calibration */
const NON_CALIBRATION_GENRES = new Set(["documentary"]);
const MAX_OVERVIEW = Number(process.env.MAX_OVERVIEW ?? 200);
const MAX_KEYWORDS = 10;
const MAX_CAST = 4;
/** co-watch neighbours kept per title (TMDB returns 20 on page 1) */
const MAX_RELATED = 20;
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

/**
 * Collect ids, most-rated first. Ordering the whole corpus by vote count
 * (rather than slicing per year) is what keeps the catalog to titles people
 * have actually heard of — the old year slices were what dragged in the
 * obscure regional tail.
 */

function clip(text: string, max: number): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max).replace(/\s+\S*$/, "") + "…";
}


export async function fetchOne(type: TitleType, id: number): Promise<Title | null> {
  try {
    // "recommendations" rides along on the same request — TMDB's co-watch
    // lists cost us no extra calls and no extra build time this way
    const d = await tmdb(`/${type}/${id}`, {
      append_to_response: "keywords,credits,translations,recommendations",
    });
    const titleEn: string = type === "movie" ? d.title : d.name;
    const released: string | undefined =
      type === "movie" ? d.release_date : d.first_air_date;
    const year = Number(released?.slice(0, 4));
    const lang: string = d.original_language ?? "en";
    const floor =
      type === "tv"
        ? Math.round((LANG_FLOORS[lang] ?? DEFAULT_FLOOR) * 0.4)
        : LANG_FLOORS[lang] ?? DEFAULT_FLOOR;
    if (!titleEn || !year || (d.vote_count ?? 0) < floor) return null;
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

    /**
     * What people who watched this actually went on to watch, in TMDB's own
     * relevance order. This is the one signal our metadata cannot produce:
     * it connects titles that share no keyword, genre or crew but land with
     * the same audience. Kept in order — position carries meaning — and
     * filtered down to our own catalog once every title is known.
     */
    const related: string[] = (d.recommendations?.results ?? [])
      .slice(0, MAX_RELATED)
      .map((r: any) => `${r.media_type === "tv" ? "tv" : type}-${r.id}`);

    return {
      id: `${type}-${id}`,
      type,
      tmdbId: id,
      title: {
        en: titleEn,
        ar: ar?.title || ar?.name || titleEn,
        // the name in its own script, so search can find الفيل الأزرق and
        // ワンピース. See catalog-codec's note on position 17.
        original: String(d.original_title ?? d.original_name ?? ""),
      },
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
      related,
    };
  } catch {
    return null;
  }
}

/** run n workers over the job list so fetching stays near the rate limit */

export { LANG_FLOORS, GENRES, EXCLUDED_GENRES, NON_CALIBRATION_GENRES, TODAY, DEFAULT_FLOOR, PER_LANG, tmdb, clip };
