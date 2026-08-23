/**
 * HOW MUCH OF A PERSON'S WATCH HISTORY CAN THE SITE ACTUALLY GET OUT OF THEM?
 *
 *   npx tsx scripts/harvest.ts            60 people, 500 cards each
 *   USERS=10 CARDS=250 npx tsx scripts/harvest.ts
 *
 * Every other instrument in this repo grades recommendation quality: given
 * what someone likes, are the next twenty cards good ones. That is not the
 * product. The product is that within about a week a person can get *every
 * film they have ever watched* into the site, because once it knows that, it
 * knows them.
 *
 * Nothing here measured that. Not one number. So every improvement for weeks
 * has been a better answer to a question nobody asked, which is exactly why
 * three consecutive real sessions came out looking identical.
 *
 * This measures it. A MovieLens user with hundreds of ratings *is* a watch
 * history — they rated it, so they watched it — and MovieLens wrote those
 * histories, not us, so the oracle cannot be bent to flatter the engine. The
 * session runs for real: the deck picks a card, the person answers from their
 * history, the profile updates, repeat.
 *
 *     in their history, rated >= 4     ->  swipe right      ❤️
 *     in their history, rated 3 - 3.5  ->  watched, no view  👁
 *     in their history, rated <= 2.5   ->  swipe left        👎
 *     not in their history             ->  swipe up          ↑
 *
 * `VERDICTS=binary` restores the old two-way split at 3.5 — see the note on
 * VERDICTS below for why it changed and why both are kept.
 *
 * HARVEST is the score: how many titles of their real history the site pulled
 * out of them. Per block, because the shape is the finding — a real session
 * fell from 3,061 titles/hour to 220 inside eight minutes, and an average
 * hides that completely.
 *
 * REACHED / SHOWN decompose the loss, which is the whole point. A title in a
 * person's history is lost at exactly one of three stages:
 *
 *     never a candidate   the gate never admitted it, at any point in the
 *                         session. No ranking can recover this.
 *     candidate, unshown  admitted but never ranked highly enough to deal.
 *                         This is the ranking's fault and nothing else's.
 *     shown               recovered.
 *
 * THE OLD `CEILING` WAS WRONG AND IT MATTERED. It called `fameGate` once, on
 * the profile the session *ended* with, and reported the answer as "what the
 * gate can ever reach at any session length". Two things are wrong with that.
 * The gate it evaluated was sized for a 500-card session, so a longer session
 * would have raised the number on its own — the figure had a session length
 * baked into it while claiming not to. And the gate is personalised by
 * `watchLikelihood`, fitted on the answers this very session produced, so if
 * the ranking tunnelled the denominator tunnelled with it: the ceiling was
 * downstream of the thing it was supposed to bound.
 *
 * Both faults were found by review. What replaces it is a union across the
 * whole session — a title counts as reachable if the gate held it at any
 * point, which is what "reachable" was always meant to mean.
 *
 * WHAT IT CANNOT DO. A MovieLens history is what someone bothered to rate on
 * one site, not everything they have watched — it is a floor on their real
 * history, and it carries MovieLens's own exposure bias. It is still external,
 * large, and about the right question, which is three things no other ruler
 * here has at once.
 */
import { readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { featurize } from "../src/lib/engine/features";
import { buildRarityIndex } from "../src/lib/engine/facets";
import {
  fameGate,
  fameTierSize,
  recommend,
  watchedGrid,
  type CandidateItem,
} from "../src/lib/engine/recommend";
import { applySwipe, emptyProfile } from "../src/lib/engine/taste";
import type { SwipeAction, Title } from "../src/lib/types";
import { loadFullCatalog } from "./lib/catalog";

const CARDS = Number(process.env.CARDS ?? 500);
/**
 * `deck` asks one title at a time and gets a full verdict. `grid` shows
 * GRID posters at once and gets "seen / not seen" for all of them.
 *
 * The comparison is only meaningful in *time*, because per interaction the
 * grid is strictly worse — it collects no opinion. The cost model below is
 * measured from the user's own three sessions rather than assumed.
 */
const MODE = process.env.MODE ?? "deck";
const GRID = Number(process.env.GRID ?? 30);
/** his measured swipe rate, from 1,288 real cards across three sessions */
const SECONDS_PER_CARD = Number(process.env.SEC_CARD ?? 1.1);
/** a screen costs a fixed beat to take in, plus a glance per poster */
const GRID_FIXED = Number(process.env.GRID_FIXED ?? 1.5);
const GRID_PER_TILE = Number(process.env.GRID_TILE ?? 0.35);
/**
 * THE RULER COULD NOT PRODUCE ONE OF THE PRODUCT'S FOUR ANSWERS.
 *
 * The deck offers ❤️, 👎, ↑ and 👁 — the last meaning "I watched it and felt
 * nothing about it". This file mapped every MovieLens rating to like or
 * dislike at a 3.5 cut, so 👁 never occurred in any simulated session, and the
 * split it did produce is not a person: **32.5% dislikes**, against 4 dislikes
 * in 1,101 cards from the one real session on record.
 *
 * `three` maps ≥4 to a like, 3 to 3.5 to 👁, and ≤2.5 to a dislike — 45.7% /
 * 39.1% / 15.2% of MovieLens ratings. A 3-out-of-5 is exactly the answer that
 * button exists for.
 *
 * STATED PLAINLY BECAUSE IT MATTERS: this was changed **after** a sweep of the
 * exposure walk came back flat, and the reason it came back flat is that the
 * walk's whole purpose is to use 👁 answers that this ruler never generated.
 * Changing a ruler after it fails to show what you hoped is the exact mistake
 * this project has made five times. The defence is that the fault is real and
 * independent — a ruler that cannot express a quarter of the product's answers
 * is incomplete whatever it is being used to test — and that `binary`
 * reproduces the old behaviour exactly, so every number can be quoted both
 * ways. The old baseline is not being retired, it is being kept alongside.
 */
const VERDICTS = process.env.VERDICTS ?? "three";
/** SEED_SEEN=0 withholds the 👁 answers from the co-watch walk — the control */
const SEED_SEEN = process.env.SEED_SEEN !== "0";
const BLOCK = Number(process.env.BLOCK ?? 100);
const LIMIT = Number(process.env.USERS ?? 60);
/** how many of their favourites the opening grid collects, as the app does */
const OPENING = 4;

/**
 * MOVIES ONLY, BECAUSE MOVIELENS HAS NO TELEVISION.
 *
 * `human-test` has always made this correction and this file never did. It did
 * not matter much while the catalog was 20% series; it matters a great deal at
 * 29%, because every TV card dealt to a MovieLens history is a slot that
 * cannot be a hit however good the ranking is.
 *
 * Measured: with series left in, the 51,922-title catalog reads 171.6 of 564.9
 * harvested against 321.6 of 533.4 on the old 15,083-title one — a halving
 * that looks like the bigger catalog wrecking the engine and is mostly the
 * ruler grading it on cards it made unwinnable. The comparison is only honest
 * between catalogs if the same correction is applied to both.
 *
 * This is a limitation of the oracle, not of the product. Real people watch
 * series; MovieLens simply cannot say so.
 */
const catalog = loadFullCatalog().filter((t) => t.type === "movie");
// the browser attaches this in catalog.ts; instruments must see the same prior
try {
  const reach = JSON.parse(readFileSync(".cache/reach.json", "utf8")) as Record<string, number>;
  for (const t of catalog) {
    const r = reach[t.id];
    if (typeof r === "number") t.reach = r;
  }
} catch {
  /* measured without it, same as a browser that failed to fetch it */
}
buildRarityIndex(catalog);
const pool: CandidateItem[] = catalog.map((title) => ({ title }));
const byId = new Map(catalog.map((t) => [t.id, t]));

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
const users = Object.entries(histories).slice(0, LIMIT);

const blocks = Math.ceil(CARDS / BLOCK);
const harvested = new Array(blocks).fill(0);
let totalHistory = 0;
let totalCeiling = 0;
let totalHarvest = 0;
let totalShown = 0;
let ranOut = 0;
let seconds = 0;

/**
 * PER_USER=1 prints one line per person: id and titles harvested.
 *
 * Comparing two builds on 30 aggregate numbers cannot separate a real effect
 * from a lucky roster, and every run here is deterministic — same people, same
 * seed — so the *pairing* is free and throwing it away is careless. With this
 * the two arms can be compared person by person, which is a far stronger test
 * than two grand totals that happen to differ.
 */
const PER_USER = process.env.PER_USER === "1";

for (const [uid, history] of users) {
  const seen = new Map<string, number>();
  for (const [id, rating] of history) if (byId.has(id)) seen.set(id, rating);
  totalHistory += seen.size;

  let profile = emptyProfile();
  const shown = new Set<string>();
  const liked: Title[] = [];
  const disliked: Title[] = [];
  /* the 👁 answers: watched, no strong feeling. Co-watch seeds, nothing else. */
  const neutral: Title[] = [];
  /** every title the gate has admitted at any point for this person */
  const reachedIds = new Set<string>();

  // the opening grid: their best-known favourites, the way a real person
  // would tap the handful they recognise on the first screen
  const favourites = [...seen.entries()]
    .filter(([, r]) => r >= 4)
    .map(([id]) => byId.get(id)!)
    .sort((a, b) => b.voteCount - a.voteCount)
    .slice(0, OPENING);
  for (const t of favourites) {
    profile = applySwipe(profile, t, vf(t), "liked");
    liked.push(t);
    shown.add(t.id);
  }

  let found = favourites.length;
  let cards = 0;
  while (cards < CARDS) {
    const batch: Title[] =
      MODE === "grid"
        ? /**
           * The grid needs the confirmed titles too.
           *
           * It was called without them, so `watched` was empty, the frontier
           * was empty, and a sweep of FRONTIER_LIFT read 226.1 at every
           * weight — identical to the decimal, which is the signature of a
           * feature that never ran rather than one that did not help. Third
           * time today a measurement was void because the ruler withheld the
           * input the thing under test consumes.
           */
          watchedGrid(pool, profile, {
            excludeIds: shown,
            count: GRID,
            seed: 7,
            watched: [...liked, ...neutral, ...disliked],
          })
        : recommend(pool, profile, {
            excludeIds: shown,
            count: 10,
            seed: 7,
            vectorFor: vf,
            likedTitles: liked,
            dislikedTitles: disliked,
            seenTitles: SEED_SEEN ? neutral : [],
            mode: "swipe",
          }).map((r) => r.title);
    if (batch.length === 0) {
      ranOut++;
      break;
    }
    // sampled rather than continuous: the gate is the expensive call and it
    // moves slowly, so once a block is enough to see what it ever held
    if (cards % BLOCK === 0) {
      for (const c of fameGate(pool, fameTierSize(profile, "swipe"), profile.facets, profile)) {
        reachedIds.add(c.title.id);
      }
    }
    if (MODE === "grid") seconds += GRID_FIXED + GRID_PER_TILE * batch.length;
    for (const title of batch) {
      if (cards >= CARDS) break;
      const rating = seen.get(title.id);
      // a grid tap says "watched" and nothing more; the deck gets a verdict
      const action: SwipeAction =
        rating === undefined
          ? "not_seen"
          : MODE === "grid"
            ? "seen"
            : VERDICTS === "binary"
              ? rating >= 3.5
                ? "liked"
                : "disliked"
              : rating >= 4
                ? "liked"
                : rating >= 3
                  ? "seen"
                  : "disliked";
      if (rating !== undefined) {
        harvested[Math.floor(cards / BLOCK)]++;
        found++;
      }
      if (action === "liked") liked.push(title);
      else if (action === "disliked") disliked.push(title);
      else if (action === "seen") neutral.push(title);
      if (MODE !== "grid") seconds += SECONDS_PER_CARD;
      profile = applySwipe(profile, title, vf(title), action);
      shown.add(title.id);
      cards++;
    }
  }
  totalHarvest += found;
  if (PER_USER) console.log(`USER\t${uid}\t${found}`);

  // the denominator: everything the gate held at any point in the session
  let everReached = 0;
  for (const id of seen.keys()) if (reachedIds.has(id)) everReached++;
  totalCeiling += everReached;
  totalShown += found;
}


const n = users.length;
const avg = (x: number) => (x / n).toFixed(1).padStart(6);

console.log(
  `\n${n} real people · ${CARDS} cards each · histories average ` +
    `${Math.round(totalHistory / n)} films\n`
);
console.log("  cards        found in this block     running total");
let run = 0;
for (let i = 0; i < blocks; i++) {
  run += harvested[i];
  const lo = i * BLOCK + 1;
  const hi = Math.min((i + 1) * BLOCK, CARDS);
  console.log(
    `  ${String(lo).padStart(4)}-${String(hi).padEnd(5)}    ${avg(harvested[i])}` +
      `                ${avg(run + OPENING * n)}`
  );
}

const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(1)}%`;
console.log(
  `\n  ${MODE.toUpperCase()}, ${(seconds / n / 60).toFixed(1)} minutes of a person's attention each\n` +
    `  RATE      ${((totalHarvest / seconds) * 3600).toFixed(0)} titles harvested per hour\n` +
    `\n  HARVEST   ${avg(totalHarvest)} of ${avg(totalHistory)} films  ` +
    `(${pct(totalHarvest, totalHistory)} of a real history, in ${CARDS} cards)\n` +
    `  REACHED   ${avg(totalCeiling)} were candidates at some point  ` +
    `(${pct(totalCeiling, totalHistory)} of it)\n` +
    `  LOST AT RETRIEVAL  ${pct(totalHistory - totalCeiling, totalHistory)}` +
    `   ·  LOST AT RANKING  ${pct(totalCeiling - totalShown, totalHistory)}\n` +
    (ranOut ? `  ${ranOut} of ${n} ran out of cards before ${CARDS}\n` : "") +
    `\n  Retrieval loss is a gate problem and no ranking can touch it.\n` +
    `  Ranking loss is ours: the title was there and we did not deal it.\n`
);
