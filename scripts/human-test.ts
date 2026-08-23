/**
 * THE HUMAN RULER — real people, real libraries, nobody here wrote the key.
 *
 *   npm run human
 *
 * Every measurement in this repo until now was graded against lists written by
 * the same model that writes the engine's own experiments. `feel-test.ts` says
 * so in its own header. That is a real weakness: a method can score well by
 * agreeing with the opinions that produced the answer key, and we would not be
 * able to tell.
 *
 * This one has no such problem. It uses MovieLens — 100,836 ratings by 610
 * real people, collected by the University of Minnesota, linked to TMDB ids.
 * 3,091 of those films are in our catalog, and 427 of those people have 20 or
 * more of them rated 4 stars and up.
 *
 * The protocol is the same shape as the feel ruler, so the numbers are
 * comparable, but the taste being recovered belongs to a stranger:
 *
 *     half of one person's highly-rated films  →  handed to the engine
 *     the other half                           →  held back as the answer key
 *
 * Two baselines are printed with every score, because a number alone lies:
 *
 *     CHANCE      a random page of 12
 *     POPULARITY  the most-voted titles this person has not been given
 *
 * The popularity line is the one that matters. MovieLens users watch famous
 * films, so a recommender that simply lists blockbusters scores well above
 * chance while understanding nothing. Any method worth paying for has to beat
 * *that*, not chance.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DATA — not committed, fetched on demand into .cache/ (gitignored).
 *
 * MovieLens is free for research use and forbids commercial use without
 * permission from GroupLens. It is used here only to grade the engine offline;
 * none of it is shipped, bundled, or read at runtime. If this project ever
 * becomes revenue-bearing that stays true — the data never enters the product.
 *
 *   F. Maxwell Harper and Joseph A. Konstan. 2015. The MovieLens Datasets:
 *   History and Context. ACM TiiS 5, 4: 19:1–19:19.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { featurize } from "../src/lib/engine/features";
import { recommend, type CandidateItem } from "../src/lib/engine/recommend";
import { applySwipe, emptyProfile } from "../src/lib/engine/taste";
import { buildRarityIndex } from "../src/lib/engine/facets";
import type { Title } from "../src/lib/types";
import { loadFullCatalog } from "./lib/catalog";

const CACHE = ".cache/ml-latest-small";
const URL = "https://files.grouplens.org/datasets/movielens/ml-latest-small.zip";

function ensureData(): string {
  if (existsSync(`${CACHE}/ratings.csv`)) return CACHE;
  console.log("fetching MovieLens (once, ~1 MB) …");
  mkdirSync(".cache", { recursive: true });
  execFileSync("curl", ["-sSL", "-o", ".cache/ml.zip", URL]);
  execFileSync("unzip", ["-o", "-q", ".cache/ml.zip", "-d", ".cache"]);
  return CACHE;
}

const dir = ensureData();
const rows = (f: string) =>
  readFileSync(`${dir}/${f}`, "utf8").replace(/\r/g, "").trim().split("\n").slice(1);

let catalog = loadFullCatalog();
if (process.env.NO_COWATCH) for (const t of catalog) t.related = [];

/**
 * WORLD=1 — grade inside the trial's closed world (see build-world.ts).
 *
 * An enrichment method covering 800 titles cannot be judged against a catalog
 * of 5,555: most of what the engine returns would have no enrichment at all,
 * and the comparison would measure coverage rather than quality. Inside the
 * world every title is enriched, so the only variable left is the method.
 */
if (process.env.WORLD) {
  const world = JSON.parse(readFileSync(".cache/world.json", "utf8")) as { ids: string[] };
  const keep = new Set(world.ids);
  catalog = catalog.filter((t) => keep.has(t.id));
  for (const t of catalog) t.related = (t.related ?? []).filter((id) => keep.has(id));
}

/**
 * ENRICH=<file> — overlay one method's output and grade it.
 *
 *   { "edges": { "<id>": ["<id>", …] },   replaces the co-watch graph
 *     "tags":  { "<id>": ["dread", …] } } appended to keywords, so the
 *                                         existing facet tables read them
 *                                         with no new machinery
 */
if (process.env.ENRICH) {
  const data = JSON.parse(readFileSync(process.env.ENRICH, "utf8")) as {
    edges?: Record<string, string[]>;
    tags?: Record<string, string[]>;
  };
  const inCatalog = new Set(catalog.map((t) => t.id));
  let edged = 0;
  let tagged = 0;
  for (const t of catalog) {
    const e = data.edges?.[t.id];
    if (e) {
      t.related = e.filter((id) => id !== t.id && inCatalog.has(id));
      edged++;
    }
    const g = data.tags?.[t.id];
    if (g?.length) {
      t.keywords = [...t.keywords, ...g];
      tagged++;
    }
  }
  console.log(
    `enrichment ${process.env.ENRICH}: edges on ${edged} titles, tags on ${tagged}`
  );
}

const byTmdb = new Map<string, Title>();
for (const t of catalog) if (t.type === "movie") byTmdb.set(String(t.tmdbId), t);

const mlToTitle = new Map<string, Title>();
for (const line of rows("links.csv")) {
  const [movieId, , tmdbId] = line.split(",");
  const t = tmdbId ? byTmdb.get(tmdbId) : undefined;
  if (t) mlToTitle.set(movieId, t);
}

/** one person's highly-rated films, in the order they rated them */
const libraries = new Map<string, Title[]>();
for (const line of rows("ratings.csv")) {
  const [user, movieId, score] = line.split(",");
  if (Number(score) < 4) continue;
  const t = mlToTitle.get(movieId);
  if (!t) continue;
  const lib = libraries.get(user) ?? [];
  lib.push(t);
  libraries.set(user, lib);
}

const MIN_LIBRARY = 20;
/** a very long library is a completionist, not a taste — and it is slow */
const MAX_LIBRARY = 120;
const PAGE = 12;
const USERS = Number(process.env.USERS ?? 150);

let people = [...libraries.entries()]
  .filter(([, lib]) => lib.length >= MIN_LIBRARY)
  .map(([id, lib]) => ({ id, lib: lib.slice(0, MAX_LIBRARY) }));

/**
 * USERS_FILE — grade a roster prepared elsewhere.
 *
 * `ceiling-test.py` trains a collaborative model on 20,000 MovieLens people
 * and grades it on a disjoint set. Comparing its score with ours only means
 * something if we are graded on *the same people with the same libraries*, so
 * it writes them out and we read them back. Anything else compares two
 * different exams and calls it a ranking.
 */
if (process.env.USERS_FILE) {
  // MovieLens has no television, so every TV title in our pool is a slot that
  // can never be a hit. Leaving them in would hand the comparison a handicap
  // the collaborative model does not carry.
  catalog = catalog.filter((t) => t.type === "movie");
  const byId = new Map(catalog.map((t) => [t.id, t]));
  const roster = JSON.parse(readFileSync(process.env.USERS_FILE, "utf8")) as {
    id: number;
    lib: string[];
  }[];
  people = roster
    .map((r) => ({
      id: String(r.id),
      lib: r.lib.map((id) => byId.get(id)).filter((t): t is Title => Boolean(t)),
    }))
    .filter((p) => p.lib.length >= MIN_LIBRARY);
  console.log(`roster from ${process.env.USERS_FILE}: ${people.length} people`);
}

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

function shuffle<T>(xs: T[], seed: number): T[] {
  const out = [...xs];
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const famous = [...catalog].sort((a, b) => b.voteCount - a.voteCount);

/**
 * The top 500 by vote count. A hit inside this set is only weak evidence: the
 * viewer probably would have found it anyway, and recommending famous things
 * is the highest-scoring strategy available before any intelligence is added.
 * The long-tail score below counts only hits from *outside* it.
 */
const HEAD = new Set(famous.slice(0, 500).map((t) => t.id));

/**
 * How many likes the engine is given before it has to recommend.
 *
 * The default hands it half the person's library, which is dozens of titles —
 * and no real viewer gives us that before deciding whether to stay. CURVE=1
 * reports the same score at 5, 10 and 20 likes as well, which is the part of
 * the curve the product actually lives on.
 */
const CURVE = process.env.CURVE ? [5, 10, 20, 0] : [0];

console.log(
  `${people.length} people with ${MIN_LIBRARY}+ of their favourites in our catalog` +
    ` · grading ${Math.min(USERS, people.length)} of them` +
    ` · co-watch ${process.env.NO_COWATCH ? "STRIPPED" : "on"}\n`
);

const roster = shuffle(people, Number(process.env.SAMPLE ?? 20260812)).slice(0, USERS);

/** per-person scores, kept individually so the interval can be resampled */
interface Scores {
  engine: number[];
  tail: number[];
  popular: number[];
  chance: number[];
}

function grade(likeBudget: number): Scores {
  const out: Scores = { engine: [], tail: [], popular: [], chance: [] };

  for (const person of roster) {
    const mixed = shuffle(person.lib, Number(person.id) * 7919 + 13);
    const half = Math.floor(mixed.length / 2);
    // budget 0 = the original half-and-half split
    const cut = likeBudget === 0 ? half : Math.min(likeBudget, half);
    const library = mixed.slice(0, cut);
    const held = new Set(mixed.slice(cut).map((t) => t.id));
    if (held.size === 0 || library.length === 0) continue;

    let p = emptyProfile();
    const excl = new Set<string>();
    for (const t of library) {
      p = applySwipe(p, t, vf(t), "liked");
      excl.add(t.id);
    }

    const recs = recommend(pool, p, {
      excludeIds: excl,
      count: PAGE,
      seed: Number(person.id),
      vectorFor: vf,
      // MODE=swipe grades the deck instead of Discover. Until now every
      // ruler here graded Discover only, which is how the deck kept its
      // settings from the robot-persona benchmark and ended up showing
      // Interstellar to someone who had just said they love a sitcom.
      mode: (process.env.MODE as "swipe" | "discover") ?? "discover",
      likedTitles: library,
    });
    const hits = recs.filter((r) => held.has(r.title.id));
    out.engine.push(hits.length / PAGE);
    out.tail.push(hits.filter((r) => !HEAD.has(r.title.id)).length / PAGE);

    // baseline: hand them the most-watched titles they were not already given
    const pop = famous.filter((t) => !excl.has(t.id)).slice(0, PAGE);
    out.popular.push(pop.filter((t) => held.has(t.id)).length / PAGE);

    out.chance.push(held.size / catalog.length);
  }
  return out;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(xs.length, 1);

/**
 * 95% interval by resampling the graded people with replacement.
 *
 * Added because several past decisions turned on gaps of a point or two, and
 * "±0.3 across three samples" is not an interval — it is three numbers. A
 * change that does not clear this range is not a change.
 */
function interval(xs: number[], rounds = 1000): [number, number] {
  const means: number[] = [];
  let s = 20260813 >>> 0;
  for (let r = 0; r < rounds; r++) {
    let sum = 0;
    for (let i = 0; i < xs.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      sum += xs[s % xs.length];
    }
    means.push(sum / xs.length);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(rounds * 0.025)], means[Math.floor(rounds * 0.975)]];
}

const pc = (x: number) => `${(x * 100).toFixed(1)}%`;
const band = (xs: number[]) => {
  const [lo, hi] = interval(xs);
  return `${pc(mean(xs))}  [${pc(lo)} – ${pc(hi)}]`;
};

for (const budget of CURVE) {
  const s = grade(budget);
  const label = budget === 0 ? "half the library" : `${budget} likes`;
  console.log("─".repeat(70));
  console.log(`  after ${label}   (${s.engine.length} people)`);
  console.log(`    engine                   ${band(s.engine)}`);
  console.log(`    engine, long tail only   ${band(s.tail)}`);
  console.log(`    popularity baseline      ${pc(mean(s.popular))}`);
  console.log(`    chance                   ${pc(mean(s.chance))}`);
}
console.log("─".repeat(70));
console.log(
  `\n  Beating chance is nothing. Beating the popularity line is the\n` +
    `  only evidence that the engine understands anything at all — and the\n` +
    `  long-tail line is the only one popularity cannot inflate.\n`
);
