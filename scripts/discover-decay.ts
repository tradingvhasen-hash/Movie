/**
 * DOES DISCOVER DECAY THE WAY THE DECK DOES?
 *
 *   npx tsx scripts/discover-decay.ts
 *   USERS=150 PAGES=20 npx tsx scripts/discover-decay.ts
 *
 * The complaint is about both surfaces: "of the first fifty I liked forty, of
 * the last fifty I liked two." The deck's version of that is measured to death
 * — 71 titles per hundred cards falling to 12. Discover's version has never
 * been measured once, and the reason is worth stating plainly.
 *
 * `human-test.ts` grades Discover on 444 real people and reports 33.8%. But it
 * asks for **one page** from a profile built in a single shot and stops. It
 * cannot see decay at all, because nothing is ever consumed. It is a
 * photograph of the first screen, and the complaint is about the twentieth.
 *
 * This consumes. Build the profile from half a person's library, ask for a
 * page, mark everything on it as seen-and-dealt, ask again, and keep going —
 * exactly what a person does by scrolling and coming back. A recommendation
 * counts as good if the title is in the held-out half: they really did watch
 * it, so recommending it was right.
 *
 * WHAT IT CANNOT DO. A held-out MovieLens history is what somebody rated, not
 * everything they would have enjoyed, so absolute precision is an
 * underestimate and always will be. The *shape* is the finding, and the shape
 * is what the complaint is about — a flat line at 20% and a line that falls
 * from 40% to 2% are different products, whatever the absolute level.
 *
 * MODE=swipe grades the deck through the same loop, so the two surfaces can be
 * compared on one ruler for the first time.
 */
import { readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { featurize } from "../src/lib/engine/features";
import { buildRarityIndex } from "../src/lib/engine/facets";
import { recommend, type CandidateItem } from "../src/lib/engine/recommend";
import { applySwipe, emptyProfile } from "../src/lib/engine/taste";
import type { Title } from "../src/lib/types";
import { loadFullCatalog } from "./lib/catalog";

const USERS = Number(process.env.USERS ?? 120);
const PAGE = Number(process.env.PAGE ?? 25);
const PAGES = Number(process.env.PAGES ?? 20);
const MIN_LIBRARY = Number(process.env.MIN_LIBRARY ?? 60);
const MODE = (process.env.MODE as "swipe" | "discover") ?? "discover";

let catalog = loadFullCatalog();
/* MovieLens has no television, so a TV title is a slot that can never be a
   hit — the same correction human-test makes for the same reason */
catalog = catalog.filter((t) => t.type === "movie");
const byId = new Map(catalog.map((t) => [t.id, t]));
buildRarityIndex(catalog);
const pool: CandidateItem[] = catalog.map((title) => ({ title }));

const vc = new Map<string, Float32Array>();
const vf = (t: Title) => {
  let v = vc.get(t.id);
  if (!v) {
    v = featurize(t);
    vc.set(t.id, v);
  }
  return v;
};

const histories = JSON.parse(readFileSync(".cache/histories.json", "utf8")) as Record<
  string,
  [string, number][]
>;

function shuffle<T>(xs: T[], seed: number): T[] {
  const out = [...xs];
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const hits = new Array(PAGES).fill(0);
const shownPer = new Array(PAGES).fill(0);
let people = 0;
let heldTotal = 0;
let foundTotal = 0;
let ranDry = 0;

let uid = 0;
for (const [, history] of Object.entries(histories)) {
  if (people >= USERS) break;
  uid++;
  const lib = history
    .map(([id, rating]) => ({ t: byId.get(id), rating }))
    .filter((x): x is { t: Title; rating: number } => Boolean(x.t));
  if (lib.length < MIN_LIBRARY) continue;
  people++;

  const mixed = shuffle(lib, uid * 7919 + 13);
  const cut = Math.floor(mixed.length / 2);
  const known = mixed.slice(0, cut);
  const held = new Set(mixed.slice(cut).map((x) => x.t.id));
  heldTotal += held.size;

  let profile = emptyProfile();
  const excl = new Set<string>();
  const liked: Title[] = [];
  for (const { t, rating } of known) {
    /**
     * The profile is built the way the person built it, not as a wall of
     * likes. `human-test` feeds every title as `liked`, which is fine for a
     * single page but wrong here: a session that never contains a dislike
     * gives `answerBalance` nothing to work with, and the exposure model then
     * behaves differently from any real profile this loop is meant to imitate.
     */
    const action = rating >= 4 ? "liked" : rating >= 3 ? "seen" : "disliked";
    profile = applySwipe(profile, t, vf(t), action);
    excl.add(t.id);
    if (action === "liked") liked.push(t);
  }

  for (let page = 0; page < PAGES; page++) {
    const recs = recommend(pool, profile, {
      excludeIds: excl,
      count: PAGE,
      seed: uid,
      vectorFor: vf,
      mode: MODE,
      likedTitles: liked,
    });
    if (recs.length === 0) {
      ranDry++;
      break;
    }
    let pageHits = 0;
    for (const r of recs) {
      /**
       * Consumed, whether or not it was a hit. That is the whole point: the
       * person has now seen this recommendation and will not accept it again,
       * so the next page must find something else. Without this the loop
       * returns the same page twenty times and measures nothing.
       */
      excl.add(r.title.id);
      if (held.has(r.title.id)) pageHits++;
    }
    hits[page] += pageHits;
    shownPer[page] += recs.length;
    foundTotal += pageHits;
  }
}

console.log(
  `\n  ${MODE.toUpperCase()} — ${people} real people · ${PAGES} pages of ${PAGE}` +
    ` · profile from half a library, graded against the other half\n`
);
console.log("  page      good on this page      running total");
let run = 0;
for (let p = 0; p < PAGES; p++) {
  if (shownPer[p] === 0) continue;
  run += hits[p] / people;
  const pct = (100 * hits[p]) / shownPer[p];
  const bar = "█".repeat(Math.round(pct / 2));
  console.log(
    `  ${String(p + 1).padStart(4)}    ${pct.toFixed(1).padStart(6)}%   ${(hits[p] / people)
      .toFixed(1)
      .padStart(5)} of ${PAGE}   ${run.toFixed(1).padStart(6)}   ${bar}`
  );
}
const first = (100 * hits[0]) / Math.max(shownPer[0], 1);
const last = (100 * hits[PAGES - 1]) / Math.max(shownPer[PAGES - 1], 1);
console.log(
  `\n  first page ${first.toFixed(1)}%  ·  last page ${last.toFixed(1)}%  ·  ` +
    `last/first ${((100 * last) / Math.max(first, 0.01)).toFixed(0)}%`
);
console.log(
  `  ${(foundTotal / people).toFixed(1)} of ${(heldTotal / people).toFixed(1)} held-out films` +
    ` found in ${PAGES * PAGE} recommendations` +
    (ranDry > 0 ? `  ·  ran dry for ${ranDry} people` : "")
);
console.log(
  `\n  A flat line means the surface does not decay. The deck falls to about\n` +
    `  17% of its opening rate over the same span, so that is the comparison.\n`
);
