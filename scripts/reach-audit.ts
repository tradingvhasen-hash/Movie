/**
 * IS THE ALGORITHM ACTUALLY APPLIED TO ALL 48,553 TITLES?
 *
 *   npx tsx scripts/reach-audit.ts
 *   CARDS=3000 npx tsx scripts/reach-audit.ts
 *
 * The question behind this: a catalog can be large and still be decorative.
 * Adding titles to a file does nothing if the engine never scores them, and
 * that is not hypothetical here — `TIER_MAX` capped the candidate pool at
 * 6,000 for the whole time the catalog was growing to 51,922, so 88% of it
 * was never once considered. That was found by reading the code. This checks
 * it by measurement instead, at every layer where a title can be dropped:
 *
 *   1. DATA — does the title carry what the scorer reads? A title with no
 *      keywords and no cast cannot be matched to a taste however well it
 *      ranks. Fields are counted across the whole catalog.
 *   2. RARITY — the facet weights are built from the whole corpus. If they
 *      are built from a subset, deep titles score against weights that never
 *      saw them.
 *   3. GATE — `fameGate` admits the top N by fame. N is what actually decides
 *      how much of the catalog is reachable, and TIER_MAX is only its ceiling.
 *      Reported at real session lengths.
 *   4. REACH — the union of every title that was ever a candidate across a
 *      long session, which is the honest answer to "how much of the catalog
 *      can this person ever see".
 *   5. SCORING — do deep titles receive non-zero, varying scores, or does the
 *      scorer flatten them into a tie it then breaks by fame?
 *   6. SHOWN — of the titles actually dealt, how deep into the catalog do
 *      they go, per language.
 */
import { featurize } from "../src/lib/engine/features";
import { buildRarityIndex, titleTokens } from "../src/lib/engine/facets";
import {
  fameGate,
  fameTierSize,
  recommend,
  type CandidateItem,
} from "../src/lib/engine/recommend";
import { applySwipe, emptyProfile, watchLikelihood } from "../src/lib/engine/taste";
import type { Title } from "../src/lib/types";
import { loadFullCatalog } from "./lib/catalog";

const CARDS = Number(process.env.CARDS ?? 2000);
const catalog = loadFullCatalog();
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

const pct = (n: number, d: number) => `${((100 * n) / Math.max(d, 1)).toFixed(1)}%`;
const N = catalog.length;

console.log(`\n  ${N.toLocaleString()} titles in the shipped catalog\n`);

/* ── 1. does every title carry what the scorer reads? ──────────────────── */
console.log("  1 · DATA — the fields the scorer actually reads\n");
const has = {
  genres: catalog.filter((t) => t.genres.length > 0).length,
  keywords: catalog.filter((t) => t.keywords.length > 0).length,
  cast: catalog.filter((t) => t.people.cast.length > 0).length,
  director: catalog.filter((t) => t.people.director).length,
  related: catalog.filter((t) => (t.related?.length ?? 0) > 0).length,
  language: catalog.filter((t) => t.originalLanguage).length,
  year: catalog.filter((t) => t.year > 0).length,
  poster: catalog.filter((t) => t.posterPath).length,
};
for (const [k, v] of Object.entries(has)) {
  console.log(`      ${k.padEnd(10)} ${String(v).padStart(6)}  ${pct(v, N).padStart(6)}`);
}
const scorable = catalog.filter(
  (t) => t.genres.length > 0 && (t.keywords.length > 0 || t.people.cast.length > 0)
).length;
console.log(`\n      titles with enough to be matched to a taste: ${scorable} (${pct(scorable, N)})`);

/* ── 2. is the rarity index built over all of them? ────────────────────── */
console.log("\n  2 · RARITY — facet weights are derived from the whole corpus\n");
let tokenTotal = 0;
let tokenless = 0;
for (const t of catalog) {
  const tk = titleTokens(t);
  const n = Object.values(tk).reduce((a, b) => a + b.length, 0);
  tokenTotal += n;
  if (n === 0) tokenless++;
}
console.log(`      tokens per title: ${(tokenTotal / N).toFixed(1)} average`);
console.log(`      titles with no tokens at all: ${tokenless} (${pct(tokenless, N)})`);

/* ── 3. how many titles does the gate actually admit? ──────────────────── */
console.log("\n  3 · GATE — how many titles are candidates at all\n");
for (const answered of [0, 100, 500, 1000, 2000, 5000]) {
  const p = { ...emptyProfile(), seenCount: Math.round(answered * 0.35), unseenCount: Math.round(answered * 0.65) };
  const tier = fameTierSize(p as never);
  console.log(
    `      after ${String(answered).padStart(5)} answers: top ${String(tier).padStart(6)}` +
      `  =  ${pct(Math.min(tier, N), N).padStart(6)} of the catalog`
  );
}

/* ── 4. a real session: how much of the catalog was ever reachable? ────── */
console.log(`\n  4 · REACH — union of everything ever a candidate, over ${CARDS} cards\n`);
let profile = emptyProfile();
const shown = new Set<string>();
const everCandidate = new Set<string>();
const liked: Title[] = [];
const disliked: Title[] = [];
const neutral: Title[] = [];
const dealt: Title[] = [];

/* a plausible viewer: likes a third, has seen a third, has not seen a third */
let n = 0;
while (n < CARDS) {
  const tier = fameTierSize(profile);
  for (const c of fameGate(pool, tier, profile.facets, profile)) everCandidate.add(c.title.id);
  const recs = recommend(pool, profile, {
    mode: "swipe",
    excludeIds: shown,
    count: 20,
    seed: 7,
    vectorFor: vf,
    likedTitles: liked,
    dislikedTitles: disliked,
    seenTitles: neutral,
  });
  if (recs.length === 0) break;
  for (const r of recs) {
    if (n >= CARDS) break;
    const t = r.title;
    const roll = (n * 2654435761) % 3;
    const action = roll === 0 ? "liked" : roll === 1 ? "seen" : "not_seen";
    if (action === "liked") liked.push(t);
    else if (action === "seen") neutral.push(t);
    profile = applySwipe(profile, t, vf(t), action);
    shown.add(t.id);
    dealt.push(t);
    n++;
  }
}
console.log(`      ever a candidate: ${everCandidate.size.toLocaleString()} of ${N.toLocaleString()} (${pct(everCandidate.size, N)})`);
console.log(`      actually dealt:   ${shown.size.toLocaleString()}`);

/* ── 5. are deep titles scored, or flattened into a tie? ───────────────── */
console.log("\n  5 · SCORING — do deep titles get real, varying scores?\n");
const byFame = [...catalog].sort((a, b) => b.voteCount - a.voteCount);
const bands: [string, Title[]][] = [
  ["rank 1 - 1,000", byFame.slice(0, 1000)],
  ["rank 10,000 - 11,000", byFame.slice(10000, 11000)],
  ["rank 30,000 - 31,000", byFame.slice(30000, 31000)],
  ["rank 45,000 - 46,000", byFame.slice(45000, Math.min(46000, N))],
];
for (const [label, band] of bands) {
  if (band.length === 0) continue;
  const scores = band.map((t) => watchLikelihood(profile, titleTokens(t), 0));
  const distinct = new Set(scores.map((s) => s.toFixed(4))).size;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  console.log(
    `      ${label.padEnd(22)} ${String(distinct).padStart(5)} distinct scores of ${band.length}` +
      `  · range ${min.toFixed(3)} to ${max.toFixed(3)}`
  );
}

/* ── 6. how deep do the cards actually shown go? ───────────────────────── */
console.log("\n  6 · SHOWN — how deep into the catalog the dealt cards reach\n");
const rank = new Map(byFame.map((t, i) => [t.id, i + 1]));
const ranks = dealt.map((t) => rank.get(t.id)!).sort((a, b) => a - b);
const at = (q: number) => ranks[Math.floor(ranks.length * q)] ?? 0;
console.log(
  `      median rank ${at(0.5).toLocaleString()} · 90th ${at(0.9).toLocaleString()} · deepest ${
    ranks[ranks.length - 1]?.toLocaleString() ?? 0
  }`
);
const langs = new Map<string, number>();
for (const t of dealt) langs.set(t.originalLanguage, (langs.get(t.originalLanguage) ?? 0) + 1);
const top = [...langs].sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log(`      languages dealt: ${top.map(([l, c]) => `${l} ${c}`).join(" · ")}`);
const nonEn = dealt.length - (langs.get("en") ?? 0);
console.log(`      non-English cards: ${nonEn} of ${dealt.length} (${pct(nonEn, dealt.length)})\n`);
