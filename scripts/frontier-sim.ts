/**
 * THE COLLAPSE IS IN THE PROBLEM, NOT THE RANKING — SHOWN BY BUILDING A
 * COMPLETELY DIFFERENT ALGORITHM AND GETTING THE SAME CURVE.
 *
 *   npx tsx scripts/frontier-sim.ts
 *   CARDS=2400 USERS=60 MODE=grid npx tsx scripts/frontier-sim.ts
 *
 * Four attempts to slow the deck's decay by changing weights inside
 * `recommend()` measured zero, and a fifth — the frontier as an added term —
 * measured zero as well. Before trying a sixth it was worth asking whether the
 * ranking is the thing at fault at all.
 *
 * So this is the opposite of the shipped engine. There is no gate, no facet
 * table, no taste model, no diversity pass, no exploration, no fame prior
 * beyond a tie-break. One rule: **every title the viewer confirms watching
 * opens its co-watch neighbours, and the next card is whichever candidate the
 * most confirmed titles point at.** It shares no line of code with
 * `recommend.ts`.
 *
 * It reads, per hundred cards:
 *
 *     frontier   73.4  62.2  53.6  44.4  37.8  31.4 ... 14.5  11.8
 *     shipped    71.8  60.1  50.9  43.1  36.9  31.1 ... 14.7  12.1
 *
 * Two algorithms with nothing in common, one curve. Whatever the decay is, it
 * is not a property of how `recommend()` sorts. By card 2,400 a person has 485
 * of their 533 films in — the rate falls because they are nearly finished.
 *
 * WHAT IT IS STILL GOOD FOR. As the *entire* ordering, the frontier harvests
 * 484.7 against the shipped deck's 410.9 — 91% of a library against 77%. That
 * is the result the engine has so far failed to capture, because inside
 * `recommend()` the frontier is one term among six and +0.55 cannot reorder a
 * score whose facet term spans ±1.6. This file is the reference implementation
 * of the thing that works, kept so the number can be reproduced rather than
 * quoted from a shell one-liner.
 *
 * The cost model is the one `harvest.ts` uses, measured from real sessions:
 * 1.1s per card, or 1.5s a screen plus 0.35s a poster.
 */
import { readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import type { Title } from "../src/lib/types";

const CARDS = Number(process.env.CARDS ?? 1200);
const USERS = Number(process.env.USERS ?? 60);
const BLOCK = Number(process.env.BLOCK ?? 100);
const MODE = process.env.MODE ?? "deck";
const GRID = Number(process.env.GRID ?? 40);
const SEC_CARD = 1.1;
const GRID_FIXED = 1.5;
const GRID_TILE = 0.35;

const catalog = decodeCatalog(
  JSON.parse(readFileSync("public/catalog.json", "utf8")) as EncodedCatalog
);
const byId = new Map(catalog.map((t) => [t.id, t]));
const ranked = [...catalog].sort((a, b) => b.voteCount - a.voteCount);
const fameRank = new Map(ranked.map((t, i) => [t.id, i + 1]));

const histories = JSON.parse(readFileSync(".cache/histories.json", "utf8")) as Record<
  string,
  [string, number][]
>;

const blocks = new Array(Math.ceil(CARDS / BLOCK)).fill(0);
let users = 0;
let library = 0;
let harvested = 0;
let seconds = 0;
let ranDry = 0;

for (const [, history] of Object.entries(histories).slice(0, USERS)) {
  const seen = new Set(history.map(([id]) => id).filter((id) => byId.has(id)));
  if (seen.size < 100) continue;
  users++;
  library += seen.size;

  const shown = new Set<string>();
  /** candidate id -> how many confirmed titles point at it */
  const votes = new Map<string, number>();
  const open = (id: string) => {
    for (const r of byId.get(id)?.related ?? []) {
      if (shown.has(r) || !byId.has(r)) continue;
      votes.set(r, (votes.get(r) ?? 0) + 1);
    }
  };

  // the opening: their four best-known favourites, as the app's picker collects
  for (const t of [...seen]
    .map((id) => byId.get(id)!)
    .sort((a, b) => b.voteCount - a.voteCount)
    .slice(0, 4)) {
    shown.add(t.id);
    open(t.id);
  }

  let cards = 0;
  while (cards < CARDS) {
    const batch: string[] = [];
    const want = MODE === "grid" ? Math.min(GRID, CARDS - cards) : 1;
    for (let k = 0; k < want; k++) {
      let best: string | null = null;
      let bestWeight = -1;
      for (const [id, v] of votes) {
        if (shown.has(id) || batch.includes(id)) continue;
        // votes dominate; fame only separates candidates on the same vote count
        const w = v * 1000 + (1 - (fameRank.get(id) ?? catalog.length) / catalog.length);
        if (w > bestWeight) {
          bestWeight = w;
          best = id;
        }
      }
      if (!best) {
        // the frontier is dry: fall back to plain fame so the session continues
        ranDry++;
        for (const t of ranked) {
          if (!shown.has(t.id) && !batch.includes(t.id)) {
            best = t.id;
            break;
          }
        }
      }
      if (!best) break;
      batch.push(best);
    }
    if (batch.length === 0) break;

    seconds +=
      MODE === "grid" ? GRID_FIXED + GRID_TILE * batch.length : SEC_CARD * batch.length;
    for (const id of batch) {
      votes.delete(id);
      shown.add(id);
      cards++;
      if (seen.has(id)) {
        harvested++;
        blocks[Math.floor((cards - 1) / BLOCK)]++;
        // a hit opens its own frontier, which is why this never runs dry
        open(id);
      }
    }
  }
}

const minutes = seconds / users / 60;
console.log(`\n  FRONTIER ONLY — no gate, no facets, no taste model, no diversity`);
console.log(`  ${users} people · ${CARDS} titles each · ${MODE}${MODE === "grid" ? ` of ${GRID}` : ""}\n`);
console.log("  cards        found in this block");
for (let i = 0; i < blocks.length; i++) {
  const lo = i * BLOCK + 1;
  const hi = Math.min((i + 1) * BLOCK, CARDS);
  console.log(
    `  ${String(lo).padStart(5)}-${String(hi).padEnd(6)}  ${(blocks[i] / users).toFixed(1).padStart(6)}`
  );
}
console.log(
  `\n  HARVEST   ${(harvested / users).toFixed(1)} of ${(library / users).toFixed(1)} films ` +
    `(${((100 * harvested) / library).toFixed(1)}%)`
);
console.log(`  TIME      ${minutes.toFixed(1)} minutes each`);
console.log(`  RATE      ${Math.round(harvested / users / minutes * 60)} titles per hour`);
console.log(`  frontier ran dry ${ranDry} times across ${users} people`);
console.log(
  `\n  the shipped deck, same ruler: 410.9 of 533.4 in 22.0 minutes = 1,121/hour\n`
);
