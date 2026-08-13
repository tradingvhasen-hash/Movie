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

const catalog = decodeCatalog(
  JSON.parse(readFileSync("public/catalog.json", "utf8")) as EncodedCatalog
);
if (process.env.NO_COWATCH) for (const t of catalog) t.related = [];

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

const people = [...libraries.entries()]
  .filter(([, lib]) => lib.length >= MIN_LIBRARY)
  .map(([id, lib]) => ({ id, lib: lib.slice(0, MAX_LIBRARY) }));

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

console.log(
  `${people.length} people with ${MIN_LIBRARY}+ of their favourites in our catalog` +
    ` · grading ${Math.min(USERS, people.length)} of them` +
    ` · co-watch ${process.env.NO_COWATCH ? "STRIPPED" : "on"}\n`
);

let engineHits = 0;
let popularHits = 0;
let chanceSum = 0;
let graded = 0;

for (const person of shuffle(people, 20260812).slice(0, USERS)) {
  const mixed = shuffle(person.lib, Number(person.id) * 7919 + 13);
  const half = Math.floor(mixed.length / 2);
  const library = mixed.slice(0, half);
  const held = new Set(mixed.slice(half).map((t) => t.id));
  if (held.size === 0) continue;

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
    mode: "discover",
    likedTitles: library,
  });
  engineHits += recs.filter((r) => held.has(r.title.id)).length / PAGE;

  // baseline: hand them the most-watched titles they were not already given
  const pop = famous.filter((t) => !excl.has(t.id)).slice(0, PAGE);
  popularHits += pop.filter((t) => held.has(t.id)).length / PAGE;

  chanceSum += held.size / catalog.length;
  graded++;
}

const pct = (x: number) => `${((x / graded) * 100).toFixed(1)}%`;
console.log("─".repeat(70));
console.log(`  HUMAN SCORE (our engine)   ${pct(engineHits)}`);
console.log(`  popularity baseline        ${pct(popularHits)}`);
console.log(`  chance                     ${pct(chanceSum)}`);
console.log("─".repeat(70));
console.log(
  `\n  Beating chance is nothing. Beating the popularity line is the\n` +
    `  only evidence that the engine understands anything at all.\n`
);
