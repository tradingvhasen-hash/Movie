/**
 * THE VIBE RULER — the only test that asks the project's actual question.
 *
 *   npm run vibe
 *
 * Every other measurement here is an aggregate: how much of a page, averaged
 * over hundreds of people. Aggregates can improve while the thing this project
 * exists for stays broken, because the catalog is 92% titles nobody is arguing
 * about. This one is narrow on purpose.
 *
 * Fifty pairs, written by hand. Each is two works a person would say belong
 * together, and the test is one sentence long:
 *
 *     "I liked A."  →  does B appear in the first twenty?
 *
 * Nothing else. One like, no swipes, no history — exactly the question you
 * would put to a friend, and exactly the question a viewer puts to the app on
 * their first visit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EASY AND HARD ARE SCORED SEPARATELY, AND ONLY ONE OF THEM MATTERS
 *
 * An EASY pair shares its genre and usually its shelf — Toy Story and Finding
 * Nemo, The Conjuring and Insidious. Any keyword engine finds these, and ours
 * already does. They are here as a floor: if easy pairs ever drop, something
 * has broken.
 *
 * A HARD pair shares only a feel, and shares it across a genre line:
 *
 *     The Hangover      ↔  Rush Hour          (comedy ↔ action)
 *     Parasite          ↔  Knives Out         (thriller ↔ mystery)
 *     Whiplash          ↔  Black Swan         (music ↔ horror)
 *     Brooklyn Nine-Nine↔  Modern Family      (workplace ↔ family)
 *     The Truman Show   ↔  Groundhog Day      (drama ↔ romance)
 *
 * These are the ones a person gets right instantly and our engine cannot, and
 * measured on the real catalog the reason is plain: The Hangover and Rush Hour
 * share exactly one token, the word "comedy". **The hard number is the score
 * of this project.** The overall average is not, and should not be quoted
 * alone.
 *
 * Both directions are tested (A→B and B→A) because the graph is not symmetric
 * and a link that only works one way is only half built.
 */
import { readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { featurize } from "../src/lib/engine/features";
import { recommend, type CandidateItem } from "../src/lib/engine/recommend";
import { applySwipe, emptyProfile } from "../src/lib/engine/taste";
import { buildRarityIndex } from "../src/lib/engine/facets";
import type { Title } from "../src/lib/types";

/** [A, B, hard?] — hard means the pair crosses a genre line */
type Pair = [string, string, boolean];

const PAIRS: Pair[] = [
  // ── hard: the pairs this project exists for ──────────────────────────
  ["The Hangover", "Rush Hour", true],
  ["Parasite", "Knives Out", true],
  ["Whiplash", "Black Swan", true],
  ["Brooklyn Nine-Nine", "Modern Family", true],
  ["The Truman Show", "Groundhog Day", true],
  ["The Grand Budapest Hotel", "Amélie", true],
  ["Get Out", "Us", true],
  ["Mad Max: Fury Road", "John Wick", true],
  ["Her", "Eternal Sunshine of the Spotless Mind", true],
  ["The Big Lebowski", "Fargo", true],
  ["Inception", "The Prestige", true],
  ["Interstellar", "Arrival", true],
  ["Kill Bill: Vol. 1", "Oldboy", true],
  ["Shaun of the Dead", "Zombieland", true],
  ["Hot Fuzz", "The Nice Guys", true],
  ["Little Miss Sunshine", "Juno", true],
  ["Jaws", "Alien", true],
  ["La La Land", "Once", true],
  ["Edge of Tomorrow", "Source Code", true],
  ["Before Sunrise", "Lost in Translation", true],
  ["Superbad", "21 Jump Street", true],
  ["Django Unchained", "Inglourious Basterds", true],
  ["Se7en", "Zodiac", true],
  ["The Silence of the Lambs", "Prisoners", true],
  ["Coco", "Up", true],
  ["Stranger Things", "Dark", true],
  ["Sherlock", "House", true],
  ["The Matrix", "Total Recall", true],
  ["Ocean's Eleven", "Now You See Me", true],
  ["Bridesmaids", "The Heat", true],

  // ── easy: same genre, same shelf. A floor, not a target ──────────────
  ["The Office", "Parks and Recreation", false],
  ["Friends", "How I Met Your Mother", false],
  ["Breaking Bad", "Better Call Saul", false],
  ["Game of Thrones", "The Witcher", false],
  ["Toy Story", "Finding Nemo", false],
  ["Spirited Away", "My Neighbor Totoro", false],
  ["The Conjuring", "Insidious", false],
  ["Hereditary", "The Witch", false],
  ["It Follows", "The Babadook", false],
  ["Die Hard", "Lethal Weapon", false],
  ["The Raid", "Dredd", false],
  ["Goodfellas", "Casino", false],
  ["Gladiator", "Braveheart", false],
  ["Saving Private Ryan", "Black Hawk Down", false],
  ["The Shawshank Redemption", "The Green Mile", false],
  ["Titanic", "The Notebook", false],
  ["Mean Girls", "Clueless", false],
  ["Home Alone", "Elf", false],
  ["Shrek", "Despicable Me", false],
  ["Forrest Gump", "The Curious Case of Benjamin Button", false],
];

const catalog = decodeCatalog(
  JSON.parse(readFileSync("public/catalog.json", "utf8")) as EncodedCatalog
);

/** same overlay hooks as the other rulers, so arms are comparable */
if (process.env.NO_COWATCH) for (const t of catalog) t.related = [];
if (process.env.ENRICH) {
  const data = JSON.parse(readFileSync(process.env.ENRICH, "utf8")) as {
    edges?: Record<string, string[]>;
    tags?: Record<string, string[]>;
  };
  for (const t of catalog) {
    const e = data.edges?.[t.id];
    if (e) t.related = e.filter((id) => id !== t.id);
    const g = data.tags?.[t.id];
    if (g?.length) t.keywords = [...t.keywords, ...g];
  }
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

const byName = new Map<string, Title>();
for (const t of catalog) {
  const k = t.title.en.toLowerCase();
  const prev = byName.get(k);
  if (!prev || t.voteCount > prev.voteCount) byName.set(k, t);
}

const PAGE = 20;
/** how deep to look when reporting where the partner actually landed */
const DEEP = 60;

/** "I liked A" — one like, nothing else. Where does B land? */
function rankOf(from: Title, to: Title): number {
  let p = emptyProfile();
  p = applySwipe(p, from, vf(from), "liked");
  const recs = recommend(pool, p, {
    excludeIds: new Set([from.id]),
    count: DEEP,
    seed: 7,
    vectorFor: vf,
    mode: "discover",
    likedTitles: [from],
  });
  const i = recs.findIndex((r) => r.title.id === to.id);
  return i < 0 ? Infinity : i + 1;
}

const rows: { a: string; b: string; hard: boolean; fwd: number; rev: number }[] = [];
const missing: string[] = [];

for (const [aName, bName, hard] of PAIRS) {
  const a = byName.get(aName.toLowerCase());
  const b = byName.get(bName.toLowerCase());
  if (!a || !b) {
    missing.push(!a ? aName : bName);
    continue;
  }
  rows.push({ a: aName, b: bName, hard, fwd: rankOf(a, b), rev: rankOf(b, a) });
}

const fmt = (r: number) => (r === Infinity ? "—" : String(r));
const hit = (r: number) => r <= PAGE;

console.log(
  `${rows.length} pairs (${missing.length ? `${missing.length} skipped: ${missing.join(", ")}` : "all found"})` +
    ` · one like, top ${PAGE}\n`
);

for (const group of [true, false]) {
  const set = rows.filter((r) => r.hard === group);
  console.log(group ? "HARD — crosses a genre line" : "EASY — same genre, a floor");
  for (const r of set) {
    const both = hit(r.fwd) && hit(r.rev);
    const one = hit(r.fwd) || hit(r.rev);
    console.log(
      `  ${both ? "✓✓" : one ? "✓·" : "··"} ${r.a} → ${r.b}` +
        `   [${fmt(r.fwd)} / ${fmt(r.rev)}]`
    );
  }
  const shots = set.flatMap((r) => [r.fwd, r.rev]);
  const found = shots.filter(hit).length;
  const ranks = shots.filter((r) => r !== Infinity);
  console.log(
    `  → ${found}/${shots.length} = ${Math.round((100 * found) / shots.length)}%` +
      `   · median rank of the ones found anywhere: ` +
      `${ranks.length ? [...ranks].sort((x, y) => x - y)[Math.floor(ranks.length / 2)] : "—"}` +
      `   · never in top ${DEEP}: ${shots.length - ranks.length}\n`
  );
}

const hardShots = rows.filter((r) => r.hard).flatMap((r) => [r.fwd, r.rev]);
const easyShots = rows.filter((r) => !r.hard).flatMap((r) => [r.fwd, r.rev]);
const pct = (xs: number[]) => Math.round((100 * xs.filter(hit).length) / xs.length);

console.log("─".repeat(70));
console.log(`  VIBE SCORE (hard pairs)    ${pct(hardShots)}%   ← the score of this project`);
console.log(`  easy pairs (floor)         ${pct(easyShots)}%`);
console.log("─".repeat(70));
