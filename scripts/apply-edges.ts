/**
 * Write a computed recommendation graph into the shipped catalog.
 *
 *   npx tsx scripts/apply-edges.ts .cache/enrich-union.json
 *
 * The catalog's `related` field started life as TMDB's "people who watched
 * this also watched" list. It now carries the distilled graph instead: the
 * positions 200,000 people's behaviour implies, predicted for every title from
 * metadata we own, unioned with TMDB's own links so the obvious neighbours are
 * not lost.
 *
 * Only the graph is written. No ratings, no user data, and nothing that could
 * identify a person — the file is a list of "these two titles go together",
 * computed offline and small enough to ship.
 *
 * Edges are stored as positions in the same array rather than ids, which is
 * how the field was already encoded: "movie-27205" costs ~14 bytes, its index
 * costs three.
 */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import type { EncodedCatalog } from "../src/lib/data/catalog-codec";

const source = process.argv[2] ?? ".cache/enrich-union.json";
const target = process.argv[3] ?? "public/catalog.json";

const data = JSON.parse(readFileSync(target, "utf8")) as EncodedCatalog;
const { edges } = JSON.parse(readFileSync(source, "utf8")) as {
  edges: Record<string, string[]>;
};

const idAt = (i: number) => `${data.t[i][1] === 1 ? "tv" : "movie"}-${data.t[i][0]}`;
const indexOf = new Map<string, number>();
data.t.forEach((_, i) => indexOf.set(idAt(i), i));

const before = statSync(target).size;
let written = 0;
let total = 0;

data.t.forEach((row, i) => {
  const list = edges[idAt(i)];
  if (!list?.length) return;
  const idx = list
    .map((id) => indexOf.get(id))
    .filter((j): j is number => j !== undefined && j !== i);
  row[16] = [...new Set(idx)];
  written++;
  total += row[16].length;
});

const json = JSON.stringify(data);
writeFileSync(target, json);

const gz = gzipSync(Buffer.from(json)).length;
console.log(
  `${written}/${data.t.length} titles given edges, ${(total / written).toFixed(1)} each\n` +
    `${target}: ${(before / 1e6).toFixed(2)} MB → ${(json.length / 1e6).toFixed(2)} MB ` +
    `(${(gz / 1e6).toFixed(2)} MB gzipped — this is what a visitor downloads)`
);
