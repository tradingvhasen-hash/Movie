/**
 * THE ONLY RULER HERE WHOSE SAMPLE THE ENGINE DID NOT CHOOSE.
 *
 *   npx tsx scripts/calibrate.ts [.cache/calibration-199.json]
 *
 * Every other instrument in this repository grades the engine on titles the
 * engine selected. The deck draws from roughly the top 900 by vote count, so
 * every "have you seen this?" answer we owned came from a sample already
 * truncated on the very quantity the exposure model is built from. Fitting a
 * model on that and testing it on that is a closed loop, and it produced the
 * most expensive wrong number in this project:
 *
 *     AUC of vote count, on cards the deck chose        0.500
 *     AUC of vote count, on a uniform random sample     0.799
 *
 * The first was read as "fame is a coin flip, it is worthless as a prior", and
 * that reading shaped the reach model, the gate reserve, weeks of tuning and
 * two rejected experiments. It was range restriction. Vote count is a good
 * predictor of what a person has watched; we had simply never measured it
 * anywhere it could show.
 *
 * `/calibrate` in the app draws 200 titles uniformly across five strata of the
 * fame ranking, films and series in proportion, with no ranking, no gate and
 * no personalisation anywhere in the sampling. This grades any candidate prior
 * against those answers.
 *
 * WHAT IT CANNOT DO. It is one person. It can tell you that an instrument is
 * broken and roughly in which direction, which is what a reference is for; it
 * cannot fit a population. A shape that wins here and loses on `harvest` is a
 * personal fact wearing a constant's clothes — that is exactly what happened
 * to the peaked prior, and why fame became a facet the viewer answers about
 * instead of a curve imposed on them.
 */
import { readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { reachPrior, recognizability } from "../src/lib/engine/features";
import { fameBand } from "../src/lib/engine/facets";

type Row = {
  id: string;
  seen: boolean;
  voteCount: number;
  lang: string;
  type: string;
  year: number;
};

const file = process.argv[2] ?? ".cache/calibration-199.json";
let rows: Row[];
try {
  rows = JSON.parse(readFileSync(file, "utf8")).sample as Row[];
} catch {
  console.log(`no calibration file at ${file}.`);
  console.log("Open /calibrate in the app, answer what you can, press Export.");
  process.exit(1);
}

const catalog = decodeCatalog(
  JSON.parse(readFileSync("public/catalog.json", "utf8")) as EncodedCatalog
);
const by = new Map(catalog.map((t) => [t.id, t]));

/** probability a watched title outranks an unwatched one */
function auc(score: (r: Row) => number): number {
  const pos = rows.filter((r) => r.seen).map(score);
  const neg = rows.filter((r) => !r.seen).map(score);
  if (!pos.length || !neg.length) return NaN;
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

const watched = rows.filter((r) => r.seen).length;
const base = watched / rows.length;
console.log(
  `\n  ${rows.length} titles drawn at random from the whole catalog · ` +
    `${watched} watched · base rate ${(base * 100).toFixed(1)}%\n`
);

console.log("  exposure prior                     AUC");
const priors: [string, (r: Row) => number][] = [
  ["vote count, raw", (r) => r.voteCount],
  ["recognizability() — what ships", (r) => recognizability(r.voteCount)],
  [
    "reachPrior() — what the gate uses",
    (r) => {
      const t = by.get(r.id);
      return t ? reachPrior(t) : recognizability(r.voteCount);
    },
  ],
  ["is it English", (r) => (r.lang === "en" ? 1 : 0)],
  ["is it a film", (r) => (r.type === "movie" ? 1 : 0)],
];
for (const [name, f] of priors) {
  console.log(`  ${name.padEnd(34)} ${auc(f).toFixed(3)}`);
}

console.log("\n  by fame band — the shape any prior has to match\n");
console.log("  band        asked   watched     rate");
const bands = new Map<string, [number, number]>();
for (const r of rows) {
  const b = fameBand(r.voteCount);
  const e = bands.get(b) ?? [0, 0];
  e[0]++;
  if (r.seen) e[1]++;
  bands.set(b, e);
}
const label: Record<string, string> = {
  f0: "under 100", f1: "100-300", f2: "300-800", f3: "800-2k",
  f4: "2k-5k", f5: "5k-12k", f6: "12k-30k", f7: "30k+",
};
for (const k of ["f0", "f1", "f2", "f3", "f4", "f5", "f6", "f7"]) {
  const e = bands.get(k);
  if (!e) continue;
  const bar = "#".repeat(Math.round((e[1] / e[0]) * 40));
  console.log(
    `  ${label[k].padEnd(11)} ${String(e[0]).padStart(5)} ${String(e[1]).padStart(9)}` +
      `   ${((e[1] / e[0]) * 100).toFixed(0).padStart(4)}%  ${bar}`
  );
}

const nonEn = rows.filter((r) => r.lang !== "en");
console.log(
  `\n  non-English: ${nonEn.filter((r) => r.seen).length} watched of ${nonEn.length} asked\n`
);

/**
 * The number that sizes the whole product: what fraction of the catalog this
 * person has watched, and therefore the most any amount of swiping can ever
 * recover from it.
 */
const se = Math.sqrt((base * (1 - base)) / rows.length);
const N = catalog.length;
console.log(
  `  catalog is ${N} titles, so their whole library inside it is about ` +
    `${Math.round(base * N)}\n  (95% interval ${Math.round(Math.max(0, base - 1.96 * se) * N)} to ` +
    `${Math.round((base + 1.96 * se) * N)})\n`
);
