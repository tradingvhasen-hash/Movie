/**
 * ADD A BAND TO THE CATALOG WITHOUT REBUILDING IT.
 *
 *   TMDB_API_KEY=... npx tsx scripts/extend-catalog.ts --lang en --min 500 --max 999
 *
 * A full rebuild refetches every one of 12,826 titles and takes hours. This
 * fetches only what is missing, keeps everything already enriched — including
 * the co-watch edges distilled from MovieLens and Wikipedia, which a rebuild
 * would strand — and writes the merged catalog back.
 *
 * Existing entries are never touched. A title already in the file is skipped
 * before its detail call is made, so re-running this costs only the discover
 * pages.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { decodeCatalog, encodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import type { Title } from "../src/lib/types";
/* the enrichment path is shared with the full rebuild, never copied, so the
   two can not drift in what a catalog entry means */
import { fetchOne } from "./lib/fetch-title";

const KEY = process.env.TMDB_API_KEY;
if (!KEY) {
  console.error("Missing TMDB_API_KEY");
  process.exit(1);
}
const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const LANG = arg("lang", "en");
const MIN = Number(arg("min", "500"));
const MAX = Number(arg("max", "999"));
const OUT = "public/catalog.json";

const existing = decodeCatalog(
  JSON.parse(readFileSync(OUT, "utf8")) as EncodedCatalog
);
const have = new Set(existing.map((t) => t.id));
console.log(`  catalog holds ${existing.length} titles`);

let calls = 0;
async function tmdb(path: string, params: Record<string, string> = {}) {
  const q = new URLSearchParams({ api_key: KEY!, ...params });
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`https://api.themoviedb.org/3${path}?${q}`);
    calls++;
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    if (!res.ok) return null;
    return res.json();
  }
  return null;
}

async function main() {
  const ids: number[] = [];
  for (let page = 1; page <= 500; page++) {
    const d = await tmdb("/discover/movie", {
      with_original_language: LANG,
      "vote_count.gte": String(MIN),
      "vote_count.lte": String(MAX),
      sort_by: "vote_count.desc",
      include_adult: "false",
      page: String(page),
    });
    if (!d?.results?.length) break;
    for (const r of d.results) if (!have.has(`movie-${r.id}`)) ids.push(r.id);
    if (page >= (d.total_pages ?? 1)) break;
    if (page % 25 === 0) console.log(`    discover page ${page}, ${ids.length} new so far`);
  }
  console.log(`  ${ids.length} films in ${LANG} ${MIN}-${MAX} votes that we do not have`);


  const added: Title[] = [];
  const CONCURRENCY = 16;
  let cursor = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < ids.length) {
        const id = ids[cursor++];
        const t = await fetchOne("movie", id);
        if (t) added.push(t);
        if (added.length % 200 === 0 && added.length) {
          console.log(`    enriched ${added.length} / ${ids.length}`);
        }
      }
    })
  );

  const merged = [...existing, ...added];
  writeFileSync(OUT, JSON.stringify(encodeCatalog(merged)));
  console.log(
    `\n  added ${added.length} titles · catalog is now ${merged.length} · ${calls} API calls\n` +
      `  now run: npm run split   (moves summaries off the first-paint payload)`
  );

}

void main();
