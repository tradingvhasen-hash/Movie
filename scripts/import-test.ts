/**
 * WHAT SHARE OF A REAL LIBRARY DOES THE IMPORTER ACTUALLY FIND?
 *
 *   npx tsx scripts/import-test.ts
 *
 * An importer that silently drops a third of a person's films is worse than no
 * importer, because the loss is invisible: they see "imported 500 films" and
 * never learn which 250 went missing. So this measures the match rate before
 * any of it is wired to a screen.
 *
 * The test set is built from MovieLens histories rendered as a Letterboxd
 * export — title and year and a five-point rating, which is exactly what a real
 * file carries and deliberately *not* the tmdb id, since the id path is a
 * lookup that cannot fail. Then the names are damaged the way real exports
 * differ from our catalog: accents dropped, articles moved to the end,
 * punctuation changed, the year off by one.
 */
import { readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { matchAll, readExport, parseCsv } from "../src/lib/import/watchlist";
import type { Title } from "../src/lib/types";

const catalog = decodeCatalog(
  JSON.parse(readFileSync("public/catalog.json", "utf8")) as EncodedCatalog
);
const byId = new Map(catalog.map((t) => [t.id, t]));

const histories = JSON.parse(readFileSync(".cache/histories.json", "utf8")) as Record<
  string,
  [string, number][]
>;

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** the ways a real export's spelling differs from ours */
const damage: [string, (t: Title) => string][] = [
  ["exact title", (t) => t.title.en],
  ["article moved to the end", (t) => t.title.en.replace(/^(The|A|An) (.+)$/, "$2, $1")],
  ["accents stripped", (t) => t.title.en.normalize("NFD").replace(/[̀-ͯ]/g, "")],
  ["punctuation changed", (t) => t.title.en.replace(/[:·–—]/g, "-").replace(/'/g, "'")],
  ["lower case", (t) => t.title.en.toLowerCase()],
];

console.log(`\n  catalog: ${catalog.length} titles\n`);

for (const [label, render] of damage) {
  for (const yearShift of [0, 1]) {
    let total = 0;
    let found = 0;
    let wrong = 0;
    let people = 0;
    for (const [, history] of Object.entries(histories).slice(0, 60)) {
      const titles = history
        .map(([id]) => byId.get(id))
        .filter((t): t is Title => Boolean(t));
      if (titles.length < 50) continue;
      people++;
      const lines = ["Name,Year,Rating"];
      for (const t of titles) {
        lines.push(
          `${csvCell(render(t))},${t.year + yearShift},${(3 + (t.id.length % 5) / 2).toFixed(1)}`
        );
      }
      const rows = readExport(lines.join("\n"));
      const res = matchAll(rows, catalog);
      const want = new Set(titles.map((t) => t.id));
      total += titles.length;
      found += res.matched.length;
      for (const m of res.matched) if (!want.has(m.title.id)) wrong++;
    }
    if (people === 0) continue;
    const pct = (100 * found) / total;
    const bad = (100 * wrong) / Math.max(found, 1);
    console.log(
      `    ${label.padEnd(26)} year ${yearShift === 0 ? " exact" : "off by 1"}   ` +
        `matched ${pct.toFixed(1).padStart(5)}%   wrong film ${bad.toFixed(2)}%`
    );
  }
}

/* ── the parser itself, on the rows that break naive splitting ── */
const tricky = [
  'Name,Year,Rating',
  '"Dr. Strangelove or: How I Learned to Stop Worrying, and Love the Bomb",1964,5',
  '"Hearts of Darkness: A Filmmaker\'s ""Apocalypse""",1991,4',
  'WALL·E,2008,4.5',
  '"Monty Python\'s The Meaning of Life",1983,',
];
const parsed = parseCsv(tricky.join("\n"));
const rows = readExport(tricky.join("\n"));
console.log(`\n  parser on rows that break a naive split:`);
console.log(`    ${parsed.length - 1} data rows, ${parsed[1].length} columns on the comma-in-title row`);
for (const r of rows) {
  console.log(`      ${r.year ?? "----"}  rating ${String(r.rating ?? "none").padStart(4)}  ${r.name}`);
}
console.log();
