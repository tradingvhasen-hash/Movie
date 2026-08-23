import type { Title, TitleType } from "../types";

/**
 * THE DEEP CATALOG, AT A SIXTEENTH OF THE WEIGHT.
 *
 * 51,922 titles cannot be shipped to a phone as ranking data. Measured on the
 * real build: the deep 40,922 cost 8.85 MB gzipped, and stripping every
 * expensive field — keywords, cast, director, co-watch links — only brings
 * that to 6.77 MB. The weight is in the NUMBER OF ROWS, not what each row
 * carries, so no amount of trimming rescues that approach.
 *
 * What rescues it is asking a smaller question. Ranking a title needs its
 * keywords, its cast, its co-watch neighbours. FINDING a title needs its name,
 * its year, whether it is a film or a series, and a poster to recognise it by.
 * That subset costs 0.54 MB gzipped for all 40,922 — sixteen times less.
 *
 * So the deep catalog ships as this: an index you can search, not a pool the
 * deck ranks from. Every title a person has ever watched is findable and can
 * be logged; the deck recommends from the 11,000 best-known, which is also
 * where the harvest measurement says recommendations should come from — a
 * ranking pool diluted with 37,000 obscure titles measured WORSE, 321.6
 * harvested falling to 196.9.
 *
 * Genres ride along because they are interned indexes, cost almost nothing,
 * and mean a title logged from search still teaches the taste model something
 * rather than nothing.
 *
 * COLUMNAR, NOT ROW-WISE. Six arrays of 40,922 primitives gzip far better than
 * 40,922 arrays of six, because each column is homogeneous — years compress
 * against years, poster paths against poster paths.
 */
export interface SearchIndex {
  /** format version, so a stale cached file can be detected */
  v: 1;
  /** interned genre slugs */
  g: string[];
  /** TMDB ids */
  i: number[];
  /** English titles */
  n: string[];
  /** Arabic titles, "" where identical to the English one */
  a: string[];
  /** release years */
  y: number[];
  /** 1 = series, 0 = film */
  k: (0 | 1)[];
  /** poster paths, "" = none */
  p: string[];
  /** genre indexes into `g`, joined by "," to keep the column flat */
  q: string[];
  /**
   * The name in its own script, "" when absent or same as English.
   *
   * Carried because `search.ts` searches it and the product is Arabic-first:
   * without it "الفيل الأزرق" finds nothing, which is the exact failure the
   * deep catalog was added to fix.
   */
  o: string[];
}

/** A title known well enough to find and log, but not to rank. */
export type IndexedTitle = Pick<
  Title,
  "id" | "tmdbId" | "type" | "title" | "year" | "genres" | "posterPath"
>;

export function encodeSearchIndex(titles: Title[]): SearchIndex {
  const genres: string[] = [];
  const gi = new Map<string, number>();
  const intern = (slug: string): number => {
    let at = gi.get(slug);
    if (at === undefined) {
      at = genres.length;
      genres.push(slug);
      gi.set(slug, at);
    }
    return at;
  };

  const out: SearchIndex = {
    v: 1,
    g: genres,
    i: [],
    n: [],
    a: [],
    y: [],
    k: [],
    p: [],
    q: [],
    o: [],
  };
  for (const t of titles) {
    out.i.push(t.tmdbId ?? 0);
    out.n.push(t.title.en);
    out.a.push(t.title.ar && t.title.ar !== t.title.en ? t.title.ar : "");
    out.y.push(t.year);
    out.k.push(t.type === "tv" ? 1 : 0);
    out.p.push(t.posterPath ?? "");
    out.q.push(t.genres.map((s) => intern(s)).join(","));
    out.o.push(t.title.original && t.title.original !== t.title.en ? t.title.original : "");
  }
  return out;
}

export function decodeSearchIndex(x: SearchIndex): IndexedTitle[] {
  const out: IndexedTitle[] = new Array(x.i.length);
  for (let j = 0; j < x.i.length; j++) {
    const type: TitleType = x.k[j] === 1 ? "tv" : "movie";
    const en = x.n[j];
    out[j] = {
      id: `${type}-${x.i[j]}`,
      tmdbId: x.i[j],
      type,
      title: { en, ar: x.a[j] || en, original: x.o?.[j] || undefined },
      year: x.y[j],
      genres: x.q[j] ? x.q[j].split(",").map((n) => x.g[Number(n)]) : [],
      posterPath: x.p[j] || undefined,
    };
  }
  return out;
}
