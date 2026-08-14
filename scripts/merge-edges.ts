/**
 * Choose an edge source per title, and say plainly what each title got.
 *
 *   npx tsx scripts/merge-edges.ts prefer   # behaviour where it exists
 *   npx tsx scripts/merge-edges.ts union    # both, behaviour first
 *
 * Two graphs now describe the same catalog and neither covers it:
 *
 *   .cache/enrich-behaviour.json   4,100 films. What 60,000 people actually
 *                                  watched together. No television, nothing
 *                                  released after the MovieLens snapshot.
 *   .cache/enrich-distilled.json   all 5,555 titles. Where a ridge fit thinks
 *                                  each one sits, from metadata we own, at
 *                                  cosine 0.737 against the truth.
 *
 * The obvious move is "use the real thing where you have it", and that is the
 * `prefer` mode. It is not obviously right: the real thing carries artifacts
 * the prediction smooths away — raw co-watching puts Avatar next to The
 * Hangover because half the planet saw both, and it puts Parasite next to
 * Joker, Knives Out, Jojo Rabbit and 1917, which share a release year rather
 * than a feeling. The prediction cannot make that mistake because it never
 * sees a release calendar.
 *
 * So both modes are built and both are graded, and the rulers decide.
 */
import { readFileSync, writeFileSync } from "node:fs";

type Graph = { edges: Record<string, string[]> };

const mode = process.argv[2] ?? "prefer";
const out = process.argv[3] ?? `.cache/enrich-${mode}.json`;
const CAP = Number(process.env.CAP ?? 47);

const behaviour = (
  JSON.parse(readFileSync(".cache/enrich-behaviour.json", "utf8")) as Graph
).edges;
const distilled = (
  JSON.parse(readFileSync(".cache/enrich-distilled.json", "utf8")) as Graph
).edges;

const edges: Record<string, string[]> = {};
let fromBehaviour = 0;
let fromDistilled = 0;

for (const id of new Set([...Object.keys(distilled), ...Object.keys(behaviour)])) {
  const b = behaviour[id] ?? [];
  const d = distilled[id] ?? [];

  if (mode === "union") {
    // behaviour first: where both name a title, the real observation is the
    // reason it is there, and the order is what the walk reads
    edges[id] = [...new Set([...b, ...d])].slice(0, CAP);
  } else {
    edges[id] = (b.length ? b : d).slice(0, CAP);
  }
  if (b.length) fromBehaviour++;
  else fromDistilled++;
}

writeFileSync(out, JSON.stringify({ edges }));

const avg =
  Object.values(edges).reduce((s, v) => s + v.length, 0) / Object.keys(edges).length;
console.log(
  `${mode}: ${Object.keys(edges).length} titles → ${out}\n` +
    `  ${fromBehaviour} have real co-watching, ${fromDistilled} have only the prediction\n` +
    `  ${avg.toFixed(1)} neighbours each (cap ${CAP})`
);
