/**
 * THE NAME A FILM ACTUALLY HAS, IN THE SCRIPT IT WAS MADE IN.
 *
 *   TMDB_API_KEY=... npx tsx scripts/add-original-titles.ts
 *
 * The user searched `الفيل الأزرق` — an Egyptian film that is in this catalog —
 * and got nothing. Typing "The Blue Elephant" found it. The same is true of
 * One Piece in Japanese, of Three Idiots in Hindi, and of every Turkish, Korean
 * and Tamil title in here.
 *
 * It reads like a search bug and it is not. Search already looks at two names.
 * The problem is which two: we store TMDB's *English* title and TMDB's *Arabic
 * translation*. For a film whose own name is already Arabic there is no Arabic
 * translation to fetch, so the field is empty — `The Blue Elephant` has `ar:
 * ""`, and so do `El Kebeer Awi`, `Bab Al-Hara`, `Al Hayba` and `Tash ma Tash`.
 * The one name a person would actually type is the one name we never kept.
 *
 * TMDB has it as `original_title` / `original_name`. This fetches it for the
 * 7,994 non-English titles — English ones have an original identical to the
 * title we already store — and writes it into the catalog as a third name.
 *
 * DISPLAY DOES NOT CHANGE. The user's own example settles that: Three Idiots
 * is far better known by its English name than by `3 इडियट्स`, so the card
 * keeps the English title and the original becomes something you can *search
 * by*. Recognition and recall want different names, and only recall is broken.
 */
import { readFileSync, writeFileSync } from "node:fs";

const KEY = process.env.TMDB_API_KEY;
if (!KEY) {
  console.error("TMDB_API_KEY is required (never commit it).");
  process.exit(1);
}

type Row = unknown[];
const cat = JSON.parse(readFileSync("public/catalog.json", "utf8")) as {
  v: number;
  g: string[];
  l: string[];
  t: Row[];
};

const CONCURRENCY = 24;
const todo: { row: Row; kind: string; id: number }[] = [];
for (const row of cat.t) {
  const lang = cat.l[row[10] as number];
  if (lang === "en") continue;
  todo.push({ row, kind: row[1] === 1 ? "tv" : "movie", id: row[0] as number });
}
console.log(`  ${todo.length} non-English titles to look up\n`);

let done = 0;
let found = 0;
let same = 0;

async function one(job: (typeof todo)[number]) {
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
      const english = String(job.row[2] ?? "");
      if (!original) return;
      if (original === english) {
        same++;
        return;
      }
      // index 17: appended, so a catalog written before this still decodes
      job.row[17] = original;
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
        if (++done % 500 === 0) {
          console.log(`  ${done}/${todo.length} · ${found} distinct originals kept`);
        }
      }
    })
  );

  // every row must be the same length or the tuple decoder mis-reads a column
  for (const row of cat.t) if (row.length < 18) row[17] = row[17] ?? "";

  writeFileSync("public/catalog.json", JSON.stringify(cat));
  console.log(
    `\n  done · ${found} titles gained a native-script name · ` +
      `${same} were identical to the English one\n`
  );
}

void main();
