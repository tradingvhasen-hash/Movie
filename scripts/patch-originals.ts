/**
 * PUT THE NATIVE-SCRIPT NAMES BACK, IN BOTH SHIPPED FILES.
 *
 *   TMDB_API_KEY=... npx tsx scripts/patch-originals.ts
 *
 * `add-original-titles.ts` fixed a real bug — searching الفيل الأزرق found
 * nothing while "The Blue Elephant" found it — by patching `public/catalog.json`
 * after the fact. Because it is a separate pass, a rebuild silently drops the
 * field again, and the 51,922-title rebuild did exactly that: 0 of 51,922
 * titles had a native-script name afterwards.
 *
 * `build-catalog.ts` now captures `original_title` inline, so future builds
 * keep it for free. This repairs the files that already shipped without one,
 * and unlike its predecessor it knows about both of them:
 *
 *     public/catalog.json         tuple column 17
 *     public/catalog-index.json   column `o`
 *
 * Only non-English titles are looked up — an English film's original name is
 * its English name — which is ~22,000 requests rather than 51,922.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { SearchIndex } from "../src/lib/data/search-index";

const KEY = process.env.TMDB_API_KEY;
if (!KEY) {
  console.error("Missing TMDB_API_KEY");
  process.exit(1);
}

const CONCURRENCY = 24;
type Row = (string | number | number[] | string[])[];

const cat = JSON.parse(readFileSync("public/catalog.json", "utf8")) as {
  v: number;
  g: string[];
  l: string[];
  t: Row[];
};
const idx = JSON.parse(readFileSync("public/catalog-index.json", "utf8")) as SearchIndex;

/** the index has no language column, so take it from the source it was cut from */
const tailLangs: number[] = JSON.parse(
  readFileSync(".cache/build/tail-source.json", "utf8")
).t.map((r: Row) => r[10] as number);
const tailLangTable: string[] = JSON.parse(
  readFileSync(".cache/build/tail-source.json", "utf8")
).l;

type Job = { kind: string; id: number; apply: (original: string) => void; english: string };
const todo: Job[] = [];

for (const row of cat.t) {
  if (cat.l[row[10] as number] === "en") continue;
  todo.push({
    kind: row[1] === 1 ? "tv" : "movie",
    id: row[0] as number,
    english: String(row[2] ?? ""),
    apply: (o) => {
      row[17] = o;
    },
  });
}
for (let j = 0; j < idx.i.length; j++) {
  if (tailLangTable[tailLangs[j]] === "en") continue;
  todo.push({
    kind: idx.k[j] === 1 ? "tv" : "movie",
    id: idx.i[j],
    english: idx.n[j],
    apply: (o) => {
      idx.o[j] = o;
    },
  });
}

console.log(`  ${todo.length} non-English titles to look up\n`);

let done = 0;
let found = 0;

async function one(job: Job) {
  const url = `https://api.themoviedb.org/3/${job.kind}/${job.id}?api_key=${KEY}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        continue;
      }
      if (!res.ok) return;
      const d = (await res.json()) as Record<string, unknown>;
      const original = String(d.original_title ?? d.original_name ?? "").trim();
      if (!original || original === job.english) return;
      job.apply(original);
      found++;
    } catch {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      continue;
    }
    return;
  }
}

async function main() {
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const job = queue.pop();
        if (!job) return;
        await one(job);
        if (++done % 1000 === 0) {
          console.log(`  ${done}/${todo.length} · ${found} native names kept`);
        }
      }
    })
  );

  // every row must be the same length or the tuple decoder mis-reads a column
  for (const row of cat.t) if (row.length < 18) row[17] = row[17] ?? "";

  writeFileSync("public/catalog.json", JSON.stringify(cat));
  writeFileSync("public/catalog-index.json", JSON.stringify(idx));
  const inCore = cat.t.filter((r) => r[17]).length;
  const inIndex = idx.o.filter(Boolean).length;
  console.log(`\n✅ ${found} native names · core ${inCore} · deep index ${inIndex}`);
}

void main();
