import type { Title, TitleType } from "../types";

/**
 * Compact wire format for the bundled catalog. Every visitor downloads
 * this file, so titles are stored as positional tuples instead of objects:
 * repeating ~18 JSON key names per title costs more than the data itself.
 * Genres and languages are interned into shared lookup tables.
 */
export interface EncodedCatalog {
  /** format version, so a stale cached file can be detected */
  v: 1 | 2;
  /** interned genre slugs */
  g: string[];
  /** interned language codes */
  l: string[];
  /** [tmdbId, isTv, titleEn, titleAr, overviewEn, year, genreIdx[],
   *   keywords[], director, cast[], langIdx, rating, votes, popularity,
   *   posterPath, onboarding, relatedIdx[], originalTitle] */
  t: EncodedTitle[];
}

type EncodedTitle = [
  number, // tmdbId
  0 | 1, // isTv
  string, // title en
  string, // title ar ("" = same as en)
  string, // overview en
  number, // year
  number[], // genre indexes
  string[], // keywords
  string, // director ("" = unknown)
  string[], // cast
  number, // language index
  number, // rating
  number, // vote count
  number, // popularity
  string, // poster path ("" = none)
  0 | 1, // onboarding
  /**
   * Co-watch neighbours, as positions in this same `t` array rather than
   * ids. A title id like "movie-27205" costs ~14 bytes; its index costs 3-4.
   * Across ~5,500 titles × up to 20 links that is the difference between
   * ~1.4 MB and ~350 KB on a file every visitor downloads.
   */
  number[]?,
  /**
   * The name the work carries in its own script — TMDB's `original_title`.
   *
   * A third name, appended rather than inserted, so a catalog written before
   * this still decodes: every reader indexes by position, and position 17 is
   * simply absent on the old file.
   *
   * It exists because search was failing in a way that looked like a search
   * bug and was a data one. We stored the English title and TMDB's *Arabic
   * translation* — and a film whose own name is already Arabic has no Arabic
   * translation to fetch, so `The Blue Elephant` carried an empty second name
   * and `الفيل الأزرق` matched nothing. 6,615 titles gained a name here.
   */
  string?,
];

export function encodeCatalog(titles: Title[]): EncodedCatalog {
  const genres: string[] = [];
  const langs: string[] = [];
  const intern = (pool: string[], value: string) => {
    let i = pool.indexOf(value);
    if (i === -1) i = pool.push(value) - 1;
    return i;
  };

  const indexOfId = new Map(titles.map((title, i) => [title.id, i]));

  const t = titles.map<EncodedTitle>((title) => [
    title.tmdbId ?? 0,
    title.type === "tv" ? 1 : 0,
    title.title.en,
    title.title.ar === title.title.en ? "" : title.title.ar,
    title.overview.en,
    title.year,
    title.genres.map((g) => intern(genres, g)),
    title.keywords,
    title.people.director ?? "",
    title.people.cast,
    intern(langs, title.originalLanguage),
    title.rating,
    title.voteCount,
    title.popularity,
    title.posterPath ?? "",
    title.onboarding ? 1 : 0,
    (title.related ?? [])
      .map((id) => indexOfId.get(id))
      .filter((i): i is number => i !== undefined),
    title.title.original && title.title.original !== title.title.en
      ? title.title.original
      : "",
  ]);

  return { v: 2, g: genres, l: langs, t };
}

export function decodeCatalog(data: EncodedCatalog): Title[] {
  const idAt = (i: number): string | undefined => {
    const row = data.t[i];
    return row ? `${row[1] === 1 ? "tv" : "movie"}-${row[0]}` : undefined;
  };

  return data.t.map((row) => {
    const type: TitleType = row[1] === 1 ? "tv" : "movie";
    const en = row[2];
    return {
      id: `${type}-${row[0]}`,
      type,
      tmdbId: row[0],
      title: { en, ar: row[3] || en, original: row[17] || "" },
      overview: { en: row[4], ar: row[4] },
      year: row[5],
      genres: row[6].map((i) => data.g[i]),
      keywords: row[7],
      people: { director: row[8] || undefined, cast: row[9] },
      originalLanguage: data.l[row[10]],
      rating: row[11],
      voteCount: row[12],
      popularity: row[13],
      posterPath: row[14] || null,
      onboarding: row[15] === 1,
      // absent in v1 files
      related: (row[16] ?? [])
        .map(idAt)
        .filter((id): id is string => id !== undefined),
    };
  });
}
