/**
 * A SESSION GRADED BY A REAL PERSON'S ANSWERS
 *
 *   npx tsx scripts/replay.ts            [both exports]
 *   npx tsx scripts/replay.ts .cache/user-swipes.json
 *
 * Every other ruler here builds its viewer out of the catalog: a persona that
 * likes a genre, or a MovieLens library, or — worst of all — someone who by
 * definition knows the most-voted titles. That last assumption is why the
 * engine spent its whole life answering "have you seen this?" with a vote
 * count and no instrument ever objected. Fame predicted recognition because
 * the rulers were built to make it true.
 *
 * This one cannot make that mistake, because it does not invent the viewer. A
 * real person swiped 865 cards across two sessions and said, for each one,
 * whether he had watched it and whether he liked it. Those answers are the
 * oracle. The engine runs a full session against them and is scored on the
 * cards he *actually* swiped — the second column below. No model produced
 * those labels and no assumption of ours is baked into them.
 *
 * WHAT IT CANNOT DO. The deck picks from 4,000+ titles and he labelled a few
 * hundred, so a card outside his labels has to be answered by a stand-in rule
 * (obscure → not seen, famous non-comedy → disliked) purely to keep the
 * session moving. That rule is a guess, and it is why the `liked` column is
 * near-identical between any two builds and means almost nothing. Only the
 * `really liked` column is evidence. Read that column and ignore the other.
 *
 * Ten seeds, because a single session's cold start swings hard — his own two
 * real sessions differ by 5x in the first fifty cards on identical code, and
 * mistaking that for a regression cost an afternoon.
 */
import { readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { featurize } from "../src/lib/engine/features";
import { buildRarityIndex } from "../src/lib/engine/facets";
import { recommend, type CandidateItem } from "../src/lib/engine/recommend";
import { applySwipe, emptyProfile } from "../src/lib/engine/taste";
import type { SwipeAction, Title } from "../src/lib/types";

const files = process.argv.slice(2);
const exports_ = files.length
  ? files
  : [".cache/user-swipes.json", ".cache/user-swipes-v2.json"];

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

/** the oracle: what he really said, first answer wins */
const truth = new Map<string, SwipeAction>();
for (const f of exports_) {
  let rows: { id: string; a: SwipeAction }[];
  try {
    rows = JSON.parse(readFileSync(f, "utf8")).swipes;
  } catch {
    console.log(`  (skipping ${f} — not found)`);
    continue;
  }
  for (const s of rows) if (!truth.has(s.id)) truth.set(s.id, s.a);
}
if (truth.size === 0) {
  console.log("no exports found. Swipe a session at /lab and press Export.");
  process.exit(1);
}

/**
 * A card he never saw has no true answer, so it gets a stand-in. Deliberately
 * shaped like his log — he swipes up on the obscure and on the famous
 * blockbusters alike, and reserves left for the middle he actually watched.
 * This is a guess and nothing below is scored on it.
 */
const answer = (t: Title): SwipeAction => {
  const known = truth.get(t.id);
  if (known) return known;
  const comedy = t.genres.some((g) => g.toLowerCase() === "comedy");
  if (t.voteCount < 4000) return "not_seen";
  return comedy ? "liked" : t.voteCount > 12000 ? "not_seen" : "disliked";
};

/** the same four taps he opened both real sessions with */
const OPENING = ["movie-138843", "movie-18785", "movie-38", "tv-48891"];
const SWIPES = 250;
const BLOCK = 50;
const SEEDS = 10;
const blocks = SWIPES / BLOCK;

const liked = new Array(blocks).fill(0);
const real = new Array(blocks).fill(0);
const labelled = new Array(blocks).fill(0);

for (let seed = 1; seed <= SEEDS; seed++) {
  let p = emptyProfile();
  const shown = new Set<string>();
  const likedTitles: Title[] = [];
  for (const id of OPENING) {
    const t = byId.get(id);
    if (!t) continue;
    p = applySwipe(p, t, vf(t), "liked");
    likedTitles.push(t);
    shown.add(id);
  }

  let cards = 0;
  while (cards < SWIPES) {
    const batch = recommend(pool, p, {
      excludeIds: shown,
      count: 10,
      seed,
      vectorFor: vf,
      likedTitles,
      mode: "swipe",
    });
    if (batch.length === 0) break;
    for (const r of batch) {
      if (cards >= SWIPES) break;
      const b = Math.floor(cards / BLOCK);
      const a = answer(r.title);
      const said = truth.get(r.title.id);
      if (said) labelled[b]++;
      if (said === "liked") real[b]++;
      if (a === "liked") {
        likedTitles.push(r.title);
        liked[b]++;
      }
      p = applySwipe(p, r.title, vf(r.title), a);
      shown.add(r.title.id);
      cards++;
    }
  }
}

const mean = (x: number) => (x / SEEDS).toFixed(1).padStart(5);
console.log(
  `\n${truth.size} labelled titles · ${SEEDS} seeds · ${SWIPES} swipes each\n\n` +
    "  block      liked*     HE REALLY LIKED     of his cards shown"
);
for (let i = 0; i < blocks; i++) {
  console.log(
    `  ${String(i * BLOCK + 1).padStart(3)}-${String((i + 1) * BLOCK).padEnd(4)}   ${mean(liked[i])}         ${mean(real[i])}            ${mean(labelled[i])}`
  );
}
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
console.log(
  `  TOTAL         ${mean(sum(liked))}         ${mean(sum(real))}            ${mean(sum(labelled))}\n\n` +
    "  * mostly stand-in answers — near-identical between builds, ignore it.\n" +
    "    The middle column is the score: cards he swiped himself and liked.\n"
);
