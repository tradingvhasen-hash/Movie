/**
 * TWO HUNDRED SWIPES — the session a user actually documented, reproduced.
 *
 *   npx tsx scripts/long-session.ts
 *
 * A user logged his own session in blocks of fifty, twice, with two different
 * swiping strategies:
 *
 *                            1-50   51-100  101-150  151-200
 *   right / up (no left)      37      12       17        5
 *   right / left (no up)      33      15        3        3
 *
 * The two runs agree, and that agreement is the finding. One of them never
 * swipes up at all, so the fame ledger — which contracts on "never heard of
 * it" — cannot be the cause: it behaves completely differently in the two
 * runs while the collapse is identical. Something the two share is doing it.
 *
 * WHAT "ON TASTE" MEANS HERE, AND WHY IT IS NOT THE GENRE
 *
 * The session ruler counts a card as on-taste if it carries the viewer's
 * genre, and by that measure nothing collapses — lift holds at 108% across
 * 150 swipes. But the user's taste is not "comedy", it is a particular kind of
 * comedy, and a catalog holding 169 recognisable comedies may hold only forty
 * of *his*. A ruler that counts genre cannot tell the difference between a
 * deck that is still finding his taste and one that has fallen back to the
 * category.
 *
 * So on-taste is defined here by the engine's own best judgement, taken once
 * at the start and then frozen: Discover's top N for the seed profile.
 * Discover has no fame gate, so it ranks the whole catalog — it is the closest
 * thing to "what a good recommender would pick for this person", and it is
 * exactly what the user said stayed good while the deck fell apart.
 *
 * The question this answers: is the deck running out of his taste, or losing
 * track of it?
 */
import { readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { featurize } from "../src/lib/engine/features";
import {
  fameGate,
  fameTierSize,
  recommend,
  type CandidateItem,
} from "../src/lib/engine/recommend";
import { applySwipe, emptyProfile } from "../src/lib/engine/taste";
import { buildRarityIndex } from "../src/lib/engine/facets";
import type { SwipeAction, Title } from "../src/lib/types";

const catalog = decodeCatalog(
  JSON.parse(readFileSync("public/catalog.json", "utf8")) as EncodedCatalog
);
const pool: CandidateItem[] = catalog.map((title) => ({ title }));
buildRarityIndex(catalog);

const vc = new Map<string, Float32Array>();
const vf = (t: Title) => {
  let v = vc.get(t.id);
  if (!v) {
    v = featurize(t);
    vc.set(t.id, v);
  }
  return v;
};

const find = (n: string) =>
  catalog.find((t) => t.title.en.toLowerCase() === n.toLowerCase());

const SWIPES = Number(process.env.SWIPES ?? 200);
const BLOCK = 50;
/** how wide "the engine's own judgement" is drawn */
const TASTE_SET = Number(process.env.TASTE_SET ?? 300);

const SEED = ["The Hangover", "Superbad", "Step Brothers"];
const seeds = SEED.map(find).filter((t): t is Title => Boolean(t));

/** the frozen reference: what Discover would pick, before any swiping */
let ref = emptyProfile();
const refShown = new Set<string>();
for (const t of seeds) {
  ref = applySwipe(ref, t, vf(t), "liked");
  refShown.add(t.id);
}
const onTaste = new Set(
  recommend(pool, ref, {
    excludeIds: refShown,
    count: TASTE_SET,
    seed: 7,
    vectorFor: vf,
    likedTitles: seeds,
    mode: "discover",
  }).map((r) => r.title.id)
);
console.log(
  `taste defined as Discover's top ${TASTE_SET} for ${seeds.length} seed likes\n`
);

/** the two strategies the user actually used */
const STRATEGIES: { name: string; miss: SwipeAction }[] = [
  { name: "right / up   (no left)", miss: "not_seen" },
  { name: "right / left (no up)", miss: "disliked" },
];

for (const strategy of STRATEGIES) {
  let p = emptyProfile();
  const shown = new Set<string>();
  const liked: Title[] = [];
  for (const t of seeds) {
    p = applySwipe(p, t, vf(t), "liked");
    liked.push(t);
    shown.add(t.id);
  }

  const blocks: { hit: number; gate: number; left: number }[] = [];
  let swipes = 0;
  let hit = 0;

  while (swipes < SWIPES) {
    const batch = recommend(pool, p, {
      excludeIds: shown,
      count: 10,
      seed: 7,
      vectorFor: vf,
      likedTitles: liked,
      mode: "swipe",
    });
    if (batch.length === 0) break;

    for (const rec of batch) {
      const good = onTaste.has(rec.title.id);
      if (good) hit++;
      const action: SwipeAction = good ? "liked" : strategy.miss;
      if (good) liked.push(rec.title);
      p = applySwipe(p, rec.title, vf(rec.title), action);
      shown.add(rec.title.id);
      swipes++;

      if (swipes % BLOCK === 0) {
        // how much of the taste the gate can still reach at this moment
        const gate = fameTierSize(p, "swipe");
        const inGate = fameGate(pool, gate, p.facets).map((c) => c.title.id);
        const left = inGate.filter((id) => onTaste.has(id) && !shown.has(id)).length;
        blocks.push({ hit, gate, left });
        hit = 0;
      }
    }
  }

  console.log(`${strategy.name}\n`);
  console.log("   block     on taste /50    gate    of the taste still reachable");
  blocks.forEach((b, i) => {
    console.log(
      `  ${String(i * BLOCK + 1).padStart(4)}-${String((i + 1) * BLOCK).padEnd(5)}` +
        `${String(b.hit).padStart(10)}${String(b.gate).padStart(10)}` +
        `${String(b.left).padStart(28)}`
    );
  });
  console.log();
}
