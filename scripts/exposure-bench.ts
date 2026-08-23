/**
 * WHICH SIGNAL FINDS THE REST OF A PERSON'S WATCH HISTORY?
 *
 *   npx tsx scripts/exposure-bench.ts
 *   USERS=200 NEG=3000 npx tsx scripts/exposure-bench.ts
 *
 * The product's goal is one prediction repeated: given what we already know a
 * person has watched, which title in the catalog have they *also* watched? Get
 * that right and their whole history comes out in a few sessions. Get it wrong
 * and they swipe past a thousand films they have never heard of, which is what
 * the real session shows — 70% recognised in the first hundred cards, 8% in
 * the last.
 *
 * `exposure-auc.ts` asks this on the only honest labels this project owns: 599
 * blind-sampled titles one person answered. It cannot settle anything. Thirty
 * of them are positives, so every signal comes back with an interval about
 * 0.15 wide and they all overlap. Five times in this project a ruler too blunt
 * to see the difference was used to justify a change anyway, and this is
 * exactly the shape of that mistake.
 *
 * So this is the same question asked where there is enough data to answer it:
 * 500 MovieLens histories, 30,808 titles between them. MovieLens wrote those
 * histories, not us, and a person who rated a film watched it.
 *
 * THE SPLIT IS THE DESIGN. Each person's library is cut in half. The profile is
 * built from one half — this is "what the site knows so far" — and scored
 * against the other half mixed into a few thousand random catalog titles they
 * never rated. Every signal is asked to float the held-out half to the top.
 * That is not a proxy for the deck's job. It *is* the deck's job.
 *
 * WHAT IT CANNOT DO, stated plainly because the last ruler that hid its limits
 * cost a week:
 *
 *   - MovieLens has no television. 3,076 of 15,083 catalog titles are invisible
 *     here, and a fifth of the one real library measured is television.
 *   - A MovieLens library is what somebody bothered to rate, which is a subset
 *     of what they watched. Titles counted as negatives include films they saw
 *     and never rated, so every AUC here is an underestimate by an unknown
 *     amount. It is the *ranking* of signals that this is for, not the level.
 *   - These are MovieLens raters. They are not him, and they are not a general
 *     population either.
 *
 * Per-user AUC, averaged, rather than one pooled AUC across everybody: pooling
 * lets a few enormous libraries decide the answer and hides the variance that
 * the interval is there to report.
 */
import { readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { buildRarityIndex, titleTokens } from "../src/lib/engine/facets";
import { featurize } from "../src/lib/engine/features";
import { applySwipe, emptyProfile, watchLikelihood } from "../src/lib/engine/taste";
import { walkBonus, type CandidateItem } from "../src/lib/engine/recommend";
import type { Title } from "../src/lib/types";
import { loadFullCatalog } from "./lib/catalog";

const USERS = Number(process.env.USERS ?? 200);
const NEG = Number(process.env.NEG ?? 2000);
const SEED = Number(process.env.SEED ?? 7);

const catalog = loadFullCatalog();
buildRarityIndex(catalog);
const byId = new Map(catalog.map((t) => [t.id, t]));

const roster = (
  JSON.parse(readFileSync(".cache/test-users.json", "utf8")) as { id: number; lib: string[] }[]
).filter((u) => u.lib.filter((id) => byId.has(id)).length >= 20);

/** deterministic PRNG, so a rerun of the same sweep compares like with like */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 0x100000000);
}

function auc(rows: { score: number; label: boolean }[]): number {
  const sorted = [...rows].sort((a, b) => a.score - b.score);
  let sumPos = 0;
  let nPos = 0;
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j < sorted.length && sorted[j].score === sorted[i].score) j++;
    const avgRank = (i + j + 1) / 2;
    for (let k = i; k < j; k++) {
      if (sorted[k].label) {
        sumPos += avgRank;
        nPos++;
      }
    }
    i = j;
  }
  const nNeg = sorted.length - nPos;
  if (nPos === 0 || nNeg === 0) return 0.5;
  return (sumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

/** share of the held-out library inside the top N by score — what the deck deals */
function recallAt(rows: { score: number; label: boolean }[], n: number): number {
  const top = [...rows].sort((a, b) => b.score - a.score).slice(0, n);
  const found = top.filter((r) => r.label).length;
  const total = rows.filter((r) => r.label).length;
  return total === 0 ? 0 : found / total;
}

const fameRank = new Map(
  [...catalog].sort((a, b) => b.voteCount - a.voteCount).map((t, i) => [t.id, i + 1])
);

type Scorer = (t: Title, ctx: Ctx) => number;
type Ctx = {
  profile: ReturnType<typeof emptyProfile>;
  knownIds: Set<string>;
  inbound: Map<string, number>;
  /** the damped two-hop walk the engine actually runs, not a proxy for it */
  walk: Map<string, { score: number }>;
};

const fameOf = (t: Title) => 1 - fameRank.get(t.id)! / catalog.length;
const outEdges = (t: Title, ctx: Ctx) => (t.related ?? []).filter((id) => ctx.knownIds.has(id)).length;

const SIGNALS: [string, Scorer][] = [
  ["vote count (ships)", (t) => fameOf(t)],
  ["watchLikelihood (ships)", (t, c) => watchLikelihood(c.profile, titleTokens(t), fameOf(t))],
  ["popularity", (t) => t.popularity],
  ["personal facets only", (t, c) => watchLikelihood(c.profile, titleTokens(t), 0)],
  ["co-watch out", (t, c) => outEdges(t, c)],
  ["co-watch in", (t, c) => c.inbound.get(t.id) ?? 0],
  ["co-watch both ways", (t, c) => outEdges(t, c) + (c.inbound.get(t.id) ?? 0)],
  /**
   * Co-watch is a count, so it is zero for most of the catalog and cannot
   * order the part of the list where most cards actually come from. Fame
   * breaks those ties. This is the cheapest possible combination and the one
   * worth testing before anything cleverer.
   */
  ["co-watch, fame breaks ties", (t, c) => outEdges(t, c) + (c.inbound.get(t.id) ?? 0) + fameOf(t)],
  [
    "watchLikelihood + co-watch",
    (t, c) =>
      watchLikelihood(c.profile, titleTokens(t), fameOf(t)) +
      0.1 * (outEdges(t, c) + (c.inbound.get(t.id) ?? 0)),
  ],
  /**
   * WHAT ACTUALLY SHIPS.
   *
   * Everything above treats co-watch as a raw count of `related` edges. That
   * is a proxy: the engine runs a damped two-hop walk with degree
   * normalisation, which is a different function of the same graph. Measuring
   * the proxy and then shipping the walk is the same class of mistake as
   * measuring the gate in global fame rank when the gate is expressed
   * per-kind — a mistake this session already made once today.
   */
  ["walkBonus alone", (t, c) => c.walk.get(t.id)?.score ?? 0],
  [
    "watchLikelihood + walkBonus",
    (t, c) =>
      watchLikelihood(c.profile, titleTokens(t), fameOf(t)) +
      0.35 * (c.walk.get(t.id)?.score ?? 0),
  ],
];

const perUser = new Map<string, number[]>();
const perUserRecall = new Map<string, number[]>();
for (const [name] of SIGNALS) {
  perUser.set(name, []);
  perUserRecall.set(name, []);
}

/**
 * ONE pool array for the whole run.
 *
 * `buildGraph` and the walk cache are both keyed by pool identity through a
 * WeakMap, so building a fresh array per person would rebuild the 15,083-node
 * graph 200 times and never hit either cache.
 */
const walkPool: CandidateItem[] = catalog.map((title) => ({ title }));

const rand = rng(SEED);
const people = roster.slice(0, USERS);
process.stdout.write(`grading ${people.length} people · ${NEG} negatives each\n`);

for (const person of people) {
  const lib = person.lib.filter((id) => byId.has(id));
  const shuffled = [...lib].sort(() => rand() - 0.5);
  const half = Math.floor(shuffled.length / 2);
  const known = shuffled.slice(0, half);
  const held = new Set(shuffled.slice(half));
  const libAll = new Set(lib);

  /**
   * The profile the site would hold after they entered the first half.
   *
   * IT MUST INCLUDE THE "NEVER HEARD OF IT" ANSWERS. A first cut fed only the
   * library, as likes, and every personalised signal came back bit-identical
   * to the plain fame prior — because `seenTrust` is scaled by `4p(1-p)` and a
   * profile of nothing but likes has p = 1, so the trust is exactly zero and
   * `watchLikelihood` returns its prior untouched. The bench was reporting
   * that the personal model does not matter while quietly never running it.
   *
   * A real session is roughly two "never seen" answers for every one kept —
   * measured at 68% across 1,098 real cards — so the profile is built at that
   * ratio, from titles outside their library.
   */
  let profile = emptyProfile();
  for (const id of known) profile = applySwipe(profile, byId.get(id)!, featurize(byId.get(id)!), "liked");
  for (let i = 0; i < known.length * 2; i++) {
    const t = catalog[Math.floor(rand() * catalog.length)];
    if (libAll.has(t.id)) continue;
    profile = applySwipe(profile, t, featurize(t), "not_seen");
  }
  const knownIds = new Set(known);
  const inbound = new Map<string, number>();
  for (const id of known) {
    for (const rel of byId.get(id)!.related ?? []) inbound.set(rel, (inbound.get(rel) ?? 0) + 1);
  }
  const walk = walkBonus(walkPool, known.map((id) => byId.get(id)!));
  const ctx: Ctx = { profile, knownIds, inbound, walk };

  /* negatives: random catalog titles they never rated */
  const negatives: Title[] = [];
  const guard = new Set<string>();
  while (negatives.length < NEG && guard.size < catalog.length) {
    const t = catalog[Math.floor(rand() * catalog.length)];
    if (libAll.has(t.id) || guard.has(t.id)) continue;
    guard.add(t.id);
    negatives.push(t);
  }
  /**
   * SHUFFLED, because several of these signals are integer counts that are
   * zero for most of the catalog, and a stable sort leaves tied rows in the
   * order they arrived. With the positives listed first, `recall@200` read
   * 100% for any signal flat enough to tie everything — it was measuring the
   * order of this array and calling it a result.
   */
  const pool = [...[...held].map((id) => byId.get(id)!), ...negatives];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  for (const [name, fn] of SIGNALS) {
    const rows = pool.map((t) => ({ score: fn(t, ctx), label: held.has(t.id) }));
    perUser.get(name)!.push(auc(rows));
    perUserRecall.get(name)!.push(recallAt(rows, 200));
  }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const ci = (xs: number[]) => {
  const m = mean(xs);
  const sd = Math.sqrt(mean(xs.map((x) => (x - m) ** 2)) * (xs.length / (xs.length - 1)));
  const half = (1.96 * sd) / Math.sqrt(xs.length);
  return [m - half, m + half] as const;
};

console.log(`\n  ${people.length} MovieLens histories · half known, half held out\n`);
console.log("    signal                        AUC     95% interval      recall@200");
const baseline = mean(perUser.get("vote count (ships)")!);
for (const [name] of SIGNALS) {
  const xs = perUser.get(name)!;
  const m = mean(xs);
  const [lo, hi] = ci(xs);
  const r = mean(perUserRecall.get(name)!);
  const mark = lo > baseline ? "  ▲" : hi < baseline ? "  ▼" : "";
  console.log(
    `    ${name.padEnd(28)} ${m.toFixed(3)}   ${lo.toFixed(3)} – ${hi.toFixed(3)}      ` +
      `${(100 * r).toFixed(1)}%${mark}`
  );
}
console.log(
  `\n  ▲ / ▼ mark a signal whose interval clears the shipped fame prior in` +
    `\n  either direction. recall@200 is the share of the held-out half that` +
    `\n  lands in the top 200 — roughly two sessions of cards.\n`
);
