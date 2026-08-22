/**
 * BRING A LIBRARY IN FROM SOMEWHERE ELSE, INSTEAD OF ASKING FOR IT.
 *
 * The product's goal is that a person gets every film they have watched into
 * the site. The deck asks one question at a time, and measured on 60 real
 * histories it needs about 22 minutes to recover 411 of 533 films — and the
 * rate falls the whole way, from 71 titles per hundred cards to 12.
 *
 * No successful product in this category solves it that way. Letterboxd, Trakt,
 * TV Time and Bingebase all solve it with an import, and Trakt's own
 * announcement of its IMDb/Letterboxd importer gives the reason in one line:
 * to streamline onboarding for new users. That is our collapse, described by
 * somebody else, with a different answer.
 *
 * So this reads the file formats those services already export. A person who
 * has watched 755 films can be done in one second instead of six thousand
 * cards, and the deck goes back to being what it is actually good at —
 * collecting opinions on titles the site already knows they saw.
 *
 * FORMATS. Letterboxd exports `Name,Year,Rating` (plus `Letterboxd URI`), its
 * diary adds `Watched Date`, IMDb exports `Title,Year,Your Rating,Const` where
 * Const is an imdb id, and Trakt/TV Time exports go through the same shape.
 * Rather than special-casing each, the header is matched loosely: any column
 * that means "title", "year", "rating" or an id is found by name, so a format
 * with different capitalisation or extra columns still works.
 */
import type { SwipeAction, Title } from "@/lib/types";

export type ImportRow = {
  name: string;
  year?: number;
  /** 0–10 on our scale, whatever the source used */
  rating?: number;
  tmdbId?: number;
  imdbId?: string;
};

export type MatchResult = {
  rows: ImportRow[];
  matched: { title: Title; action: SwipeAction; row: ImportRow }[];
  unmatched: ImportRow[];
};

/**
 * A CSV parser that handles quotes, because film titles contain commas.
 *
 * "Dr. Strangelove or: How I Learned to Stop Worrying, and Love the Bomb" is a
 * real row in a real export, and splitting on commas turns it into two films
 * that do not exist. Doubled quotes inside a quoted field ("" for a literal
 * quote) are part of the format and appear in titles like "Hearts of Darkness:
 * A Filmmaker's Apocalypse".
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  // a BOM at the head of a UTF-8 export would otherwise become part of the
  // first header name and stop every column from being recognised
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/** find a column by any of several names, case- and space-insensitive */
function columnIndex(header: string[], names: string[]): number {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/[\s_]+/g, ""));
  for (const name of names) {
    const i = norm.indexOf(name);
    if (i !== -1) return i;
  }
  return -1;
}

export function readExport(text: string): ImportRow[] {
  const table = parseCsv(text);
  if (table.length < 2) return [];
  const header = table[0];
  const iName = columnIndex(header, ["name", "title", "originaltitle", "film"]);
  const iYear = columnIndex(header, ["year", "releaseyear", "yearreleased"]);
  const iRating = columnIndex(header, ["rating", "yourrating", "rating10", "score"]);
  const iTmdb = columnIndex(header, ["tmdbid", "tmdb", "themoviedbid"]);
  const iImdb = columnIndex(header, ["imdbid", "const", "imdb"]);
  if (iName === -1 && iTmdb === -1 && iImdb === -1) return [];

  /**
   * Letterboxd rates out of five, IMDb out of ten. Guessing per row is wrong —
   * a Letterboxd library where nobody went above 2.5 would be read as a wall of
   * hatred — so the scale is decided once, from the largest rating in the file.
   */
  const raw: (number | undefined)[] = [];
  const out: ImportRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const name = iName === -1 ? "" : (cells[iName] ?? "").trim();
    const yearRaw = iYear === -1 ? "" : (cells[iYear] ?? "").trim();
    const ratingRaw = iRating === -1 ? "" : (cells[iRating] ?? "").trim();
    const tmdbRaw = iTmdb === -1 ? "" : (cells[iTmdb] ?? "").trim();
    const imdbRaw = iImdb === -1 ? "" : (cells[iImdb] ?? "").trim();
    const year = /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : undefined;
    const rating = ratingRaw !== "" && !Number.isNaN(Number(ratingRaw)) ? Number(ratingRaw) : undefined;
    if (!name && !tmdbRaw && !imdbRaw) continue;
    raw.push(rating);
    out.push({
      name,
      year,
      rating,
      tmdbId: /^\d+$/.test(tmdbRaw) ? Number(tmdbRaw) : undefined,
      imdbId: /^tt\d+$/.test(imdbRaw) ? imdbRaw : undefined,
    });
  }
  const max = raw.reduce<number>((m, v) => (v !== undefined && v > m ? v : m), 0);
  const scale = max > 0 && max <= 5 ? 2 : 1;
  if (scale !== 1) for (const row of out) if (row.rating !== undefined) row.rating *= scale;
  return out;
}

/**
 * Title matching, and why it is not just a string compare.
 *
 * An export names a film the way its own service does. Punctuation differs
 * ("WALL·E" / "WALL-E"), articles move ("The Thing" / "Thing, The"), accents
 * survive in one export and not another, and re-releases disagree about the
 * year by one. So the key is the title stripped to letters and digits, and the
 * year is allowed to be a year out — a strict year match loses real films and a
 * missing year match confuses remakes, which is why an exact hit is preferred
 * and the loose one is only a fallback.
 */
function normalise(s: string): string {
  const flat = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  return (
    flat
      // "Thing, The" is how several services store "The Thing", and dropping
      // only the leading article matched 78% of a library where this form
      // appears — measured, not assumed. Both ends have to go.
      .replace(/,\s*(the|a|an)$/, "")
      .replace(/^(the|a|an)\s+/, "")
      .replace(/[^a-z0-9]+/g, "")
  );
}

export function buildIndex(catalog: Title[]) {
  const byTmdb = new Map<string, Title>();
  const byNameYear = new Map<string, Title>();
  const byName = new Map<string, Title[]>();
  for (const t of catalog) {
    if (t.tmdbId !== undefined) byTmdb.set(`${t.type}-${t.tmdbId}`, t);
    for (const raw of [t.title.en, t.title.original, t.title.ar]) {
      if (!raw) continue;
      const key = normalise(raw);
      if (!key) continue;
      const exact = `${key}|${t.year}`;
      // the most-voted title wins a collision: two films share a name and the
      // one a person is importing is overwhelmingly the famous one
      const prev = byNameYear.get(exact);
      if (!prev || prev.voteCount < t.voteCount) byNameYear.set(exact, t);
      const list = byName.get(key);
      if (list) list.push(t);
      else byName.set(key, [t]);
    }
  }
  for (const list of byName.values()) list.sort((a, b) => b.voteCount - a.voteCount);
  return { byTmdb, byNameYear, byName };
}

export function matchRow(
  row: ImportRow,
  index: ReturnType<typeof buildIndex>
): Title | null {
  if (row.tmdbId !== undefined) {
    const hit = index.byTmdb.get(`movie-${row.tmdbId}`) ?? index.byTmdb.get(`tv-${row.tmdbId}`);
    if (hit) return hit;
  }
  const key = normalise(row.name);
  if (!key) return null;
  if (row.year !== undefined) {
    for (const y of [row.year, row.year - 1, row.year + 1]) {
      const hit = index.byNameYear.get(`${key}|${y}`);
      if (hit) return hit;
    }
  }
  const list = index.byName.get(key);
  if (!list?.length) return null;
  /**
   * With no usable year, only an unambiguous name is trusted. "Dune" names a
   * 1984 film and a 2021 one, and importing the wrong one is worse than
   * importing neither — it puts a film in the library the person never saw and
   * teaches the engine from it.
   */
  if (row.year === undefined && list.length > 1) return null;
  return list[0];
}

/**
 * A rating becomes one of the four answers.
 *
 * The thresholds are the ones `harvest.ts` uses for MovieLens, so the import
 * and the ruler agree about what a 3-out-of-5 means. An unrated row is `seen`
 * rather than `liked`: the person watched it and said nothing, which is
 * exactly what that answer is for, and guessing enthusiasm from silence would
 * poison the taste model with hundreds of invented likes.
 */
export function actionFor(rating: number | undefined): SwipeAction {
  if (rating === undefined) return "seen";
  if (rating >= 8) return "liked";
  if (rating >= 6) return "seen";
  return "disliked";
}

export function matchAll(rows: ImportRow[], catalog: Title[]): MatchResult {
  const index = buildIndex(catalog);
  const matched: MatchResult["matched"] = [];
  const unmatched: ImportRow[] = [];
  const taken = new Set<string>();
  for (const row of rows) {
    const title = matchRow(row, index);
    if (!title || taken.has(title.id)) {
      if (!title) unmatched.push(row);
      continue;
    }
    taken.add(title.id);
    matched.push({ title, action: actionFor(row.rating), row });
  }
  return { rows, matched, unmatched };
}
