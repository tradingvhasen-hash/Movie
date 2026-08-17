/**
 * WHAT MADE THESE APPEAR NOW, AND NOT BEFORE?
 *
 *   npx tsx scripts/why-new.ts
 *
 * After the gate work, 61 of the 283 titles he liked in a 1,100-card session
 * were works he had never been shown once across four earlier sessions — and
 * they sit at film ranks 3,400 to 4,900, which the old gate could not reach at
 * any session length. He asked the right question about them: not "are they
 * good", but **which change let them through**, so it can be made larger.
 *
 * This replays his real session card by card and records, at every step, the
 * union of everything the gate admitted — under the old constants and the new
 * ones. A title he liked is then in exactly one of three states:
 *
 *     reachable before   the gate always allowed it; the ranking was the
 *                        reason he never saw it
 *     opened by the gate the old gate never admitted it at any point, the new
 *                        one does — this is the change, measured
 *     still unreachable  neither admits it; it arrived some other way
 *
 * The point is not the score. The point is attribution: three things shipped
 * together (a floor that grows with the session, a ceiling raised from 3,000
 * to 6,000, and a catalog 2,257 titles larger) and only one of them can be
 * made bigger safely.
 */
import { readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { featurize } from "../src/lib/engine/features";
import { fameGate, fameTierSize, type CandidateItem } from "../src/lib/engine/recommend";
import { applySwipe, emptyProfile } from "../src/lib/engine/taste";
import { buildRarityIndex } from "../src/lib/engine/facets";
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

type Row = { id: string; a: SwipeAction };
const load = (f: string): Row[] => {
  const d = JSON.parse(readFileSync(f, "utf8"));
  return (Array.isArray(d) ? d : d.swipes) as Row[];
};

const session = load(process.env.FILE ?? ".cache/user-swipes-v5.json");
const earlier = new Set<string>();
for (const f of [
  ".cache/user-swipes.json",
  ".cache/user-swipes-v2.json",
  ".cache/user-swipes-v3.json",
  ".cache/user-swipes-v4.json",
]) {
  for (const r of load(f)) earlier.add(r.id);
}

/**
 * Replay the session and collect the union of what the gate ever held.
 *
 * Sampled every SAMPLE cards rather than every card: the gate is a monotone
 * function of the profile within a run of identical answers, and calling it
 * 1,100 times over a pool of 15,083 takes minutes for a number that does not
 * change between neighbouring cards.
 */
const SAMPLE = 25;
function reachable(): Set<string> {
  let profile = emptyProfile();
  const seen = new Set<string>();
  for (let i = 0; i < session.length; i++) {
    const r = session[i];
    const t = byId.get(r.id);
    if (i % SAMPLE === 0) {
      const gated = fameGate(pool, fameTierSize(profile), profile.facets, profile);
      for (const c of gated) seen.add(c.title.id);
    }
    if (t) profile = applySwipe(profile, t, vf(t), r.a);
  }
  const gated = fameGate(pool, fameTierSize(profile), profile.facets, profile);
  for (const c of gated) seen.add(c.title.id);
  return seen;
}

const liked = session.filter((r) => r.a === "liked").map((r) => r.id);
const fresh = liked.filter((id) => !earlier.has(id));

const reach = reachable();
console.log(
  `\n  ${session.length} cards replayed · ${liked.length} liked · ` +
    `${fresh.length} of them never shown in the four earlier sessions\n`
);
console.log(
  `  the gate held ${reach.size} distinct titles at some point during the session ` +
    `(${((reach.size / catalog.length) * 100).toFixed(1)}% of the catalog)\n`
);

const inGate = fresh.filter((id) => reach.has(id)).length;
console.log(
  `  of the ${fresh.length} newly-liked works, ${inGate} are inside this gate\n` +
    `  Run again with TIER_FLOOR_PER=1 TIER_FLOOR_BASE=300 TIER_MAX=3000 for the old one.\n`
);

/** where they sit, so the shape of the opening is visible rather than asserted */
const films = catalog.filter((t) => t.type !== "tv").sort((a, b) => b.voteCount - a.voteCount);
const rankOf = new Map(films.map((t, i) => [t.id, i]));
const bands: [string, number, number][] = [
  ["top 500", 0, 500],
  ["500-1,500", 500, 1500],
  ["1,500-3,000", 1500, 3000],
  ["3,000-5,000", 3000, 5000],
  ["5,000+", 5000, 1e9],
];
console.log("  where his likes sit in the film fame order\n");
console.log("  band            liked total   of them new");
for (const [name, lo, hi] of bands) {
  const inBand = liked.filter((id) => {
    const r = rankOf.get(id);
    return r !== undefined && r >= lo && r < hi;
  });
  const newInBand = inBand.filter((id) => !earlier.has(id)).length;
  console.log(
    `  ${name.padEnd(15)} ${String(inBand.length).padStart(5)}   ` +
      `${String(newInBand).padStart(9)}   ${"#".repeat(newInBand)}`
  );
}
console.log();
