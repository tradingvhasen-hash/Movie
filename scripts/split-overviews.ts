/**
 * TAKE THE PLOT SUMMARIES OFF THE CRITICAL PATH.
 *
 *   npx tsx scripts/split-overviews.ts
 *
 * Every visitor downloads the catalog before the first card. Measured across
 * 15,083 titles, `overview` is 374 bytes each — 1.23 MB gzipped, a third of
 * the whole download — and it is read in exactly one place: the panel that
 * opens when someone taps the info button on a card they are already looking
 * at.
 *
 *     one file, as it was          3.83 MB gzipped
 *     core, overviews removed      2.60 MB
 *     overviews, fetched after     1.13 MB
 *
 * So the first screen arrives on 2.6 MB instead of 3.8 — smaller than before
 * the catalog grew by 2,257 titles — and the summaries arrive quietly behind
 * it. A viewer who never taps info never waits for a byte of it, and a failure
 * to fetch costs a description rather than a deck.
 *
 * Run after any catalog build or extension.
 */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { decodeCatalog, encodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";

const CATALOG = "public/catalog.json";
const OVERVIEWS = "public/overviews.json";

const titles = decodeCatalog(
  JSON.parse(readFileSync(CATALOG, "utf8")) as EncodedCatalog
);

const overviews: Record<string, [string, string]> = {};
let kept = 0;
for (const t of titles) {
  const en = t.overview?.en ?? "";
  const ar = t.overview?.ar ?? "";
  if (en || ar) {
    overviews[t.id] = [en, ar === en ? "" : ar];
    kept++;
  }
  t.overview = { en: "", ar: "" };
}

writeFileSync(CATALOG, JSON.stringify(encodeCatalog(titles)));
writeFileSync(OVERVIEWS, JSON.stringify(overviews));

const gz = (p: string) => (gzipSync(readFileSync(p), { level: 9 }).length / 1048576).toFixed(2);
console.log(
  `\n  ${titles.length} titles · ${kept} summaries moved out\n` +
    `  catalog.json    ${gz(CATALOG)} MB gzipped   (first paint)\n` +
    `  overviews.json  ${gz(OVERVIEWS)} MB gzipped   (behind it)\n`
);
