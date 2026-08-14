/**
 * Turn one method's raw output into something the engine can read.
 *
 *   MODE=edges|tags|soul npm run trial:build
 *
 * Every method has to end up as edges, tags, or both — those are the only two
 * things the engine knows how to use. That constraint is deliberate: a method
 * that needs new ranking machinery is a bigger bet than one that does not, and
 * the bake-off should show that cost rather than hide it.
 *
 *   edges  names → catalog ids. ~93% of what the model names exists in the
 *          catalog; the rest is dropped silently.
 *   tags   validated against the fixed vocabulary, invented tags discarded.
 *   soul   60-word descriptions embedded locally with all-MiniLM-L6-v2 (free,
 *          no API), then each film's 12 nearest neighbours become its edges.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";

const MODE = (process.env.MODE ?? "edges") as "edges" | "tags" | "soul";
const MODEL = process.env.MODEL ?? "claude-haiku-4-5";
const RAW = process.env.RAW ?? `.cache/raw-${MODE}-${MODEL}.json`;
const OUT = process.env.OUT ?? `.cache/enrich-${MODE}.json`;
const NEIGHBOURS = Number(process.env.NEIGHBOURS ?? 12);

const raw = JSON.parse(readFileSync(RAW, "utf8")) as Record<string, string>;
const world = JSON.parse(readFileSync(".cache/world.json", "utf8")) as { ids: string[] };
const catalog = decodeCatalog(
  JSON.parse(readFileSync("public/catalog.json", "utf8")) as EncodedCatalog
);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const nameToId = new Map<string, string>();
for (const t of catalog) if (!nameToId.has(norm(t.title.en))) nameToId.set(norm(t.title.en), t.id);
const inWorld = new Set(world.ids);

async function main() {
  if (MODE === "edges") {
    const edges: Record<string, string[]> = {};
    let named = 0;
    let kept = 0;
    for (const [id, text] of Object.entries(raw)) {
      const ids: string[] = [];
      for (const line of text.split("\n").map((s) => s.trim()).filter(Boolean)) {
        named++;
        const hit = nameToId.get(norm(line.replace(/^[-*\d.\s]+/, "")));
        if (hit && hit !== id && inWorld.has(hit) && !ids.includes(hit)) ids.push(hit);
      }
      kept += ids.length;
      if (ids.length) edges[id] = ids;
    }
    writeFileSync(OUT, JSON.stringify({ edges }));
    console.log(
      `edges: ${Object.keys(edges).length} films, ${kept}/${named} suggestions kept ` +
        `(${((100 * kept) / named).toFixed(0)}%), ${(kept / Object.keys(edges).length).toFixed(1)} each → ${OUT}`
    );
    return;
  }

  if (MODE === "tags") {
    const VOCAB = new Set(
      (
        readFileSync("scripts/trial-enrich.ts", "utf8").match(/const VOCAB = \[([\s\S]*?)\];/)?.[1] ??
        ""
      )
        .split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""))
        .filter((s) => s && !s.startsWith("//"))
    );
    const tags: Record<string, string[]> = {};
    let seen = 0;
    let ok = 0;
    for (const [id, text] of Object.entries(raw)) {
      const list = text
        .split(/[,\n]/)
        .map((s) => s.trim().toLowerCase().replace(/^[-*\d.\s]+/, ""))
        .filter(Boolean);
      seen += list.length;
      const valid = [...new Set(list.filter((t) => VOCAB.has(t)))];
      ok += valid.length;
      // prefix so a mood tag can never collide with a TMDB keyword
      if (valid.length) tags[id] = valid.map((t) => `feel:${t}`);
    }
    writeFileSync(OUT, JSON.stringify({ tags }));
    console.log(
      `tags: ${Object.keys(tags).length} films, ${ok}/${seen} in vocabulary ` +
        `(${((100 * ok) / seen).toFixed(0)}%), ${(ok / Object.keys(tags).length).toFixed(1)} each → ${OUT}`
    );
    return;
  }

  // soul → local embeddings → nearest neighbours as edges.
  //
  // The embedder is an optional peer, not a dependency: this arm lost the
  // bake-off (23.1% against a 23.9% baseline) and nobody should have to
  // install a machine-learning runtime to build the website. The specifier is
  // held in a variable so the type checker does not try to resolve a package
  // that is deliberately absent — it was a literal import, and it broke the
  // GitHub Pages deploy for four commits before anyone looked.
  const EMBEDDER = process.env.EMBEDDER ?? "@huggingface/transformers";
  const { pipeline } = (await import(EMBEDDER)) as {
    pipeline: (task: string, model: string) => Promise<
      (text: string[], opts: { pooling: string; normalize: boolean }) => Promise<{
        tolist: () => number[][];
      }>
    >;
  };
  console.log("loading all-MiniLM-L6-v2 (local, free) …");
  const embed = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

  const ids = Object.keys(raw);
  const vectors: number[][] = [];
  const BATCH = 32;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH).map((id) => raw[id]);
    const res = await embed(chunk, { pooling: "mean", normalize: true });
    vectors.push(...res.tolist());
    process.stdout.write(`\r  embedded ${Math.min(i + BATCH, ids.length)}/${ids.length}`);
  }
  console.log();

  const edges: Record<string, string[]> = {};
  for (let i = 0; i < ids.length; i++) {
    const scores: [number, number][] = [];
    for (let j = 0; j < ids.length; j++) {
      if (i === j) continue;
      let dot = 0;
      const a = vectors[i];
      const b = vectors[j];
      for (let k = 0; k < a.length; k++) dot += a[k] * b[k];
      scores.push([dot, j]);
    }
    scores.sort((x, y) => y[0] - x[0]);
    edges[ids[i]] = scores.slice(0, NEIGHBOURS).map(([, j]) => ids[j]);
  }
  writeFileSync(OUT, JSON.stringify({ edges }));
  console.log(`soul: ${Object.keys(edges).length} films, ${NEIGHBOURS} neighbours each → ${OUT}`);
}

void main();
