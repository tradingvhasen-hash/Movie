/**
 * DOES THE ENGINE KNOW WHAT HE HAS WATCHED? MEASURED, ON DATA IT DID NOT PICK.
 *
 *   npx tsx scripts/exposure-auc.ts
 *
 * `watchLikelihood` is the one model that decides whether the product's goal is
 * reachable. Every card the deck deals is a bet on it, and the goal — get a
 * person's whole watch history into the site inside a week — is nothing but
 * that bet repeated a few thousand times.
 *
 * It has never been measured on honest data. The one number this project has,
 * AUC 0.500 for the fame prior, came off a sample truncated by fame, where
 * range restriction drives AUC to 0.5 mechanically. That measurement could not
 * have come out any other way, so it says nothing.
 *
 * This one can. Two sources, and the split between them is the whole design:
 *
 *   TRAIN   1,826 titles the deck dealt him across six sessions, with his
 *           answers. Biased by construction — the engine chose every one.
 *   TEST    599 titles drawn at random from every depth of the catalog by
 *           `/calibrate`, with his answers. Nothing here was ranked, gated,
 *           scored or personalised. **The engine did not choose this set.**
 *
 * Training on the biased set and testing on the unbiased one is the only way
 * to ask "does this model generalise beyond the region it was fitted in",
 * which is precisely the question the decaying tail of his session poses.
 *
 * Titles present in both are dropped from **training**, not from the test set:
 * scoring the model on answers it was trained on measures memory rather than
 * prediction, and dropping them from the test instead would throw away
 * two-thirds of the positives — 30 of them is already a thin base.
 *
 * AUC here is the probability that a title he HAS watched scores above one he
 * has NOT, drawn at random. 0.5 is a coin flip. It is the right measure because
 * it is invariant to the base rate, and his base rate is 5%.
 */
import { readFileSync, existsSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { buildRarityIndex, titleTokens } from "../src/lib/engine/facets";
import { featurize } from "../src/lib/engine/features";
import { applySwipe, emptyProfile, watchLikelihood, seenTrust } from "../src/lib/engine/taste";
import type { SwipeAction, Title } from "../src/lib/types";
import { loadFullCatalog } from "./lib/catalog";

const catalog = loadFullCatalog();
buildRarityIndex(catalog);
const byId = new Map(catalog.map((t) => [t.id, t]));

/** the fame prior exactly as `recommend` computes it, so this grades what ships */
const ranked = [...catalog].sort((a, b) => b.voteCount - a.voteCount);
const fameRank = new Map(ranked.map((t, i) => [t.id, i + 1]));

type Row = { id: string; a: SwipeAction; at: number };
type Cal = { id: string; seen: boolean };

const SESSIONS = [
  ".cache/user-swipes.json",
  ".cache/user-swipes-v2.json",
  ".cache/user-swipes-v3.json",
  ".cache/user-swipes-v4.json",
  ".cache/user-swipes-v5.json",
  ".cache/user-swipes-v6.json",
].filter(existsSync);

const CAL = [
  ".cache/calibration-199.json",
  ".cache/calibration-200-v2.json",
  ".cache/calibration-200-v3.json",
].filter(existsSync);

/* ── test: the blind sample, whole ── */
const cal: Cal[] = CAL.flatMap((f) => (JSON.parse(readFileSync(f, "utf8")) as { sample: Cal[] }).sample);
const test = cal.filter((r) => byId.has(r.id));
const testIds = new Set(test.map((r) => r.id));

/* ── train: every answer he has ever given a card, minus the test set ── */
const latest = new Map<string, { action: SwipeAction; at: number }>();
for (const f of SESSIONS) {
  const raw = JSON.parse(readFileSync(f, "utf8")) as { swipes?: Row[] } | Row[];
  for (const r of Array.isArray(raw) ? raw : (raw.swipes ?? [])) {
    const prev = latest.get(r.id);
    if (!prev || r.at > prev.at) latest.set(r.id, { action: r.a, at: r.at });
  }
}
const train: { title: Title; action: SwipeAction; at: number }[] = [];
let overlap = 0;
for (const [id, v] of latest) {
  if (testIds.has(id)) {
    overlap++;
    continue;
  }
  const t = byId.get(id);
  if (t) train.push({ title: t, action: v.action, at: v.at });
}
train.sort((a, b) => a.at - b.at);

const pos = test.filter((r) => r.seen).length;
console.log(
  `\nTRAIN  ${train.length} titles the deck dealt him across six sessions,` +
    `\n       after removing ${overlap} that also appear in the blind sample`
);
console.log(`TEST   ${test.length} titles from the blind sample — the engine chose none of them`);
console.log(`       of which ${pos} he has watched (${((100 * pos) / test.length).toFixed(1)}%)\n`);

/** area under the ROC curve, by rank-sum — no binning, no threshold */
function auc(scored: { score: number; label: boolean }[]): number {
  const sorted = [...scored].sort((a, b) => a.score - b.score);
  let rank = 0;
  let sumPos = 0;
  let nPos = 0;
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j < sorted.length && sorted[j].score === sorted[i].score) j++;
    const avgRank = (i + j + 1) / 2; // 1-based, ties share the average
    for (let k = i; k < j; k++) {
      rank++;
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

/**
 * Build the profile from the first `n` training answers, then score the whole
 * held-out set. Sweeping n shows whether more of his answers make the model
 * better — which is the claim the whole personalised gate rests on.
 */
function evaluate(n: number) {
  let profile = emptyProfile();
  for (const r of train.slice(0, n)) {
    profile = applySwipe(profile, r.title, featurize(r.title), r.action);
  }
  const trust = seenTrust(profile);
  const rows = test.map((r) => {
    const t = byId.get(r.id)!;
    const rank = fameRank.get(r.id)!;
    /* the same shape `recommend` uses: a fame prior in [0,1], famous = high */
    const fame = 1 - rank / catalog.length;
    return {
      fame,
      model: watchLikelihood(profile, titleTokens(t), fame),
      label: r.seen,
    };
  });
  return {
    n,
    trust,
    fame: auc(rows.map((r) => ({ score: r.fame, label: r.label }))),
    model: auc(rows.map((r) => ({ score: r.model, label: r.label }))),
  };
}

console.log("  answers trained on   seenTrust    AUC fame only    AUC watchLikelihood");
for (const n of [0, 50, 100, 200, 400, 800, 1200, train.length]) {
  if (n > train.length) continue;
  const r = evaluate(n);
  const delta = r.model - r.fame;
  console.log(
    `  ${String(r.n).padStart(18)}   ${r.trust.toFixed(3).padStart(8)}    ` +
      `${r.fame.toFixed(3).padStart(12)}    ${r.model.toFixed(3).padStart(18)}` +
      `   ${delta >= 0 ? "+" : ""}${delta.toFixed(3)}`
  );
}

console.log(
  `\n  AUC 0.5 is a coin flip. Above 0.5 means a title he has watched tends to` +
    `\n  score above one he has not — which is the only thing the deck needs.\n`
);

/* ══════════════════════════════════════════════════════════════════════════
 * Every exposure signal in the catalog, on the same unbiased set.
 *
 * The blend above is worth +0.011 over fame. Before trying to improve the
 * blend it is worth knowing whether any *other* column predicts better than
 * the vote count does, because if one does then the engine is built on the
 * wrong prior and no amount of blending fixes that.
 *
 * `reach` is here because it was commissioned specifically to replace the vote
 * count, on the strength of the AUC 0.500 finding that this file has just
 * shown to be an artefact. It costs nothing to ask whether it was needed.
 * ═════════════════════════════════════════════════════════════════════════ */
let profile = emptyProfile();
for (const r of train) profile = applySwipe(profile, r.title, featurize(r.title), r.action);

/** how strongly a title is linked, by TMDB co-watch edges, to what he has watched */
const watchedIds = new Set(train.filter((r) => r.action !== "not_seen").map((r) => r.title.id));
const coWatch = (t: Title) => (t.related ?? []).filter((id) => watchedIds.has(id)).length;
/** and the reverse direction, which is the one that carries most of the graph */
const inbound = new Map<string, number>();
for (const t of catalog) {
  if (!watchedIds.has(t.id)) continue;
  for (const id of t.related ?? []) inbound.set(id, (inbound.get(id) ?? 0) + 1);
}

const signals: [string, (t: Title) => number][] = [
  ["vote count (what ships)", (t) => t.voteCount],
  ["reach (LLM estimate)", (t) => t.reach ?? -1],
  ["popularity", (t) => t.popularity],
  ["rating", (t) => t.rating],
  ["personal seen-facets only", (t) => seenScoreOf(t)],
  ["co-watch edges out", (t) => coWatch(t)],
  ["co-watch edges in", (t) => inbound.get(t.id) ?? 0],
  ["co-watch, either way", (t) => coWatch(t) + (inbound.get(t.id) ?? 0)],
];

function seenScoreOf(t: Title): number {
  /* watchLikelihood with the prior held flat isolates the personal half */
  return watchLikelihood(profile, titleTokens(t), 0);
}

/**
 * THIRTY POSITIVES. SAY THE INTERVAL OR SAY NOTHING.
 *
 * This project has tuned against a ruler that could not resolve the difference
 * it was being asked about five separate times. The test set here has 30
 * titles he has watched, and an AUC gap of 0.03 on 30 positives is well inside
 * the noise. So every number below carries a bootstrap interval, resampling
 * the test set 2,000 times, and any comparison whose intervals overlap is not
 * a finding — it is a coin landing.
 */
function bootstrapAuc(rows: { score: number; label: boolean }[], draws = 2000) {
  const out: number[] = [];
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 0x100000000);
  for (let d = 0; d < draws; d++) {
    const pick: typeof rows = [];
    for (let i = 0; i < rows.length; i++) pick.push(rows[Math.floor(rnd() * rows.length)]);
    if (pick.some((r) => r.label) && pick.some((r) => !r.label)) out.push(auc(pick));
  }
  out.sort((a, b) => a - b);
  return [out[Math.floor(out.length * 0.025)], out[Math.floor(out.length * 0.975)]] as const;
}

console.log("  EVERY EXPOSURE SIGNAL, SAME UNBIASED TEST SET");
console.log("    signal                        AUC    95% interval     covers");
for (const [name, fn] of signals) {
  const rows = test.map((r) => ({ score: fn(byId.get(r.id)!), label: r.seen }));
  const usable = rows.filter((r) => r.score >= 0);
  const covered = usable.length;
  if (covered === 0) {
    console.log(`    ${name.padEnd(28)}   —    absent from the catalog        0%`);
    continue;
  }
  const a = auc(usable);
  const [lo, hi] = bootstrapAuc(usable);
  console.log(
    `    ${name.padEnd(28)} ${a.toFixed(3)}   ${lo.toFixed(3)} – ${hi.toFixed(3)}     ` +
      `${((100 * covered) / rows.length).toFixed(0)}%` +
      (name.startsWith("vote") ? "   <- the prior the gate is built on" : "")
  );
}
console.log(
  `\n  Intervals that overlap are not a ranking. On ${pos} positives, only a gap` +
    `\n  wider than about 0.10 is worth acting on.\n`
);
