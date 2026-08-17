/**
 * IF YOU SWIPE LEFT A HUNDRED TIMES, DOES THE DECK EVER LEARN?
 *
 *   npx tsx scripts/hated-genre.ts
 *   GENRE=horror npx tsx scripts/hated-genre.ts
 *
 * `mixed-taste.ts` measures the false positive: one bad comedy must not cost
 * you comedy. Answering only that question produced a bad answer — confining a
 * dislike to cast and director, which makes it impossible for the deck to ever
 * learn that someone hates a whole category.
 *
 * The user caught it in one sentence: "I don't like superhero films. Does that
 * mean I swipe left a thousand times and keep being shown superhero films?"
 *
 * That is the true positive, and it needs its own ruler, because the two pull
 * in opposite directions and a fix for either alone is not a fix.
 *
 *     someone who has never liked this genre and dislikes every card of it
 *     ->  the share of that genre in the deck must fall to near zero
 *
 * Run against a viewer who also *likes* something else, because a deck that
 * simply stops dealing anything is not a success. Both numbers are printed:
 * the hated genre must collapse, the loved genre must not.
 */
import { readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { featurize } from "../src/lib/engine/features";
import { recommend, type CandidateItem } from "../src/lib/engine/recommend";
import { applySwipe, emptyProfile, type TasteProfile } from "../src/lib/engine/taste";
import { buildRarityIndex } from "../src/lib/engine/facets";
import type { Title } from "../src/lib/types";

const catalog = decodeCatalog(
  JSON.parse(readFileSync("public/catalog.json", "utf8")) as EncodedCatalog
);
const pool: CandidateItem[] = catalog.map((title) => ({ title }));
buildRarityIndex(catalog);

const vecs = new Map<string, Float32Array>();
const vf = (t: Title) => {
  let v = vecs.get(t.id);
  if (!v) {
    v = featurize(t);
    vecs.set(t.id, v);
  }
  return v;
};

const HATED = (process.env.GENRE ?? "science fiction").toLowerCase();
const LOVED = (process.env.LOVED ?? "comedy").toLowerCase();
const BLOCK = 20;
const BLOCKS = 10;

const has = (t: Title, g: string) => t.genres.some((x) => x.toLowerCase() === g);

/**
 * A viewer who has already shown the deck what they like, then meets the genre
 * they cannot stand. Starting from nothing would let the deck "learn" by
 * collapsing onto anything at all.
 */
function seedLibrary(): { profile: TasteProfile; excl: Set<string> } {
  let profile = emptyProfile();
  const excl = new Set<string>();
  // SEED=0 starts cold, which is how a person actually meets a genre they
  // hate: the deck is dealing broadly and the cards keep coming.
  if (process.env.SEED === "0") return { profile, excl };
  const liked = [...pool]
    .filter((c) => has(c.title, LOVED) && !has(c.title, HATED))
    .sort((a, b) => b.title.voteCount - a.title.voteCount)
    .slice(0, 8);
  for (const c of liked) {
    profile = applySwipe(profile, c.title, vf(c.title), "liked");
    excl.add(c.title.id);
  }
  return { profile, excl };
}

let { profile, excl } = seedLibrary();
console.log(
  `\n  a viewer who likes ${LOVED} and dislikes every ${HATED} card they meet\n` +
    `  ${BLOCKS} blocks of ${BLOCK} cards · every ${HATED} card is swiped left\n`
);
console.log(`  block      ${HATED.padEnd(16)} ${LOVED.padEnd(10)} left so far`);

let disliked = 0;
const shares: number[] = [];
for (let b = 0; b < BLOCKS; b++) {
  const batch = recommend(pool, profile, {
    excludeIds: excl,
    count: BLOCK,
    seed: 4242,
    vectorFor: vf,
    mode: "swipe",
  });
  if (batch.length === 0) break;

  const hated = batch.filter((r) => has(r.title, HATED)).length;
  const loved = batch.filter((r) => has(r.title, LOVED)).length;
  shares.push(hated / batch.length);

  for (const r of batch) {
    const action = has(r.title, HATED) ? "disliked" : "liked";
    if (action === "disliked") disliked++;
    profile = applySwipe(profile, r.title, vf(r.title), action);
    excl.add(r.title.id);
  }
  const bar = "#".repeat(Math.round((hated / batch.length) * 30));
  console.log(
    `  ${String(b * BLOCK + 1).padStart(3)}-${String(b * BLOCK + batch.length).padEnd(4)}` +
      `   ${String(hated).padStart(3)}/${batch.length}          ` +
      `${String(loved).padStart(3)}/${batch.length}      ${String(disliked).padStart(4)}   ${bar}`
  );
}

const first = shares.slice(0, 2).reduce((a, b) => a + b, 0) / Math.max(shares.slice(0, 2).length, 1);
const last = shares.slice(-3).reduce((a, b) => a + b, 0) / Math.max(shares.slice(-3).length, 1);
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
console.log(
  `\n  ${HATED} share: ${pct(first)} at the start → ${pct(last)} at the end` +
    `   (${last <= first * 0.35 ? "LEARNED" : last < first ? "weakly learning" : "NOT LEARNING"})\n`
);
