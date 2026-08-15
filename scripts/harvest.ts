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
 *     in their history, rated >= 3.5   ->  swipe right
 *     in their history, rated <  3.5   ->  swipe left
 *     not in their history             ->  swipe up
 *
 * HARVEST is the score: how many titles of their real history the site pulled
 * out of them. Per block, because the shape is the finding — a real session
 * fell from 3,061 titles/hour to 220 inside eight minutes, and an average
 * hides that completely.
 *
 * CEILING is the honest denominator: how many of their history the gate can
 * ever reach, at any session length. When harvest stops well below ceiling the
 * ranking is at fault; when ceiling itself is low, no ranking can help and the
 * fault is reachability.
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
import { applySwipe, emptyProfile, type TasteProfile } from "../src/lib/engine/taste";
import type { SwipeAction, Title } from "../src/lib/types";

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
const BLOCK = Number(process.env.BLOCK ?? 100);
const LIMIT = Number(process.env.USERS ?? 60);
/** how many of their favourites the opening grid collects, as the app does */
const OPENING = 4;

const catalog = decodeCatalog(
  JSON.parse(readFileSync("public/catalog.json", "utf8")) as EncodedCatalog
);
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
let ranOut = 0;
let seconds = 0;

for (const [, history] of users) {
  const seen = new Map<string, number>();
  for (const [id, rating] of history) if (byId.has(id)) seen.set(id, rating);
  totalHistory += seen.size;

  let profile = emptyProfile();
  const shown = new Set<string>();
  const liked: Title[] = [];

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
        ? watchedGrid(pool, profile, { excludeIds: shown, count: GRID, seed: 7 })
        : recommend(pool, profile, {
            excludeIds: shown,
            count: 10,
            seed: 7,
            vectorFor: vf,
            likedTitles: liked,
            mode: "swipe",
          }).map((r) => r.title);
    if (batch.length === 0) {
      ranOut++;
      break;
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
            : rating >= 3.5
              ? "liked"
              : "disliked";
      if (rating !== undefined) {
        harvested[Math.floor(cards / BLOCK)]++;
        found++;
      }
      if (action === "liked") liked.push(title);
      if (MODE !== "grid") seconds += SECONDS_PER_CARD;
      profile = applySwipe(profile, title, vf(title), action);
      shown.add(title.id);
      cards++;
    }
  }
  totalHarvest += found;

  // the denominator: what the gate could ever have offered this person
  totalCeiling += reachable(profile, seen);
}

/** how much of their history the gate admits, at the pool they ended on */
function reachable(profile: TasteProfile, seen: Map<string, number>): number {
  const gate = fameGate(pool, fameTierSize(profile, "swipe"), profile.facets, profile);
  let n = 0;
  for (const c of gate) if (seen.has(c.title.id)) n++;
  return n;
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
    `  CEILING   ${avg(totalCeiling)} reachable inside the gate  ` +
    `(${pct(totalCeiling, totalHistory)} of it)\n` +
    (ranOut ? `  ${ranOut} of ${n} ran out of cards before ${CARDS}\n` : "") +
    `\n  If harvest sits far below ceiling the ranking is at fault.\n` +
    `  If ceiling itself is low, no ranking can fix it — that is reachability.\n`
);
