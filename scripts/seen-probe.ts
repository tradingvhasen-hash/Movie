/**
 * DOES THE SHIPPED EXPOSURE MODEL PREDICT WHAT A PERSON HAS WATCHED?
 *
 *   npx tsx scripts/seen-probe.ts [.cache/user-swipes.json]
 *
 * `scripts/seen-model.py` asked whether the *idea* works — it fitted genre and
 * decade rates in Python and found AUC 0.707 against fame's 0.453. This asks
 * whether the code that actually ships works, which is a different question
 * and the only one that matters: it replays a real export through `applySwipe`
 * and scores the held-out remainder with `watchLikelihood`, the exact function
 * the deck calls on every candidate. If the two disagree, the implementation
 * is wrong and this is where that shows.
 *
 * The split is by time, never at random. The first N swipes are what the
 * engine could have learned from; everything after is what it would have had
 * to predict. AUC rather than accuracy because the base rate drifts across a
 * session and accuracy rewards guessing the majority.
 *
 * The learning curve is the point. A model that only beats fame after four
 * hundred swipes is useless — almost nobody swipes four hundred times — so the
 * table below reports every prefix, and `SEEN_CONFIDENCE_K` is set from where
 * the personal signal actually overtakes the prior, not from taste.
 *
 * ONE VIEWER. Enough to justify learning the answer per person, which is what
 * shipped; not enough to move a global constant, which is why the fame prior
 * is still there under a blend.
 */
import { readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { featurize, recognizability } from "../src/lib/engine/features";
import { buildRarityIndex, titleTokens } from "../src/lib/engine/facets";
import {
  applySwipe,
  emptyProfile,
  seenTrust,
  watchLikelihood,
  type TasteProfile,
} from "../src/lib/engine/taste";
import type { SwipeAction, Title } from "../src/lib/types";

const path = process.argv[2] ?? ".cache/user-swipes.json";

const catalog = decodeCatalog(
  JSON.parse(readFileSync("public/catalog.json", "utf8")) as EncodedCatalog
);
buildRarityIndex(catalog);
const byId = new Map(catalog.map((t) => [t.id, t]));

const raw = JSON.parse(readFileSync(path, "utf8")).swipes as {
  id: string;
  a: SwipeAction;
}[];

/** (title, watched) in the order the person swiped them */
const rows: [Title, number][] = [];
for (const s of raw) {
  const t = byId.get(s.id);
  if (t) rows.push([t, s.a === "not_seen" ? 0 : 1]);
}
const dropped = raw.length - rows.length;

const watched = rows.reduce((n, [, y]) => n + y, 0);
console.log(
  `\n${rows.length} swipes · ${watched} watched (${Math.round((watched / rows.length) * 100)}%)` +
    (dropped ? `  ·  ${dropped} not in the catalog, ignored` : "")
);

/** probability a watched title outranks an unwatched one */
function auc(scored: [number, number][]): number {
  const pos = scored.filter(([, y]) => y === 1).map(([s]) => s);
  const neg = scored.filter(([, y]) => y === 0).map(([s]) => s);
  if (pos.length === 0 || neg.length === 0) return NaN;
  let wins = 0;
  let ties = 0;
  for (const p of pos)
    for (const n of neg) {
      if (p > n) wins++;
      else if (p === n) ties++;
    }
  return (wins + 0.5 * ties) / (pos.length * neg.length);
}

const vc = new Map<string, Float32Array>();
const vf = (t: Title) => {
  let v = vc.get(t.id);
  if (!v) {
    v = featurize(t);
    vc.set(t.id, v);
  }
  return v;
};

/** replay the first `n` swipes exactly as the app would */
function train(n: number): TasteProfile {
  let p = emptyProfile();
  for (let i = 0; i < n; i++) {
    const [t] = rows[i];
    p = applySwipe(p, t, vf(t), raw[i].a === "not_seen" ? "not_seen" : raw[i].a);
  }
  return p;
}

/* ── the learning curve ───────────────────────────────────────────────── */

console.log(
  "\ntrained on the first N swipes, scored on everything after\n\n" +
    "  after   test   fame    shipped   personal   trust"
);

const marks = [20, 40, 60, 80, 120, 160, 200, 260, 320].filter((n) => n < rows.length - 40);
marks.push(Math.floor(rows.length / 2));

for (const n of [...new Set(marks)].sort((a, b) => a - b)) {
  const p = train(n);
  const test = rows.slice(n);
  const fame: [number, number][] = [];
  const ship: [number, number][] = [];
  const pers: [number, number][] = [];
  for (const [t, y] of test) {
    const tokens = titleTokens(t);
    const f = recognizability(t.voteCount);
    fame.push([f, y]);
    ship.push([watchLikelihood(p, tokens, f), y]);
    // the personal tables alone, with the prior taken out of the blend
    pers.push([watchLikelihood({ ...p, totalSwipes: 1e9 }, tokens, f), y]);
  }
  const fmt = (x: number) => (Number.isNaN(x) ? "  —  " : x.toFixed(3));
  console.log(
    `  ${String(n).padStart(5)}  ${String(test.length).padStart(5)}  ` +
      `${fmt(auc(fame))}   ${fmt(auc(ship))}     ${fmt(auc(pers))}     ${seenTrust(p).toFixed(2)}`
  );
}

console.log(
  "\n  0.5 is a coin flip. `shipped` is what the deck scores with today —\n" +
    "  the blend; `personal` is the same tables with the fame prior removed,\n" +
    "  which is the ceiling the blend is walking toward.\n"
);

/* ── what the tables actually learned ─────────────────────────────────── */

const full = train(rows.length);
for (const kind of ["genre", "era"] as const) {
  const table = full.seenFacets[kind];
  const ranked = Object.entries(table)
    .filter(([, [, mass]]) => mass >= 8)
    .map(([k, [net, mass]]) => [k, net / mass, mass] as const)
    .sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) continue;
  console.log(`what it learned about ${kind} (net/mass, ${ranked.length} values)`);
  const shown = ranked.length <= 10 ? ranked : [...ranked.slice(0, 5), ...ranked.slice(-5)];
  for (const [k, v, mass] of shown) {
    const bar = v >= 0 ? "+".repeat(Math.round(v * 12)) : "-".repeat(Math.round(-v * 12));
    console.log(`   ${k.padEnd(18)} ${v >= 0 ? " " : ""}${v.toFixed(2)}  n=${String(mass).padStart(4)}  ${bar}`);
  }
  console.log();
}
