/**
 * Does the deck get worse the longer you swipe?
 *
 *   npx tsx scripts/deck-drift.ts
 *
 * A user reported the exact shape of a bug: the first ten to fifteen cards
 * matched their picks well, and by fifty or sixty cards nothing did. Every
 * ruler here measures a single page from a fixed library, so a decay over a
 * session is invisible to all of them.
 *
 * This one swipes. It starts from the onboarding picks, then behaves like the
 * viewer it is simulating — right on what fits the taste, left otherwise — and
 * reports the hit-rate in blocks of ten, along with the pieces of the score
 * that produced each block. If the deck decays, the block where it happens and
 * the term responsible both show up.
 */
import { readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { featurize } from "../src/lib/engine/features";
import { recommend, walkBonus, type CandidateItem } from "../src/lib/engine/recommend";
import { applySwipe, emptyProfile, tasteConfidence } from "../src/lib/engine/taste";
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

const find = (n: string) => catalog.find((t) => t.title.en.toLowerCase() === n.toLowerCase());

/** the viewer: what they picked, and what they would say yes to */
const TASTES: { name: string; picks: string[]; likes: (t: Title) => boolean }[] = [
  {
    name: "comedy",
    picks: ["The Hangover", "Superbad", "Friends", "Groundhog Day", "The Office"],
    likes: (t) => t.genres.some((g) => g.toLowerCase() === "comedy"),
  },
  {
    name: "horror",
    picks: ["The Shining", "The Conjuring", "Hereditary", "The Exorcist", "Get Out"],
    likes: (t) => t.genres.some((g) => ["horror", "thriller"].includes(g.toLowerCase())),
  },
];

const SWIPES = Number(process.env.SWIPES ?? 80);
const BLOCK = 10;

for (const taste of TASTES) {
  let p = emptyProfile();
  const shown = new Set<string>();
  const liked: Title[] = [];

  for (const n of taste.picks) {
    const t = find(n);
    if (!t) continue;
    p = applySwipe(p, t, vf(t), "liked");
    liked.push(t);
    shown.add(t.id);
  }

  const blocks: { hits: number; n: number; walk: number; conf: number }[] = [];
  let swipes = 0;

  while (swipes < SWIPES) {
    const batch = recommend(pool, p, {
      excludeIds: shown,
      count: BLOCK,
      seed: 7,
      vectorFor: vf,
      likedTitles: liked,
      mode: "swipe",
    });
    if (batch.length === 0) break;

    // how much graph signal the cards in this block actually carried
    const walk = walkBonus(pool, liked);
    const carried =
      batch.reduce((s, r) => s + (walk.get(r.title.id)?.score ?? 0), 0) / batch.length;

    let hits = 0;
    for (const rec of batch) {
      const yes = taste.likes(rec.title);
      if (yes) {
        hits++;
        liked.push(rec.title);
      }
      p = applySwipe(p, rec.title, vf(rec.title), yes ? "liked" : "disliked");
      shown.add(rec.title.id);
      swipes++;
    }
    blocks.push({ hits, n: batch.length, walk: carried, conf: tasteConfidence(p) });
  }

  console.log(`\n${taste.name} — ${taste.picks.length} picks, then ${swipes} swipes\n`);
  console.log("  swipes    on taste   graph signal on the cards   confidence   library");
  blocks.forEach((b, i) => {
    const from = i * BLOCK + 1;
    console.log(
      `  ${String(from).padStart(3)}-${String(from + b.n - 1).padEnd(4)} ` +
        `${String(Math.round((100 * b.hits) / b.n) + "%").padStart(7)}` +
        `${b.walk.toFixed(3).padStart(24)}` +
        `${b.conf.toFixed(2).padStart(13)}` +
        `${String(taste.picks.length + blocks.slice(0, i).reduce((s, x) => s + x.hits, 0)).padStart(10)}`
    );
  });
}
