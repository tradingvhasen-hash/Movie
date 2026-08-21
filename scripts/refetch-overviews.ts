/**
 * SYNOPSES THAT END WHERE A SENTENCE ENDS.
 *
 *   TMDB_API_KEY=… npx tsx scripts/refetch-overviews.ts
 *
 * The catalog build clips every summary at 200 characters and appends an
 * ellipsis, which was invisible while the summary lived in a small panel over
 * the bottom of a poster. The card back gives it a whole surface, and there it
 * is unmissable: "…the national war on drugs has become a permanent,…" reads
 * as a broken string rather than as a teaser.
 *
 * WHY NOT JUST FETCH THE WHOLE THING. Because it is a real download. Measured
 * on this catalog, a full TMDB overview averages ~460 characters; keeping all
 * of them takes `overviews.json` from 1.1 MB gzipped to roughly 2.6 MB, on a
 * file every phone fetches in the background of the first session. Nobody
 * reads 460 characters to decide whether they have seen a film.
 *
 * SO: clip to the last complete sentence that fits in 300 characters, and only
 * fall back to a hard cut when a summary is one long sentence. Most summaries
 * come in under the limit and are kept whole; the rest end on a full stop,
 * which reads as an editor's choice instead of a bug.
 *
 * Safe to run against a built catalog: it touches `overviews.json` only, never
 * the catalog itself, so ids, ordering, the co-watch graph and every derived
 * table are untouched.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const KEY = process.env.TMDB_API_KEY;
if (!KEY) {
  console.error("TMDB_API_KEY is required (build-time only — never committed)");
  process.exit(1);
}

const OVERVIEWS = "public/overviews.json";
/** the budget a summary has before it has to stop at a sentence */
const LIMIT = Number(process.env.MAX_OVERVIEW ?? 300);
const CONCURRENCY = 16;

/**
 * Prefer a full stop, then any sentence-ending punctuation, then a word break.
 * The ellipsis is only ever appended to the last case, because that is the
 * only case where something was actually cut off mid-thought.
 */
function clip(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length <= LIMIT) return text;

  const window = text.slice(0, LIMIT + 1);
  const stop = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? ")
  );
  // a sentence has to be worth keeping — a 40-character first line is not a
  // summary, so below that the hard cut is the better answer
  if (stop > LIMIT * 0.45) return text.slice(0, stop + 1);

  return text.slice(0, LIMIT).replace(/\s+\S*$/, "") + "…";
}

type Row = [string, string];

async function fetchOne(id: string): Promise<string | null> {
  const [kind, tmdbId] = id.split("-");
  const path = kind === "tv" ? "tv" : "movie";
  const url = `https://api.themoviedb.org/3/${path}/${tmdbId}?api_key=${KEY}&language=en-US`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        continue;
      }
      if (!res.ok) return null;
      const body = (await res.json()) as { overview?: string };
      return body.overview ?? "";
    } catch {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return null;
}

async function main() {
  const existing = JSON.parse(readFileSync(OVERVIEWS, "utf8")) as Record<string, Row>;
  const ids = Object.keys(existing);
  console.log(`${ids.length} summaries · limit ${LIMIT} · concurrency ${CONCURRENCY}`);

  const out: Record<string, Row> = {};
  let done = 0;
  let grew = 0;
  let failed = 0;

  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= ids.length) return;
      const id = ids[i];
      const full = await fetchOne(id);
      const before = existing[id][0];
      if (full === null) {
        failed++;
        out[id] = existing[id];
      } else {
        const clipped = clip(full);
        if (clipped.length > before.length) grew++;
        out[id] = [clipped, existing[id][1]];
      }
      if (++done % 1500 === 0) {
        console.log(`  ${done}/${ids.length} · ${grew} longer · ${failed} unreachable`);
      }
    }
  });
  await Promise.all(workers);

  const gzBefore = gzipSync(readFileSync(OVERVIEWS), { level: 9 }).length;
  writeFileSync(OVERVIEWS, JSON.stringify(out));
  const gzAfter = gzipSync(readFileSync(OVERVIEWS), { level: 9 }).length;

  const ends = Object.values(out).filter((r) => r[0].endsWith("…")).length;
  console.log(
    `\n  ${done} summaries · ${grew} longer than before · ${failed} unreachable\n` +
      `  ${ends} still end in an ellipsis (${((ends / done) * 100).toFixed(1)}%)\n` +
      `  overviews.json  ${(gzBefore / 1048576).toFixed(2)} → ${(gzAfter / 1048576).toFixed(2)} MB gzipped\n`
  );
}

void main();
