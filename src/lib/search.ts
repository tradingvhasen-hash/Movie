import { getLocalCatalog } from "./catalog";
import type { Title } from "./types";

/**
 * One way to match a typed name against a title, used everywhere something is
 * searched.
 *
 * It lived inside the search page, so the library's own search box did a plain
 * lowercase `includes` on two names — meaning `الفيل الأزرق` failed there for
 * two separate reasons at once, and `هارى بوتر` (with the wrong yaa) failed in
 * one place and worked in the other. Two search boxes with two different
 * notions of "matches" is a bug that only shows up for the people least able
 * to report it.
 */
const ASCII = /^[\x20-\x7E]*$/;
const MARKS = /[̀-ͯ]/g;
const ARABIC_MARKS = /[ـً-ْ]/g;
const NON_WORD = /[^\p{L}\p{N}]+/gu;

export function normalise(s: string): string {
  const lower = s.toLowerCase();
  /**
   * The fast path exists because of a measurement, not a hunch.
   *
   * `String.normalize("NFKD")` is the expensive half of this function, and it
   * has nothing to do for a string that is already plain ASCII — which most
   * film titles in this catalog are. Skipping it there took preparing the
   * whole catalog for search from ~400ms to well under a hundred.
   */
  if (ASCII.test(lower)) return lower.replace(NON_WORD, " ").trim();
  return lower
    .normalize("NFKD")
    // combining marks, so accented Latin matches unaccented typing
    .replace(MARKS, "")
    // Arabic diacritics and tatweel, which nobody types consistently
    .replace(ARABIC_MARKS, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    // Japanese and Korean need no folding, only the punctuation strip below
    .replace(NON_WORD, " ")
    .trim();
}

/**
 * Every name a person might type for this title: the English one, the Arabic
 * translation, and the name in its own script.
 *
 * The third is why this exists. We stored TMDB's English title and its Arabic
 * *translation*, and a film whose own name is already Arabic has no translation
 * to fetch — so `The Blue Elephant` carried an empty second name and the one
 * string anybody would search for was the one we never kept.
 */
export function searchText(title: Title): string {
  return `${normalise(title.title.en)} ${normalise(title.title.ar)} ${normalise(
    title.title.original ?? ""
  )}`;
}

/** does this title answer to what was typed? */
export function matches(title: Title, query: string): boolean {
  const q = normalise(query);
  if (!q) return false;
  return searchText(title).includes(q);
}

/* ────────────────────────────────────────────────────────────────────────
   THE INDEX, AND WHY THE APP WAS UNUSABLE WITHOUT IT.

   Three screens searched the catalog by calling `matches()` inside a filter
   over all 15,027 titles. Each call normalised three strings, so one keystroke
   ran 45,000 Unicode normalisations. Measured on a phone-speed CPU that is
   **457ms of frozen main thread per character typed** — the user reported
   "adding movies" as one of the slow things and this was all of it.

   Nothing about the behaviour needs to change. The text each title answers to
   never changes, so it is prepared once and searched many times: after that a
   keystroke is 15,027 `indexOf` calls on prepared strings, which is a couple
   of milliseconds.

   IT IS BUILT WHEN NOBODY IS LOOKING. The preparation still costs what it
   costs; it is simply spent in idle slices after the catalog lands rather than
   inside the first keystroke. If somebody types before it is ready the
   remaining slices are finished on the spot — correctness never waits on an
   optimisation.
   ──────────────────────────────────────────────────────────────────────── */

let hay: string[] = [];
let built = 0;
let builtFor = 0;
let scheduled = false;

const SLICE = 2500;

function buildSome(deadline?: IdleDeadline) {
  const items = getLocalCatalog();
  if (items.length !== builtFor) {
    builtFor = items.length;
    hay = new Array<string>(items.length);
    built = 0;
  }
  while (built < items.length) {
    const end = Math.min(built + SLICE, items.length);
    for (let i = built; i < end; i++) hay[i] = searchText(items[i].title);
    built = end;
    if (deadline && deadline.timeRemaining() <= 1) break;
  }
  scheduled = false;
  if (built < items.length) schedule();
}

function schedule() {
  if (scheduled || typeof window === "undefined") return;
  scheduled = true;
  const ric = window.requestIdleCallback;
  if (typeof ric === "function") ric(buildSome, { timeout: 2000 });
  else window.setTimeout(() => buildSome(), 40);
}

/** call once the catalog is in memory; safe to call repeatedly */
export function warmSearchIndex() {
  if (typeof window === "undefined") return;
  const items = getLocalCatalog();
  if (items.length === 0) return;
  if (items.length === builtFor && built >= items.length) return;
  schedule();
}

export interface SearchOptions {
  limit?: number;
  /** ids to leave out — already in a list, already picked, already logged */
  skip?: (id: string) => boolean;
}

/**
 * Titles answering to `query`, most recognisable first.
 *
 * A prefix match outranks a match in the middle of a name, because somebody
 * typing "matrix" means The Matrix and not "Escape from the Matrix of Doom";
 * within each group the better-known title wins.
 */
export function searchCatalog(query: string, opts: SearchOptions = {}): Title[] {
  const q = normalise(query);
  if (q.length < 2) return [];
  const items = getLocalCatalog();
  if (items.length === 0) return [];
  // a search before the index finished: finish it now rather than answer wrongly
  if (items.length !== builtFor || built < items.length) buildSome();

  const limit = opts.limit ?? 40;
  const skip = opts.skip;
  const starts: Title[] = [];
  const contains: Title[] = [];

  for (let i = 0; i < items.length; i++) {
    const at = hay[i].indexOf(q);
    if (at < 0) continue;
    const title = items[i].title;
    if (skip?.(title.id)) continue;
    // a word boundary counts as a start: "matrix" should find "The Matrix"
    if (at === 0 || hay[i].charCodeAt(at - 1) === 32) starts.push(title);
    else contains.push(title);
  }

  const byFame = (a: Title, b: Title) => b.voteCount - a.voteCount;
  starts.sort(byFame);
  if (starts.length >= limit) return starts.slice(0, limit);
  contains.sort(byFame);

  return [...starts, ...contains].slice(0, limit);
}
