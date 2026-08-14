/**
 * Fold the Wikipedia click graph in, leading where nothing else knows.
 *
 *   python3 scripts/wiki-edges.py
 *   npx tsx scripts/merge-wiki.ts
 *   npx tsx scripts/apply-edges.ts .cache/edges-wiki-lead.json
 *
 * Two placements were graded. Appending the clicks behind the existing
 * neighbours moved hard vibe pairs 53% → 55%; putting them *first* wherever
 * there is no behavioural data moved them to 60%. The difference is what the
 * clicks are competing with: behind real co-watching they are noise, but for
 * a series — which MovieLens has never heard of — they replace a guess.
 *
 * So the rule is by source, not by score: a title EASE covers keeps its
 * ordering and takes clicks as a tail; a title it does not gets the clicks
 * first. 948 titles are in the second group, every one of them television or
 * released after the MovieLens snapshot.
 */
import { readFileSync, writeFileSync } from "node:fs";

type Graph = { edges: Record<string, string[]> };
const load = (p: string) => (JSON.parse(readFileSync(p, "utf8")) as Graph).edges;

const CAP = Number(process.env.CAP ?? 47);
const base = load(process.env.BASE ?? ".cache/edges-prefer.json");
const wiki = load(process.env.WIKI ?? ".cache/enrich-wiki10.json");
const behaviour = load(".cache/enrich-behaviour.json");

const edges: Record<string, string[]> = {};
let led = 0;

for (const [id, existing] of Object.entries(base)) {
  const clicks = wiki[id] ?? [];
  if (!clicks.length || behaviour[id]) {
    edges[id] = existing;
    continue;
  }
  edges[id] = [...clicks, ...existing.filter((x) => !clicks.includes(x))].slice(0, CAP);
  led++;
}

writeFileSync(".cache/edges-wiki-lead.json", JSON.stringify({ edges }));
const avg = Object.values(edges).reduce((s, v) => s + v.length, 0) / Object.keys(edges).length;
console.log(
  `${Object.keys(edges).length} titles → .cache/edges-wiki-lead.json\n` +
    `  clicks lead on ${led} of them (no behavioural data exists there)\n` +
    `  ${avg.toFixed(1)} neighbours each`
);
