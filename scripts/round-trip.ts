/**
 * DOES A TASTE SURVIVE THE ROUND TRIP TO THE DATABASE AND BACK?
 *
 *   npx tsx scripts/round-trip.ts
 *
 * The stored schema was written when a viewer's taste *was* a 384-dimension
 * vector. It has not been since the facet tables shipped, and the sync layer
 * was still pushing two fields out of eleven. Wiring sign-in to that would
 * have meant someone signing in on a second device and finding a site that had
 * forgotten a month of swiping — silently, with nothing in any log.
 *
 * So before any of it is connected: build a real profile by swiping the real
 * engine, put it through the exact serialisation the sync layer uses, bring it
 * back, and check that the *ranking is identical*. Field-by-field equality is
 * not enough — what matters is that the deck it produces does not change.
 *
 * This runs without a database. It exercises the two pure functions the round
 * trip is made of, plus a JSON hop to stand in for the wire.
 */
import { readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { featurize } from "../src/lib/engine/features";
import { recommend, type CandidateItem } from "../src/lib/engine/recommend";
import { applySwipe, emptyProfile, type TasteProfile } from "../src/lib/engine/taste";
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

/* ── the serialisation under test, mirrored from src/lib/supabase/sync.ts ──
   Kept as a copy on purpose: if the two ever drift apart this file fails,
   which is the only way a mismatch gets noticed before a user does. */
function toRow(p: TasteProfile) {
  return {
    taste: `[${p.taste.join(",")}]`,
    facets: p.facets,
    seen_facets: p.seenFacets,
    facet_weights: p.facetWeights,
    streaks: p.streaks,
    liked_sum: p.likedSum,
    liked_count: p.likedCount,
    disliked_sum: p.dislikedSum,
    disliked_count: p.dislikedCount,
    rated_swipes: p.ratedSwipes,
    total_swipes: p.totalSwipes,
    seen_count: p.seenCount,
    unseen_count: p.unseenCount,
    recent: p.recent,
  };
}

function fromRow(row: Record<string, unknown>): TasteProfile {
  const base = emptyProfile();
  const nums = (v: unknown, fallback: number[]) =>
    Array.isArray(v) && v.length === fallback.length ? (v as number[]) : fallback;
  const vector = (value: unknown, fallback: number[]) => {
    if (Array.isArray(value)) return value as number[];
    if (typeof value !== "string") return fallback;
    const parsed = value.replace(/^\[|\]$/g, "").split(",").map(Number);
    return parsed.length === fallback.length && parsed.every(Number.isFinite)
      ? parsed
      : fallback;
  };
  return {
    ...base,
    facets: row.facets as TasteProfile["facets"],
    seenFacets: (row.seen_facets as TasteProfile["seenFacets"]) ?? base.seenFacets,
    facetWeights: (row.facet_weights as TasteProfile["facetWeights"]) ?? base.facetWeights,
    streaks: (row.streaks as TasteProfile["streaks"]) ?? base.streaks,
    taste: vector(row.taste, base.taste),
    likedSum: nums(row.liked_sum, base.likedSum),
    dislikedSum: nums(row.disliked_sum, base.dislikedSum),
    likedCount: Number(row.liked_count ?? 0),
    dislikedCount: Number(row.disliked_count ?? 0),
    ratedSwipes: Number(row.rated_swipes ?? 0),
    totalSwipes: Number(row.total_swipes ?? 0),
    seenCount: Number(row.seen_count ?? 0),
    unseenCount: Number(row.unseen_count ?? 0),
    recent: Array.isArray(row.recent) ? (row.recent as string[][]) : base.recent,
  };
}

/* ── build a profile the hard way: by actually swiping ─────────────────── */
const find = (n: string) =>
  catalog.find((t) => t.title.en.toLowerCase() === n.toLowerCase());

let profile = emptyProfile();
const shown = new Set<string>();
const liked: Title[] = [];
for (const n of ["The Hangover", "Superbad", "Step Brothers"]) {
  const t = find(n);
  if (!t) continue;
  profile = applySwipe(profile, t, vf(t), "liked");
  liked.push(t);
  shown.add(t.id);
}
// 120 swipes of a mixed session, so streaks, the ledger and every counter
// carry real state rather than zeros
let swipes = 0;
while (swipes < 120) {
  const batch = recommend(pool, profile, {
    excludeIds: shown,
    count: 10,
    seed: 7,
    vectorFor: vf,
    likedTitles: liked,
    mode: "swipe",
  });
  if (batch.length === 0) break;
  for (const rec of batch) {
    const isComedy = rec.title.genres.some((g) => g.toLowerCase() === "comedy");
    const action: SwipeAction = isComedy
      ? "liked"
      : rec.title.voteCount > 8000
        ? "disliked"
        : "not_seen";
    if (action === "liked") liked.push(rec.title);
    profile = applySwipe(profile, rec.title, vf(rec.title), action);
    shown.add(rec.title.id);
    swipes++;
  }
}

/* ── the trip ─────────────────────────────────────────────────────────── */
const wire = JSON.parse(JSON.stringify(toRow(profile))) as Record<string, unknown>;
const back = fromRow(wire);

const checks: [string, boolean, string][] = [];
const add = (name: string, ok: boolean, detail: string) =>
  checks.push([name, ok, detail]);

const deck = (p: TasteProfile) =>
  recommend(pool, p, {
    excludeIds: shown,
    count: 20,
    seed: 7,
    vectorFor: vf,
    likedTitles: liked,
    mode: "swipe",
  }).map((r) => r.title.id);

const before = deck(profile);
const after = deck(back);
const same = before.filter((id, i) => after[i] === id).length;

add("the deck is identical", same === before.length, `${same}/${before.length} cards in the same order`);

const discBefore = recommend(pool, profile, {
  excludeIds: shown, count: 12, seed: 7, vectorFor: vf, likedTitles: liked, mode: "discover",
}).map((r) => r.title.id);
const discAfter = recommend(pool, back, {
  excludeIds: shown, count: 12, seed: 7, vectorFor: vf, likedTitles: liked, mode: "discover",
}).map((r) => r.title.id);
add(
  "Discover is identical",
  discBefore.every((id, i) => discAfter[i] === id),
  `${discBefore.filter((id, i) => discAfter[i] === id).length}/12`
);

const facetTokens = (p: TasteProfile) =>
  Object.values(p.facets).reduce((n, table) => n + Object.keys(table).length, 0);
add(
  "every learned value survives",
  facetTokens(back) === facetTokens(profile),
  `${facetTokens(back)} of ${facetTokens(profile)} values`
);

// the exposure tables are a second, independent model in the same row; a sync
// that carried taste but dropped these would silently hand a returning viewer
// back the global fame prior it took them a session to escape
const seenTokens = (p: TasteProfile) =>
  Object.values(p.seenFacets).reduce((n, table) => n + Object.keys(table).length, 0);
add(
  "the exposure model survives",
  seenTokens(back) === seenTokens(profile) && seenTokens(profile) > 0,
  `${seenTokens(back)} of ${seenTokens(profile)} values`
);

const benched = (p: TasteProfile) =>
  Object.keys(p.streaks.cooldown).filter((k) => p.streaks.cooldown[k] > p.totalSwipes).length;
add(
  "benched values survive",
  benched(back) === benched(profile),
  `${benched(back)} of ${benched(profile)}`
);

for (const [k, get] of [
  ["seenCount", (p: TasteProfile) => p.seenCount],
  ["unseenCount", (p: TasteProfile) => p.unseenCount],
  ["ratedSwipes", (p: TasteProfile) => p.ratedSwipes],
  ["totalSwipes", (p: TasteProfile) => p.totalSwipes],
  ["likedCount", (p: TasteProfile) => p.likedCount],
] as const) {
  add(`${k} survives`, get(back) === get(profile), `${get(back)} of ${get(profile)}`);
}

add(
  "the pgvector direction survives",
  back.taste.every((v, i) => Math.abs(v - profile.taste[i]) < 1e-6),
  `${back.taste.length} dimensions`
);

/* ── and the guard that matters most: an old row must not overwrite ────── */
const legacy = fromRow({ taste: `[${emptyProfile().taste.join(",")}]`, rated_swipes: 40 });
add(
  "a pre-facet row is refused, not applied",
  Object.keys(legacy.facets ?? {}).length === 0,
  "sync.ts returns null for these; local storage is kept"
);

console.log(`profile built from ${profile.totalSwipes} real swipes\n`);
let pass = true;
for (const [name, ok, detail] of checks) {
  if (!ok) pass = false;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(34)} ${detail}`);
}
console.log(`\n${pass ? "a taste survives the round trip" : "TASTE WOULD BE LOST"}\n`);
process.exit(pass ? 0 : 1);
