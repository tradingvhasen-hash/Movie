/**
 * CUT THE CATALOG INTO NEIGHBOURHOODS, FROM WHO WATCHES WHAT TOGETHER.
 *
 *   npx tsx scripts/build-regions.ts
 *   RESOLUTION=12 npx tsx scripts/build-regions.ts
 *
 * Writes `public/regions.json` — one region id per title, in catalog order.
 *
 * WHY THIS EXISTS. `scripts/lost-titles.ts` measured what "considered and
 * never dealt" is made of and the answer was not unfairness. The deck spends
 * roughly 305 of its 500 cards on titles the person has never watched, and no
 * reordering of the same 500 cards fixes that — exposure debt was built,
 * measured on three settings, and moved nothing (see `recommend.ts`).
 *
 * The way to find more of a person's history is to waste fewer cards, and to
 * waste fewer cards you need somewhere to aim. A single global ranking has no
 * concept of "here" — it re-sorts all 48,553 titles on every batch and has no
 * memory that the last eleven cards from one part of the catalog were all
 * misses. Regions give it that memory.
 *
 * WHY THE CO-WATCH GRAPH AND NOT GENRES. Genres describe what happens in a
 * film. A neighbourhood is a group of works *the same people watch*, which is
 * the thing actually being predicted, and it cuts across genre constantly:
 * this project already measured that 25% of co-watch edges join titles sharing
 * at most one keyword, genre, actor or director. Those edges are exactly the
 * information genres cannot supply.
 *
 * THE METHOD is label propagation — every title starts in its own region and
 * repeatedly adopts whichever region is commonest among its neighbours. It is
 * near-linear, needs no target count, and finds communities of wildly
 * different sizes, which is correct here: "Studio Ghibli" is a real
 * neighbourhood and so is "English-language prestige drama", and they are not
 * the same size.
 *
 * Ties are broken by a seeded hash rather than at random, so the same catalog
 * always yields the same regions and a measurement can be repeated.
 */
import { writeFileSync } from "node:fs";
import { loadFullCatalog } from "./lib/catalog";

const ROUNDS = Number(process.env.ROUNDS ?? 12);
/** regions smaller than this are folded into their commonest neighbour */
const MIN_REGION = Number(process.env.MIN_REGION ?? 12);

const catalog = loadFullCatalog();
const n = catalog.length;
const index = new Map(catalog.map((t, i) => [t.id, i]));

/* adjacency, undirected: A recommends B implies they share an audience, and
   the direction TMDB happens to store that in carries no extra meaning */
const adj: number[][] = Array.from({ length: n }, () => []);
let edges = 0;
for (let i = 0; i < n; i++) {
  for (const id of catalog[i].related ?? []) {
    const j = index.get(id);
    if (j === undefined || j === i) continue;
    adj[i].push(j);
    adj[j].push(i);
    edges++;
  }
}
console.log(`${n} titles, ${edges} co-watch edges`);

/* deterministic tie-break and deterministic visit order */
const hash = (x: number) => {
  let h = (x ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
};
const order = [...Array(n).keys()].sort((a, b) => hash(a) - hash(b));

let label = new Int32Array(n);
for (let i = 0; i < n; i++) label[i] = i;

for (let round = 0; round < ROUNDS; round++) {
  let moved = 0;
  const counts = new Map<number, number>();
  for (const i of order) {
    const nb = adj[i];
    if (nb.length === 0) continue;
    counts.clear();
    for (const j of nb) counts.set(label[j], (counts.get(label[j]) ?? 0) + 1);
    let best = label[i];
    let bestCount = -1;
    for (const [lab, c] of counts) {
      /* the hash tie-break keeps this reproducible; without it two equally
         popular labels resolve by Map insertion order, which depends on the
         edge order, which depends on the catalog build */
      if (c > bestCount || (c === bestCount && hash(lab) > hash(best))) {
        best = lab;
        bestCount = c;
      }
    }
    if (best !== label[i]) {
      label[i] = best;
      moved++;
    }
  }
  console.log(`  round ${String(round + 1).padStart(2)}: ${moved} titles moved`);
  if (moved === 0) break;
}

/* fold the specks: a region of three titles cannot accumulate enough evidence
   to be called hot or cold before a session ends, so it is noise with an id */
const sizes = new Map<number, number>();
for (let i = 0; i < n; i++) sizes.set(label[i], (sizes.get(label[i]) ?? 0) + 1);

let folded = 0;
for (let i = 0; i < n; i++) {
  if ((sizes.get(label[i]) ?? 0) >= MIN_REGION) continue;
  const counts = new Map<number, number>();
  for (const j of adj[i]) {
    if ((sizes.get(label[j]) ?? 0) < MIN_REGION) continue;
    counts.set(label[j], (counts.get(label[j]) ?? 0) + 1);
  }
  let best = -1;
  let bestCount = 0;
  for (const [lab, c] of counts) if (c > bestCount) ((best = lab), (bestCount = c));
  if (best >= 0) {
    label[i] = best;
    folded++;
  }
}

/* renumber densely, so the shipped file is small integers rather than indexes
   scattered across 0..48,552 */
const remap = new Map<number, number>();
const out = new Int32Array(n);
for (let i = 0; i < n; i++) {
  let r = remap.get(label[i]);
  if (r === undefined) remap.set(label[i], (r = remap.size));
  out[i] = r;
}

const finalSizes = new Map<number, number>();
for (let i = 0; i < n; i++) finalSizes.set(out[i], (finalSizes.get(out[i]) ?? 0) + 1);
const big = [...finalSizes.entries()].sort((a, b) => b[1] - a[1]);

console.log(
  `\n${remap.size} regions (${folded} specks folded)\n` +
    `  largest:  ${big.slice(0, 8).map(([, s]) => s).join(", ")}\n` +
    `  median:   ${big[Math.floor(big.length / 2)]?.[1] ?? 0}\n` +
    `  singletons (no edges): ${big.filter(([, s]) => s === 1).length}`
);

/* a sample, so a person can see whether these are real neighbourhoods rather
   than trusting a modularity score they cannot check */
console.log("\n  a few regions, by their best-known members:\n");
for (const [regionId, size] of big.slice(0, 6)) {
  const members = catalog
    .filter((_, i) => out[i] === regionId)
    .sort((a, b) => b.voteCount - a.voteCount)
    .slice(0, 5)
    .map((t) => t.title.en);
  console.log(`  [${String(size).padStart(5)}]  ${members.join(" · ")}`);
}

writeFileSync(
  "public/regions.json",
  JSON.stringify({ v: 1, count: remap.size, r: Array.from(out) })
);
console.log(`\n✅ public/regions.json — ${remap.size} regions over ${n} titles`);
