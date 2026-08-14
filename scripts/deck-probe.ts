/**
 * What does the SWIPE DECK actually show?
 *
 *   npx tsx scripts/deck-probe.ts "Brooklyn Nine-Nine"
 *
 * Every ruler in this repo grades Discover. The deck — the screen people
 * actually spend their time on — was never graded at all, and its share of the
 * recommendation graph was set from the robot-persona benchmark, the one
 * instrument we already know has the least authority.
 *
 * This prints the next twenty cards after a single like, so the question
 * "I like this, why are you showing me that?" can be answered directly.
 */
import { readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { featurize } from "../src/lib/engine/features";
import { recommend, type CandidateItem } from "../src/lib/engine/recommend";
import { applySwipe, emptyProfile } from "../src/lib/engine/taste";
import { buildRarityIndex } from "../src/lib/engine/facets";
import type { Title } from "../src/lib/types";

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

const names = process.argv.slice(2);
if (names.length === 0) names.push("Brooklyn Nine-Nine");

const liked: Title[] = [];
for (const n of names) {
  const t = catalog.find((x) => x.title.en.toLowerCase() === n.toLowerCase());
  if (!t) {
    console.log(`not in catalog: ${n}`);
    process.exit(1);
  }
  liked.push(t);
}

let p = emptyProfile();
for (const t of liked) p = applySwipe(p, t, vf(t), "liked");

for (const mode of ["swipe", "discover"] as const) {
  const recs = recommend(pool, p, {
    excludeIds: new Set(liked.map((t) => t.id)),
    count: 20,
    seed: 7,
    vectorFor: vf,
    likedTitles: liked,
    mode,
  });
  console.log(`\n${mode.toUpperCase()} — after liking ${names.join(", ")}`);
  recs.forEach((r, i) =>
    console.log(
      `  ${String(i + 1).padStart(2)}. ${r.title.title.en} (${r.title.year})` +
        `  ${r.match}%  ${r.reasons.map((x) => x.label).join(" · ")}`
    )
  );
}
