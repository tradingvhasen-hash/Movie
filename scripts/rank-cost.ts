/**
 * WHERE THE RE-RANK ACTUALLY SPENDS ITS TIME.
 *
 *   npx tsx scripts/rank-cost.ts
 *
 * `simulate` has one guard on this and it reports a single number, which is
 * enough to tell you a rebuild got slower and nothing at all about why. The
 * cost matters more than it used to for two reasons that both landed today:
 * the catalog grew from 12,826 titles to 15,083, and the gate's floor now
 * widens with the session instead of staying a constant 300 titles ahead.
 *
 * This times a rebuild at several session lengths, so growth in the catalog
 * (which moves every rebuild equally) can be told apart from growth in the
 * gate (which only shows up later in a session).
 */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { featurize } from "../src/lib/engine/features";
import { recommend, fameTierSize, type CandidateItem } from "../src/lib/engine/recommend";
import { applySwipe, emptyProfile, type TasteProfile } from "../src/lib/engine/taste";
import { buildRarityIndex } from "../src/lib/engine/facets";
import type { Title } from "../src/lib/types";

const catalog = decodeCatalog(
  JSON.parse(readFileSync("public/catalog.json", "utf8")) as EncodedCatalog
);
const pool: CandidateItem[] = catalog.map((title) => ({ title }));
buildRarityIndex(catalog);

const vecCache = new Map<string, Float32Array>();
const vectorFor = (t: Title) => {
  let v = vecCache.get(t.id);
  if (!v) {
    v = featurize(t);
    vecCache.set(t.id, v);
  }
  return v;
};
const hasGenre = (t: Title, g: string) => t.genres.some((x) => x.toLowerCase() === g);

const RUNS = Number(process.env.RUNS || 9);
console.log(`\n  catalog ${catalog.length} titles · ${RUNS} timed rebuilds per point\n`);
console.log("  answered   gate    median   worst    per candidate");

const ONLY = process.env.ONLY ? [Number(process.env.ONLY)] : [40, 120, 300, 600, 1000, 1500];
for (const target of ONLY) {
  let profile = emptyProfile();
  const shown = new Set<string>();
  let i = 0;
  while (i < target) {
    const batch = recommend(pool, profile, { count: 26, excludeIds: shown, seed: 12345, vectorFor });
    if (!batch.length) break;
    for (const r of batch) {
      if (i >= target) break;
      profile = applySwipe(
        profile,
        r.title,
        vectorFor(r.title),
        hasGenre(r.title, "comedy") ? "liked" : "not_seen"
      );
      shown.add(r.title.id);
      i++;
    }
  }

  const times: number[] = [];
  for (let r = 0; r < RUNS; r++) {
    const t0 = performance.now();
    recommend(pool, profile, { count: 26, excludeIds: shown, seed: 12345, vectorFor });
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const gate = fameTierSize(profile);
  const med = times[Math.floor(times.length / 2)];
  console.log(
    `  ${String(i).padStart(8)} ${String(gate).padStart(6)}   ` +
      `${med.toFixed(1).padStart(6)}ms ${times[times.length - 1].toFixed(1).padStart(6)}ms   ` +
      `${((med * 1000) / gate).toFixed(1)}us`
  );
}
console.log();
