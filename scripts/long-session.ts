/**
 * TWO HUNDRED SWIPES — the session a user documented, graded against a taste
 * written by hand.
 *
 *   npx tsx scripts/long-session.ts
 *
 * The user logged his own session in blocks of fifty, twice, with two
 * different strategies:
 *
 *                            1-50   51-100  101-150  151-200
 *   right / up (no left)      37      12       17        5
 *   right / left (no up)      33      15        3        3
 *
 * The agreement between the two runs is the finding. One never swipes up at
 * all, so the fame ledger — which contracts on "never heard of it" — cannot be
 * the cause: it behaves completely differently in the two runs while the
 * collapse is identical.
 *
 * WHY THE TASTE IS A LIST OF NAMES
 *
 * The first version of this ruler defined "on taste" as Discover's top 300 for
 * the seed profile, frozen. That was the engine grading its own homework in a
 * subtler form than usual: the engine's idea of a viewer legitimately sharpens
 * as they swipe, so part of the measured drop was the reference going stale
 * rather than the deck going wrong — and it duly measured a gentler decline
 * than the user lived.
 *
 * A person's taste does not drift while they use the site for an hour. So the
 * taste here is 131 named titles, written out by hand the way `vibe-pairs.ts`
 * writes its pairs, and never touched by the engine. The genre facet cannot
 * substitute for it either: the catalog holds 169 recognisable comedies and
 * only a fraction are *this* comedy, which is exactly the difference between
 * a deck still finding a taste and one that has fallen back to the category.
 *
 * WHAT THE THIRD COLUMN SETTLES
 *
 * "still reachable" counts titles from the list that the viewer has not been
 * shown and that the fame gate would currently admit. If the hit rate falls
 * while that number stays high, the deck has stopped *finding* the taste. If
 * they fall together, it has run out — a catalog problem, not a ranking one.
 * The two need completely different work, and no earlier instrument here could
 * tell them apart.
 *
 * Judgement call, stated: Deadpool, Kingsman and Free Guy are on the list.
 * They are action first and comedy second, and a viewer who names The Hangover
 * and Superbad plausibly enjoys them. Dropping them moves the numbers by about
 * a card per block and does not change any conclusion.
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

const byName = new Map<string, Title>();
for (const t of catalog) byName.set(t.title.en.toLowerCase(), t);
const find = (n: string) => byName.get(n.toLowerCase());

const SWIPES = Number(process.env.SWIPES ?? 200);
const BLOCK = 50;

/** the taste, written out rather than inferred */
const TASTE = `The Hangover|The Hangover Part II|The Hangover Part III|Superbad|Step Brothers|
Anchorman: The Legend of Ron Burgundy|Anchorman 2: The Legend Continues|
Talladega Nights: The Ballad of Ricky Bobby|Zoolander|Zoolander 2|Tropic Thunder|
DodgeBall: A True Underdog Story|Old School|Wedding Crashers|Bridesmaids|
The 40 Year Old Virgin|Knocked Up|Pineapple Express|This Is the End|ted|Ted 2|
We're the Millers|Horrible Bosses|Horrible Bosses 2|21 Jump Street|22 Jump Street|
Role Models|I Love You, Man|Forgetting Sarah Marshall|Get Him to the Greek|Neighbors|
Neighbors 2: Sorority Rising|Blockers|Game Night|Spy|The Other Guys|The Nice Guys|
Central Intelligence|Ride Along|Ride Along 2|Dumb and Dumber|Dumb and Dumber To|
Zombieland|Zombieland: Double Tap|Shaun of the Dead|Hot Fuzz|The World's End|
Napoleon Dynamite|Mean Girls|Legally Blonde|Bring It On|American Pie|American Pie 2|
American Wedding|Road Trip|EuroTrip|Harold & Kumar Go to White Castle|Super Troopers|
Adventureland|Sex Drive|Project X|21 & Over|Bad Teacher|Bad Moms|A Bad Moms Christmas|
Sisters|The Heat|Identity Thief|Tammy|Trainwreck|Girls Trip|Booksmart|Good Boys|
The Big Sick|Palm Springs|Vacation|National Lampoon's Vacation|Caddyshack|Animal House|
Ghostbusters|Coming to America|Trading Places|Beverly Hills Cop|Beverly Hills Cop II|
The Naked Gun|Airplane!|Blazing Saddles|Young Frankenstein|Spaceballs|Groundhog Day|
Liar Liar|The Mask|Ace Ventura: Pet Detective|Ace Ventura: When Nature Calls|
The Cable Guy|Me, Myself & Irene|There's Something About Mary|Meet the Parents|
Meet the Fockers|Little Fockers|Along Came Polly|Blades of Glory|The Campaign|Get Hard|
Daddy's Home|Daddy's Home 2|Instant Family|Tag|Office Space|Clerks|Mallrats|
Jay and Silent Bob Strike Back|
Borat: Cultural Learnings of America for Make Benefit Glorious Nation of Kazakhstan|
Brüno|The Dictator|Elf|Popstar: Never Stop Never Stopping|Sausage Party|Why Him?|
Long Shot|Free Guy|Deadpool|Deadpool 2|Kingsman: The Secret Service|
Hot Tub Time Machine|Due Date|Paul|The Interview|Pitch Perfect|Pitch Perfect 2|Easy A`
  .split("|")
  .map((s) => s.trim())
  .filter(Boolean);

const taste = TASTE.map(find).filter((t): t is Title => Boolean(t));
const tasteIds = new Set(taste.map((t) => t.id));

/** the three the user picked from the onboarding grid */
const seeds = ["The Hangover", "Superbad", "Step Brothers"]
  .map(find)
  .filter((t): t is Title => Boolean(t));

console.log(
  `taste: ${taste.length} named titles, ${TASTE.length - taste.length} not in the catalog\n` +
    `seeded with ${seeds.map((t) => t.title.en).join(", ")}\n`
);

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

  const blocks: { hit: number; gate: number; reachable: number; unswiped: number }[] = [];
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
      const good = tasteIds.has(rec.title.id);
      if (good) hit++;
      const action: SwipeAction = good ? "liked" : strategy.miss;
      if (good) liked.push(rec.title);
      p = applySwipe(p, rec.title, vf(rec.title), action);
      shown.add(rec.title.id);
      swipes++;

      if (swipes % BLOCK === 0) {
        const gate = fameTierSize(p, "swipe");
        const inGate = new Set(fameGate(pool, gate, p.facets).map((c) => c.title.id));
        blocks.push({
          hit,
          gate,
          reachable: taste.filter((t) => !shown.has(t.id) && inGate.has(t.id)).length,
          unswiped: taste.filter((t) => !shown.has(t.id)).length,
        });
        hit = 0;
      }
    }
  }

  console.log(`${strategy.name}\n`);
  console.log(
    "   block      on taste /50     gate    of the taste: reachable / unswiped"
  );
  blocks.forEach((b, i) => {
    console.log(
      `  ${String(i * BLOCK + 1).padStart(4)}-${String((i + 1) * BLOCK).padEnd(6)}` +
        `${String(b.hit).padStart(9)}${String(b.gate).padStart(11)}` +
        `${`${b.reachable} / ${b.unswiped}`.padStart(30)}`
    );
  });
  console.log();
}
