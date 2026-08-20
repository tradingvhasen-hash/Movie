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
export function normalise(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      // combining marks, so accented Latin matches unaccented typing
      .replace(/[̀-ͯ]/g, "")
      // Arabic diacritics and tatweel, which nobody types consistently
      .replace(/[ـً-ْ]/g, "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      // Japanese and Korean need no folding, only the punctuation strip below
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
  );
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
