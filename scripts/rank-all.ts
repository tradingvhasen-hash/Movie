/**
 * RANK ALL 48,553 AGAINST A REAL LIBRARY. DOES THE RIGHT ANSWER COME TOP?
 *
 *   npx tsx scripts/rank-all.ts
 *   USERS=60 npx tsx scripts/rank-all.ts
 *
 * The user's proposal, stated exactly: take what a person has watched, compare
 * it against every title in the catalog, and deal the best match. No gate, no
 * tier, no fame short-list — score everything, sort, take the top.
 *
 * Every other instrument here measures a whole session, where the gate, the
 * exploration share, the diversity pass and the co-watch blend all act at
 * once, so a bad number cannot be attributed to any of them. This isolates ONE
 * question and answers it directly:
 *
 *     given half of a real person's library, where in the sorted list of all
 *     48,553 titles does the OTHER half land?
 *
 * If their held-out titles cluster near the top, the scorer works at full
 * scale and the gate is the only thing standing between this catalog and a
 * good deck. If they scatter through the middle, the scorer cannot rank
 * 48,553 items and no gate setting will save it — which is the claim I have
 * been making from an indirect measurement and which this tests head-on.
 *
 * The baseline is what makes the number mean anything: a random ordering puts
 * a held-out title at rank ~24,000 on average. Anything near that is noise
 * dressed as a recommendation.
 */
import { readFileSync } from "node:fs";
import { featurize } from "../src/lib/engine/features";
import { buildRarityIndex, titleTokens } from "../src/lib/engine/facets";
import { applySwipe, emptyProfile, watchLikelihood } from "../src/lib/engine/taste";
import type { Title } from "../src/lib/types";
import { loadFullCatalog } from "./lib/catalog";

const USERS = Number(process.env.USERS ?? 40);
const MIN_LIBRARY = Number(process.env.MIN_LIBRARY ?? 60);
/** "haven't seen" answers per library title — a real deck is mostly these */
const UNSEEN_RATIO = Number(process.env.UNSEEN_RATIO ?? 2);

const catalog = loadFullCatalog();
buildRarityIndex(catalog);
const byId = new Map(catalog.map((t) => [t.id, t]));
const N = catalog.length;

const vc = new Map<string, Float32Array>();
const vf = (t: Title) => {
  let v = vc.get(t.id);
  if (!v) {
    v = featurize(t);
    vc.set(t.id, v);
  }
  return v;
};

/** fame as a 0..1 position, the same shape the shipped scorer receives */
const fameOrder = [...catalog].sort((a, b) => b.voteCount - a.voteCount);
const fameRank = new Map(fameOrder.map((t, i) => [t.id, i + 1]));
const fameOf = (t: Title) => 1 - fameRank.get(t.id)! / N;

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

type Scorer = { name: string; score: (t: Title) => number };

const buckets = new Map<string, number[]>();
const record = (name: string, ranks: number[]) => {
  const b = buckets.get(name) ?? [];
  b.push(...ranks);
  buckets.set(name, b);
};

let people = 0;
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
  const knownIds = new Set(known.map((x) => x.t.id));

  /**
   * A PROFILE HAS TO CONTAIN "HAVEN'T SEEN", OR THE SCORER TURNS ITSELF OFF.
   *
   * A first version fed only the library — all liked/seen/disliked, no
   * `not_seen` — and reported that the shipped score and pure popularity give
   * IDENTICAL results to three significant figures. That was an artefact of
   * this loop, not a finding about the product.
   *
   * `seenTrust` multiplies the taste weight by `answerBalance`, which is
   * `4p(1-p)` over the share of answers meaning "I have seen this". A profile
   * of pure library is p = 1, so the balance term is exactly 0, taste is
   * weighted 0, and `watchLikelihood` returns the fame prior unchanged. The
   * test had switched off the thing it was measuring.
   *
   * Real sessions are mostly `not_seen` — a person recognises a minority of
   * what they are shown — so the deck is padded with unwatched titles drawn
   * from outside the library at a realistic rate before scoring.
   */
  let profile = emptyProfile();
  for (const { t, rating } of known) {
    const action = rating >= 4 ? "liked" : rating >= 3 ? "seen" : "disliked";
    profile = applySwipe(profile, t, vf(t), action);
  }
  const inLibrary = new Set(lib.map((x) => x.t.id));
  const unwatched = shuffle(
    catalog.filter((t) => !inLibrary.has(t.id)),
    uid * 104729 + 7
  ).slice(0, Math.round(known.length * UNSEEN_RATIO));
  for (const t of unwatched) profile = applySwipe(profile, t, vf(t), "not_seen");

  const scorers: Scorer[] = [
    /* what actually ships, fame included, exactly as the deck calls it */
    { name: "shipped score", score: (t) => watchLikelihood(profile, titleTokens(t), fameOf(t)) },
    /* the taste half alone, to separate taste from popularity */
    { name: "taste only", score: (t) => watchLikelihood(profile, titleTokens(t), 0) },
    /* popularity alone — the honest baseline any recommender must beat */
    { name: "fame only", score: (t) => fameOf(t) },
  ];

  for (const s of scorers) {
    const scored = catalog
      .filter((t) => !knownIds.has(t.id))
      .map((t) => ({ id: t.id, v: s.score(t) }))
      .sort((a, b) => b.v - a.v);
    const ranks: number[] = [];
    for (let i = 0; i < scored.length; i++) if (held.has(scored[i].id)) ranks.push(i + 1);
    record(s.name, ranks);
  }
}

console.log(
  `\n  ${people} real people · half their library known, the other half hidden` +
    `\n  every one of ${N.toLocaleString()} titles scored and sorted — no gate, no tier\n`
);
console.log("      scorer            median rank   top 100   top 1,000   top 5,000");
for (const [name, ranks] of buckets) {
  ranks.sort((a, b) => a - b);
  const median = ranks[Math.floor(ranks.length / 2)] ?? 0;
  const within = (n: number) => `${((100 * ranks.filter((r) => r <= n).length) / ranks.length).toFixed(1)}%`;
  console.log(
    `      ${name.padEnd(18)} ${median.toLocaleString().padStart(9)}` +
      `   ${within(100).padStart(7)}   ${within(1000).padStart(9)}   ${within(5000).padStart(9)}`
  );
}
console.log(
  `\n  A coin flip puts a hidden title at rank ~${Math.round(N / 2).toLocaleString()}.` +
    `\n  Anything near that is not a recommendation.\n`
);

/* ────────────────────────────────────────────────────────────────────────
   THE USER'S DESIGN, RUN AS A REAL SESSION.

   The table above scores a frozen profile once. This consumes: score every
   title, deal the best unanswered one, take the answer, rescore, repeat —
   which is exactly what was asked for, and nothing else. No fame gate, no
   tier, no exploration share, no diversity pass.

   It is directly comparable to `harvest.ts`, which runs the SHIPPED pipeline
   over the same histories and reports 180.7 of 642.9 in 800 cards. If this
   number is higher, the gate and the passes around it are what is costing the
   product, and the scorer was never the problem.
   ──────────────────────────────────────────────────────────────────────── */
if (process.env.SESSION === "1") {
  const CARDS = Number(process.env.CARDS ?? 800);
  let found = 0;
  let libTotal = 0;
  let sessions = 0;
  let uid2 = 0;
  for (const [, history] of Object.entries(histories)) {
    if (sessions >= USERS) break;
    uid2++;
    const lib = new Map<string, number>();
    for (const [id, rating] of history) if (byId.has(id)) lib.set(id, rating);
    if (lib.size < MIN_LIBRARY) continue;
    sessions++;
    libTotal += lib.size;

    let profile = emptyProfile();
    const answered = new Set<string>();
    /* the app's opening grid: a few favourites, as every other instrument does */
    const favourites = [...lib.entries()]
      .filter(([, r]) => r >= 4)
      .map(([id]) => byId.get(id)!)
      .sort((a, b) => b.voteCount - a.voteCount)
      .slice(0, 4);
    for (const t of favourites) {
      profile = applySwipe(profile, t, vf(t), "liked");
      answered.add(t.id);
      found++;
    }

    for (let card = 0; card < CARDS; card++) {
      let best: Title | null = null;
      let bestScore = -Infinity;
      for (const t of catalog) {
        if (answered.has(t.id)) continue;
        const v = watchLikelihood(profile, titleTokens(t), fameOf(t));
        if (v > bestScore) {
          bestScore = v;
          best = t;
        }
      }
      if (!best) break;
      const rating = lib.get(best.id);
      const action =
        rating === undefined ? "not_seen" : rating >= 4 ? "liked" : rating >= 3 ? "seen" : "disliked";
      if (rating !== undefined) found++;
      profile = applySwipe(profile, best, vf(best), action);
      answered.add(best.id);
    }
  }
  console.log(
    `  RANK-EVERYTHING SESSION — ${sessions} people, ${CARDS} cards each\n` +
      `      harvested ${(found / sessions).toFixed(1)} of ${(libTotal / sessions).toFixed(1)} titles` +
      `  (${((100 * found) / Math.max(libTotal, 1)).toFixed(1)}% of a real history)\n` +
      `      the shipped pipeline reads 180.7 of 642.9 on the same histories\n`
  );
}
