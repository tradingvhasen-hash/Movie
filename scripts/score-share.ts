/**
 * WHAT ACTUALLY DECIDES A CARD — as a share, not as a constant.
 *
 *   npx tsx scripts/score-share.ts
 *
 * The user asked for the percentage each mechanism contributes. The weights in
 * `recommend.ts` cannot answer that: they multiply quantities on different
 * scales, so a weight of 1.6 next to a weight of 0.8 says nothing about which
 * one moved the card to the top.
 *
 * The honest measure is how much of the *spread* each term explains — the
 * variance of that term's contribution across the candidates being ranked,
 * as a share of the total. A term that is large but identical on every card
 * decides nothing; a term that is small but varies decides a great deal.
 *
 * Run on a real profile replayed from a real session, at several points in it,
 * because the answer changes as the tables fill: with no swipes the fame prior
 * is all there is, and by card 400 the taste tables should be carrying it.
 */
import { readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { featurize, qualityPrior, reachPrior } from "../src/lib/engine/features";
import {
  fameGate,
  fameTierSize,
  walkBonus,
  type CandidateItem,
} from "../src/lib/engine/recommend";
import { applySwipe, emptyProfile, watchLikelihood } from "../src/lib/engine/taste";
import { buildRarityIndex, facetScore, titleTokens } from "../src/lib/engine/facets";
import type { SwipeAction, Title } from "../src/lib/types";

const catalog = decodeCatalog(
  JSON.parse(readFileSync("public/catalog.json", "utf8")) as EncodedCatalog
);
const pool: CandidateItem[] = catalog.map((title) => ({ title }));
buildRarityIndex(catalog);
const byId = new Map(catalog.map((t) => [t.id, t]));

const vecs = new Map<string, Float32Array>();
const vf = (t: Title) => {
  let v = vecs.get(t.id);
  if (!v) {
    v = featurize(t);
    vecs.set(t.id, v);
  }
  return v;
};

const d = JSON.parse(readFileSync(process.env.FILE ?? ".cache/user-swipes-v5.json", "utf8"));
const session = (Array.isArray(d) ? d : d.swipes) as { id: string; a: SwipeAction }[];

const variance = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
};

console.log(
  `\n  share of the spread each term explains, on the cards the deck was ranking\n` +
    `  (variance of the term across candidates, as a share of the total)\n`
);
console.log("  after      taste   co-watch   have-you-seen-it   quality   tie-break");

let profile = emptyProfile();
const likedSoFar: Title[] = [];
const checkpoints = new Set([0, 40, 150, 400, 800, 1099]);
for (let i = 0; i < session.length; i++) {
  if (checkpoints.has(i)) {
    const gated = fameGate(pool, fameTierSize(profile), profile.facets, profile).slice(0, 1500);
    // the real random walk over the co-watch graph, from everything liked so
    // far — not an approximation from raw edge counts, which is what the first
    // version of this script used and got wrong
    const walk = walkBonus(pool, likedSoFar);
    const terms: Record<string, number[]> = {
      taste: [],
      cowatch: [],
      seen: [],
      quality: [],
      jitter: [],
    };
    const conf = Math.min(1, (profile.seenCount + profile.unseenCount) / 20);
    for (const c of gated) {
      const tk = titleTokens(c.title);
      terms.taste.push(conf * 1.6 * facetScore(profile.facets, profile.facetWeights, tk).total);
      terms.cowatch.push(0.8 * (walk.get(c.title.id)?.score ?? 0));
      terms.seen.push(
        (profile.totalSwipes < 20 ? 0.9 : 0.55) *
          watchLikelihood(profile, tk, reachPrior(c.title))
      );
      terms.quality.push(0.25 * qualityPrior(c.title.rating, c.title.voteCount));
      terms.jitter.push(0.09 * 0.29);
    }
    const v = Object.fromEntries(
      Object.entries(terms).map(([k, xs]) => [k, variance(xs)])
    ) as Record<string, number>;
    const total = Object.values(v).reduce((a, b) => a + b, 0) || 1;
    const p = (k: string) => `${((v[k] / total) * 100).toFixed(0)}%`.padStart(6);
    console.log(
      `  ${String(i).padStart(5)} cards ${p("taste")}   ${p("cowatch")}` +
        `           ${p("seen")}    ${p("quality")}      ${p("jitter")}`
    );
  }
  const t = byId.get(session[i].id);
  if (t) {
    profile = applySwipe(profile, t, vf(t), session[i].a);
    if (session[i].a === "liked") likedSoFar.push(t);
  }
}
console.log();
