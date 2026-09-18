/**
 * WHICH TITLES DOES THE DECK CONSIDER AND NEVER DEAL?
 *
 *   npx tsx scripts/lost-titles.ts
 *   USERS=60 CARDS=500 npx tsx scripts/lost-titles.ts
 *   MODE=grid npx tsx scripts/lost-titles.ts
 *
 * `harvest.ts` has reported "LOST AT RANKING ~54%" for a month. That number
 * says a title was in the candidate pool, the scorer looked at it, and it was
 * never dealt — the loss is ours and no gate work can touch it. Four separate
 * attempts to move it by reweighting the ranking all failed.
 *
 * Every one of those attempts changed a number and re-read an average. Nobody
 * has ever looked at *the titles themselves*. That is what this does.
 *
 * WHY IT IS WORTH A DAY BEFORE ANY OF THE ENGINE WORK. The proposed fix is to
 * stop treating the catalog as one ranked list and start treating it as
 * thousands of regions — dig where the person's history is dense, cool down
 * where it is not. That design assumes the lost titles CLUSTER: that they are
 * concentrated somewhere the deck stopped visiting.
 *
 * If they do, the region model is the right shape and is worth two weeks.
 * If the lost set is statistically indistinguishable from the found set, then
 * nothing about *where* the deck looked explains the loss, the region model
 * would be built on a false premise, and the honest answer is that a session
 * has a budget and the product should lean on import and the grid instead.
 *
 * So this prints one comparison — found versus lost, on every axis the engine
 * can actually see — and the answer decides the next two weeks.
 *
 * Reads the same catalog the site ships (`scripts/lib/catalog.ts`) and the same
 * MovieLens histories as `harvest.ts`, and runs the identical session loop, so
 * the population it dissects is the population that produced the 54%.
 */
import { readFileSync } from "node:fs";
import { loadFullCatalog } from "./lib/catalog";
import {
  fameGate,
  fameTierSize,
  resetExposureDebt,
  recommend,
  watchedGrid,
  type CandidateItem,
} from "../src/lib/engine/recommend";
import { applySwipe, emptyProfile } from "../src/lib/engine/taste";
import { buildRarityIndex } from "../src/lib/engine/facets";
import { featurize } from "../src/lib/engine/features";
import type { SwipeAction, Title } from "../src/lib/types";

const USERS = Number(process.env.USERS ?? 40);
const CARDS = Number(process.env.CARDS ?? 500);
const BLOCK = Number(process.env.BLOCK ?? 50);
const MODE = process.env.MODE ?? "deck";
const GRID = Number(process.env.GRID ?? 40);
const OPENING = Number(process.env.OPENING ?? 8);

const catalog = loadFullCatalog();
buildRarityIndex(catalog);
const byId = new Map(catalog.map((t) => [t.id, t]));
const pool: CandidateItem[] = catalog.map((title) => ({ title }));

const vecCache = new Map<string, Float32Array>();
const vf = (t: Title) => {
  let v = vecCache.get(t.id);
  if (!v) {
    v = featurize(t);
    vecCache.set(t.id, v);
  }
  return v;
};

/** fame rank, the axis the gate actually orders by */
const byFame = [...catalog].sort((a, b) => b.voteCount - a.voteCount);
const fameRank = new Map(byFame.map((t, i) => [t.id, i + 1]));

const histories = JSON.parse(readFileSync(".cache/histories.json", "utf8")) as Record<
  string,
  [string, number][]
>;
const users = Object.entries(histories).slice(0, USERS);

/** one row per title of a person's history that the gate admitted */
interface Row {
  id: string;
  found: boolean;
  fame: number;
  lang: string;
  tv: boolean;
  year: number;
  genre: string;
  degree: number;
  /** which block the session was in when the gate first admitted it */
  firstReachedBlock: number;
}
const rows: Row[] = [];

for (const [, history] of users) {
  const seen = new Map<string, number>();
  for (const [id, rating] of history) if (byId.has(id)) seen.set(id, rating);

  /* module-scope session state: one person must not inherit another's debt */
  resetExposureDebt();

  let profile = emptyProfile();
  const shown = new Set<string>();
  const liked: Title[] = [];
  const disliked: Title[] = [];
  const neutral: Title[] = [];
  /** title -> the block in which the gate first held it */
  const reachedAt = new Map<string, number>();

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

  let cards = 0;
  while (cards < CARDS) {
    const batch: Title[] =
      MODE === "grid"
        ? watchedGrid(pool, profile, {
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
            seenTitles: neutral,
            mode: "swipe",
          }).map((r) => r.title);
    if (batch.length === 0) break;

    if (cards % BLOCK === 0) {
      const block = Math.floor(cards / BLOCK);
      for (const c of fameGate(pool, fameTierSize(profile, "swipe"), profile.facets, profile)) {
        if (!reachedAt.has(c.title.id)) reachedAt.set(c.title.id, block);
      }
    }

    for (const title of batch) {
      if (cards >= CARDS) break;
      const rating = seen.get(title.id);
      const action: SwipeAction =
        rating === undefined
          ? "not_seen"
          : MODE === "grid"
            ? "seen"
            : rating >= 4
              ? "liked"
              : rating >= 3
                ? "seen"
                : "disliked";
      if (action === "liked") liked.push(title);
      else if (action === "disliked") disliked.push(title);
      else if (action === "seen") neutral.push(title);
      profile = applySwipe(profile, title, vf(title), action);
      shown.add(title.id);
      cards++;
    }
  }

  /* THE SET THIS FILE EXISTS FOR: in their history, the gate held it, and the
     ranking never dealt it. Titles the gate never admitted are a different
     problem (retrieval) and are excluded — mixing them would let a gate
     failure masquerade as a ranking failure, which is the confusion this whole
     decomposition was built to prevent. */
  for (const id of seen.keys()) {
    const block = reachedAt.get(id);
    if (block === undefined) continue;
    const t = byId.get(id)!;
    rows.push({
      id,
      found: shown.has(id),
      fame: fameRank.get(id) ?? catalog.length,
      lang: t.originalLanguage ?? "??",
      tv: t.type === "tv",
      year: t.year ?? 0,
      genre: t.genres?.[0] ?? "—",
      degree: t.related?.length ?? 0,
      firstReachedBlock: block,
    });
  }
}

/* ── reporting ── */
const found = rows.filter((r) => r.found);
const lost = rows.filter((r) => !r.found);

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "—");

console.log(
  `\n${users.length} real people · ${CARDS} cards each · ${MODE}\n` +
    `\n  ${rows.length} titles of their histories were admitted by the gate\n` +
    `  ${found.length} dealt (${pct(found.length, rows.length)})  ·  ` +
    `${lost.length} considered and never dealt (${pct(lost.length, rows.length)})\n`
);

console.log("  ── is the lost set different from the found set? ──\n");
const line = (label: string, f: string, l: string, verdict: string) =>
  console.log(`  ${label.padEnd(26)}${f.padStart(12)}${l.padStart(12)}   ${verdict}`);

console.log(`  ${"".padEnd(26)}${"FOUND".padStart(12)}${"LOST".padStart(12)}`);

const fFame = median(found.map((r) => r.fame));
const lFame = median(lost.map((r) => r.fame));
line(
  "median fame rank",
  String(fFame),
  String(lFame),
  lFame > fFame * 1.5 ? "◀ LOST ARE FAR MORE OBSCURE" : lFame > fFame * 1.15 ? "◀ lost skew obscure" : "same"
);

const fDeg = mean(found.map((r) => r.degree));
const lDeg = mean(lost.map((r) => r.degree));
line(
  "mean co-watch links",
  fDeg.toFixed(1),
  lDeg.toFixed(1),
  Math.abs(fDeg - lDeg) / Math.max(fDeg, 1) > 0.15 ? "◀ differ" : "same"
);

/* MovieLens has no television at all, so both sides of this row are
   structurally 0% and it says nothing about the product. It is printed anyway,
   as the caveat rather than as a finding: every number on this page describes
   films only, and the catalog is 29% series. */
const fTv = found.filter((r) => r.tv).length / Math.max(found.length, 1);
const lTv = lost.filter((r) => r.tv).length / Math.max(lost.length, 1);
line(
  "share television",
  `${(100 * fTv).toFixed(1)}%`,
  `${(100 * lTv).toFixed(1)}%`,
  fTv === 0 && lTv === 0 ? "◀ MovieLens has no TV — films only" : "—"
);

const fEn = found.filter((r) => r.lang === "en").length / Math.max(found.length, 1);
const lEn = lost.filter((r) => r.lang === "en").length / Math.max(lost.length, 1);
line("share English", `${(100 * fEn).toFixed(1)}%`, `${(100 * lEn).toFixed(1)}%`, "—");

line("median year", String(median(found.map((r) => r.year))), String(median(lost.map((r) => r.year))), "—");

/* THE CLUSTERING QUESTION, ASKED DIRECTLY.
   If the lost titles are concentrated in some genres and absent from others,
   a region model has something to grip. If every genre loses the same share,
   there is no region to find. */
console.log("\n  ── where the loss concentrates, by genre ──\n");
const genres = new Map<string, { f: number; l: number }>();
for (const r of rows) {
  const g = genres.get(r.genre) ?? { f: 0, l: 0 };
  if (r.found) g.f++;
  else g.l++;
  genres.set(r.genre, g);
}
const ranked = [...genres.entries()]
  .filter(([, g]) => g.f + g.l >= 30)
  .map(([g, { f, l }]) => ({ g, n: f + l, rate: l / (f + l) }))
  .sort((a, b) => b.rate - a.rate);

for (const g of [...ranked.slice(0, 5), null, ...ranked.slice(-5)]) {
  if (!g) {
    console.log(`  ${"…".padEnd(20)}`);
    continue;
  }
  const bar = "█".repeat(Math.round(g.rate * 30));
  console.log(`  ${g.g.padEnd(20)}${(100 * g.rate).toFixed(1).padStart(6)}% lost  ${bar}  (n=${g.n})`);
}

const spread = ranked.length > 1 ? ranked[0].rate - ranked[ranked.length - 1].rate : 0;

/* Does the loss depend on WHEN the gate first admitted a title? A title that
   only became reachable at card 400 has had 100 cards of chances; one
   reachable from card 0 has had 500. If late-admitted titles dominate the
   lost set, the loss is a budget problem, not a ranking one. */
console.log("\n  ── when the gate first admitted it ──\n");
const blocks = new Map<number, { f: number; l: number }>();
for (const r of rows) {
  const b = blocks.get(r.firstReachedBlock) ?? { f: 0, l: 0 };
  if (r.found) b.f++;
  else b.l++;
  blocks.set(r.firstReachedBlock, b);
}
for (const [b, { f, l }] of [...blocks.entries()].sort((a, b2) => a[0] - b2[0]).slice(0, 8)) {
  console.log(
    `  admitted in block ${String(b).padStart(2)}  ${pct(l, f + l).padStart(6)} lost   (n=${f + l})`
  );
}

console.log(
  `\n  ── verdict ──\n\n` +
    `  Genre loss-rate spread: ${(100 * spread).toFixed(1)} points ` +
    `(${ranked.length ? ranked[0].g : "—"} worst, ${ranked.length ? ranked[ranked.length - 1].g : "—"} best)\n` +
    `  Fame ratio lost/found:  ${(lFame / Math.max(fFame, 1)).toFixed(2)}×\n\n` +
    (spread > 0.15 || lFame > fFame * 1.5
      ? `  THE LOST SET IS STRUCTURALLY DIFFERENT. A region model has something\n` +
        `  to grip: the loss is concentrated, not spread evenly. Phase D as designed.\n`
      : `  THE LOST SET LOOKS LIKE THE FOUND SET. Nothing about *where* the deck\n` +
        `  looked explains the loss — a region model would be built on a premise\n` +
        `  this data does not support. Reconsider Phase D before building it.\n`)
);
