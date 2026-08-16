/**
 * DOES TELLING THE TRUTH ABOUT WHAT YOU HATE COST YOU WHAT YOU LOVE?
 *
 *   npx tsx scripts/mixed-taste.ts
 *   USERS=400 npx tsx scripts/mixed-taste.ts
 *
 * The user reported working around this engine rather than using it. He has
 * watched The Office, New Girl, The Big Bang Theory and How I Met Your Mother
 * and dislikes all four — and he swipes *up* on them, "never seen it", because
 * a left swipe would teach the tables that he dislikes sitcoms and cost him
 * Modern Family and Brooklyn Nine-Nine, which he loves.
 *
 * That is a specific, falsifiable claim about `applyFacets`, which writes the
 * same signal to every token a title carries. A dislike of The Office writes a
 * negative against `comedy`, `sitcom`, `workplace`, `Steve Carell`, `2000s` and
 * `en` in one stroke, and the first two are exactly what it shares with the
 * shows he loves.
 *
 * Nothing in this repository could see that. `human` feeds the engine only
 * films rated four stars and up — there is not a single dislike in it. `replay`
 * and `harvest` mix dislikes in but score *how much was recovered*, not what a
 * dislike did to a neighbouring taste.
 *
 * So: MovieLens people who both love and hate films inside the same genre.
 *
 *     loves   rated >= 4.0        half given to the engine, half held back
 *     hates   rated <= 2.5        given to the engine, or withheld
 *
 * Two runs, identical in every other way:
 *
 *     HONEST    the hates are swiped left, as the product intends
 *     EVASIVE   the hates are not shown at all — what he actually does
 *
 * If HONEST recovers fewer held-back loves than EVASIVE, then telling this
 * engine the truth costs the person recommendations, he is right to work
 * around it, and the workaround is also quietly poisoning the exposure model,
 * which is being told he has not seen things he has.
 *
 * The comparison is only meaningful on people whose hates *overlap* their
 * loves — someone who hates only horror and loves only comedy has nothing to
 * confuse. OVERLAP below is the share of a person's hated films sharing a
 * genre with a film they love, and the run is restricted to people above a
 * threshold on it.
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

if (!existsSync(`${CACHE}/ratings.csv`)) {
  mkdirSync(".cache", { recursive: true });
  execFileSync("curl", ["-sSL", "-o", ".cache/ml.zip", URL]);
  execFileSync("unzip", ["-oq", ".cache/ml.zip", "-d", ".cache"]);
}
const rows = (f: string) => readFileSync(`${CACHE}/${f}`, "utf8").trim().split("\n").slice(1);

const catalog = decodeCatalog(
  JSON.parse(readFileSync("public/catalog.json", "utf8")) as EncodedCatalog
);
const pool: CandidateItem[] = catalog.map((title) => ({ title }));
buildRarityIndex(catalog);

const vecs = new Map<string, Float32Array>();
const vf = (t: Title) => {
  let v = vecs.get(t.id);
  if (!v) {
    v = featurize(t);
    vecs.set(t.id, v);
  }
  return v;
};

const byTmdb = new Map<string, Title>();
for (const t of catalog) if (t.type === "movie") byTmdb.set(t.id.slice(6), t);
const mlToTitle = new Map<string, Title>();
for (const line of rows("links.csv")) {
  const [movieId, , tmdbId] = line.split(",");
  const t = tmdbId ? byTmdb.get(tmdbId.trim()) : undefined;
  if (t) mlToTitle.set(movieId, t);
}

const loves = new Map<string, Title[]>();
const hates = new Map<string, Title[]>();
for (const line of rows("ratings.csv")) {
  const [user, movieId, score] = line.split(",");
  const t = mlToTitle.get(movieId);
  if (!t) continue;
  const s = Number(score);
  if (s >= 4) (loves.get(user) ?? loves.set(user, []).get(user)!).push(t);
  else if (s <= 2.5) (hates.get(user) ?? hates.set(user, []).get(user)!).push(t);
}

const genresOf = (t: Title) => t.genres.map((g) => g.toLowerCase());

const MIN_LOVES = 20;
const MIN_HATES = 5;
const MIN_OVERLAP = Number(process.env.MIN_OVERLAP ?? 0.5);
const PAGE = 12;
const USERS = Number(process.env.USERS ?? 250);

type Person = { id: string; loves: Title[]; hates: Title[]; overlap: number };
const people: Person[] = [];
for (const [id, lv] of loves) {
  const ht = hates.get(id) ?? [];
  if (lv.length < MIN_LOVES || ht.length < MIN_HATES) continue;
  const lovedGenres = new Set(lv.flatMap(genresOf));
  const shared = ht.filter((t) => genresOf(t).some((g) => lovedGenres.has(g))).length;
  const overlap = shared / ht.length;
  if (overlap < MIN_OVERLAP) continue;
  people.push({ id, loves: lv.slice(0, 120), hates: ht.slice(0, 60), overlap });
}
people.sort((a, b) => Number(a.id) - Number(b.id));
const roster = people.slice(0, USERS);

function shuffle<T>(list: T[], seed: number): T[] {
  const out = [...list];
  let a = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    a = (a * 1664525 + 1013904223) >>> 0;
    const j = a % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** one person, one condition → share of the held-back loves found in a page */
function score(person: Person, tellTheTruth: boolean): number {
  const mixed = shuffle(person.loves, Number(person.id) * 7919 + 13);
  const half = Math.floor(mixed.length / 2);
  const library = mixed.slice(0, half);
  const held = new Set(mixed.slice(half).map((t) => t.id));
  if (!held.size || !library.length) return NaN;

  let p = emptyProfile();
  const excl = new Set<string>();
  for (const t of library) {
    p = applySwipe(p, t, vf(t), "liked");
    excl.add(t.id);
  }
  // the only difference between the two runs
  if (tellTheTruth) {
    for (const t of person.hates) {
      p = applySwipe(p, t, vf(t), "disliked");
      excl.add(t.id);
    }
  } else {
    // he swipes up instead: the title is still answered, so it leaves the deck,
    // but no taste is written. Excluding it in both runs keeps the two pages
    // drawn from the same pool, so only the *learning* differs.
    for (const t of person.hates) excl.add(t.id);
  }

  const recs = recommend(pool, p, {
    excludeIds: excl,
    count: PAGE,
    seed: Number(person.id),
    vectorFor: vf,
    mode: (process.env.MODE as "swipe" | "discover") ?? "discover",
    likedTitles: library,
  });
  return recs.filter((r) => held.has(r.title.id)).length / PAGE;
}

const honest: number[] = [];
const evasive: number[] = [];
for (const person of roster) {
  const h = score(person, true);
  const e = score(person, false);
  if (Number.isNaN(h) || Number.isNaN(e)) continue;
  honest.push(h);
  evasive.push(e);
}

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(x.length, 1);
const ci = (x: number[]) => {
  const m = mean(x);
  const sd = Math.sqrt(mean(x.map((v) => (v - m) ** 2)));
  return (1.96 * sd) / Math.sqrt(Math.max(x.length, 1));
};
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

console.log(
  `\n  ${roster.length} people who love and hate inside the same genres ` +
    `(overlap ≥ ${Math.round(MIN_OVERLAP * 100)}%)\n` +
    `  mode ${process.env.MODE ?? "discover"} · a page of ${PAGE} · ` +
    `median ${Math.round(mean(roster.map((p) => p.hates.length)))} dislikes each\n`
);
console.log("  what the engine was told          loves found in the page");
console.log(`    dislikes swiped left            ${pct(mean(honest))}  ± ${pct(ci(honest))}`);
console.log(`    dislikes swiped up (hidden)     ${pct(mean(evasive))}  ± ${pct(ci(evasive))}`);

const diff = mean(honest) - mean(evasive);
const paired = honest.map((h, i) => h - evasive[i]);
const pairedCi = ci(paired);
console.log(
  `\n  paired difference                 ${diff >= 0 ? "+" : ""}${pct(diff)}  ± ${pct(pairedCi)}` +
    `  (${Math.abs(diff) > pairedCi ? "real" : "inside the noise"})`
);
const hurt = paired.filter((d) => d < 0).length;
const helped = paired.filter((d) => d > 0).length;
console.log(
  `  honesty helped ${helped} people, hurt ${hurt}, changed nothing for ` +
    `${paired.length - helped - hurt}\n`
);
