/**
 * THE FEEL RULER — can the engine recover a taste that genres cannot express?
 *
 *   npm run feel
 *
 * `benchmark.ts` grades six viewers whose taste is a *genre rule*: they swipe
 * right on anything sharing genres with their target. That persona is fine for
 * "cop comedies" and useless for what this project is actually about — a
 * viewer who likes Brooklyn Nine-Nine and wants Modern Family, or likes Mad
 * Max and does not want Rebel Moon. It cannot even express such a taste, so
 * the benchmark's feel line has read 0% through every change and told us
 * nothing about any of them. We were tuning by an instrument that is blind in
 * the one direction that matters.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HOW IT WORKS
 *
 * A taste is named, not described: a list of films and shows that a person
 * would say share a feel, deliberately spread across genres so that genre
 * overlap cannot solve it. Each list is cut in half at random:
 *
 *     half  →  liked, and handed to the engine as the viewer's library
 *     half  →  HELD OUT, and never shown to the engine at all
 *
 * The engine's Discover page is then graded against the held-out half. Four
 * different random cuts per taste, so no result rests on one lucky split.
 *
 * Two numbers are reported:
 *
 *   HITS@12   how much of the first page is in the held-out half.
 *             Chance is printed alongside it — with ~8 held-out titles in a
 *             catalog of 5,555, a random page scores about 1.7%, so 8% is
 *             not "bad", it is roughly five times chance.
 *
 *   BEST RANK where the first held-out title lands in a 200-long list.
 *             This moves when hits@12 is still stuck at zero, which is
 *             exactly the situation the feel line has been in.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IT CANNOT TELL YOU
 *
 * These lists are written by the same model that will later write the "soul"
 * text for the catalog. The engine never sees the lists — it sees only TMDB
 * metadata — so "can it recover a human grouping?" is a fair question. But if
 * a future arm scores well *because* the soul text encodes the same opinions
 * that shaped these lists, the agreement is partly self-fulfilling. Treat a
 * gain here as a strong hint, and confirm it against real audience behaviour
 * (the TMDB co-watch overlap check) before believing it.
 *
 * Arms:
 *   AI_EDGES=1   overlay the hand-written recommendation edges
 *   NO_COWATCH=1 strip TMDB's co-watch links, so nothing rides on free
 *                external data and only the metadata is being graded
 */
import { readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { featurize } from "../src/lib/engine/features";
import { recommend, type CandidateItem } from "../src/lib/engine/recommend";
import { applySwipe, emptyProfile } from "../src/lib/engine/taste";
import { buildRarityIndex } from "../src/lib/engine/facets";
import type { Title } from "../src/lib/types";

const catalog = decodeCatalog(
  JSON.parse(readFileSync("public/catalog.json", "utf8")) as EncodedCatalog
);
const idOf = new Map(catalog.map((t) => [t.title.en.toLowerCase(), t.id]));

if (process.env.AI_EDGES) {
  const raw = JSON.parse(
    readFileSync("scripts/data/ai-edges.json", "utf8")
  ) as Record<string, string[]>;
  const byId = new Map(catalog.map((t) => [t.id, t]));
  for (const [n, recs] of Object.entries(raw)) {
    const id = idOf.get(n.toLowerCase());
    if (!id) continue;
    byId.get(id)!.related = recs
      .map((r) => idOf.get(r.toLowerCase()))
      .filter((x): x is string => Boolean(x) && x !== id);
  }
}
if (process.env.NO_COWATCH) for (const t of catalog) t.related = [];

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

/* ── the tastes ────────────────────────────────────────────────────────────
   Each is a feel, not a category. Note how many of them cross genres: the
   comfort-sitcom taste spans workplace comedy, family mockumentary and sport;
   the dread taste spans folk horror, ghost story and science fiction. A genre
   rule cannot express any of these, which is the point. */
const TASTES: [string, string[]][] = [
  [
    "gritty, practical, physical action",
    [
      "John Wick", "John Wick: Chapter 2", "Dredd", "The Raid", "Edge of Tomorrow",
      "Terminator 2: Judgment Day", "Aliens", "District 9", "Snowpiercer", "Sicario",
      "Children of Men", "Predator", "Total Recall", "Kill Bill: Vol. 1", "Baby Driver",
      "Nobody", "Extraction", "Atomic Blonde", "Upgrade", "Blade Runner 2049",
      "Mad Max 2: The Road Warrior", "The Northman",
    ],
  ],
  [
    "quiet, talky, two people and a conversation",
    [
      "Before Sunset", "Before Midnight", "Lost in Translation", "Her",
      "Eternal Sunshine of the Spotless Mind", "In the Mood for Love",
      "Call Me by Your Name", "La La Land", "Blue Valentine", "Once",
      "Annie Hall", "(500) Days of Summer", "Frances Ha", "Lady Bird",
      "Marriage Story", "Amélie", "Midnight in Paris", "Sideways", "Manhattan",
      "Past Lives", "Paterson", "Columbus",
    ],
  ],
  [
    "warm ensemble comfort comedy — the Brooklyn Nine-Nine question",
    [
      "Brooklyn Nine-Nine", "The Office", "Parks and Recreation", "Modern Family",
      "Friends", "New Girl", "Community", "Schitt's Creek", "Ted Lasso",
      "Superstore", "Cheers", "Frasier", "Scrubs", "30 Rock", "How I Met Your Mother",
      "The Good Place", "Arrested Development", "Abbott Elementary",
    ],
  ],
  [
    "slow-burn dread, not jump scares",
    [
      "Hereditary", "The Witch", "It Follows", "The Babadook", "Midsommar",
      "Under the Skin", "The Lighthouse", "A Ghost Story", "Session 9",
      "The Others", "Don't Look Now", "Rosemary's Baby", "The Shining",
      "Let the Right One In", "The Wailing", "Kill List", "Saint Maud",
      "The Innocents",
    ],
  ],
  [
    "dry, deadpan, absurd comedy",
    [
      "The Grand Budapest Hotel", "Fargo", "Burn After Reading", "In Bruges",
      "The Big Lebowski", "Napoleon Dynamite", "Barton Fink", "The Death of Stalin",
      "Jojo Rabbit", "What We Do in the Shadows", "Hunt for the Wilderpeople",
      "Little Miss Sunshine", "The Nice Guys", "A Serious Man", "Rushmore",
      "The Royal Tenenbaums", "Raising Arizona", "Office Space",
    ],
  ],
  [
    "sweeping epic, built rather than rendered",
    [
      "Lawrence of Arabia", "Ben-Hur", "Gladiator", "Braveheart", "The Last Samurai",
      "Dances with Wolves", "Kingdom of Heaven", "Master and Commander: The Far Side of the World",
      "The Revenant", "1917", "Dunkirk", "Apocalypse Now", "Seven Samurai",
      "Legends of the Fall", "The Mission", "Doctor Zhivago", "Spartacus",
      "The Bridge on the River Kwai",
    ],
  ],
  [
    "puzzle films that rearrange themselves",
    [
      "Memento", "Primer", "Inception", "Shutter Island", "The Prestige", "Arrival",
      "Predestination", "Coherence", "Donnie Darko", "Mulholland Drive", "Enemy",
      "The Machinist", "Fight Club", "Triangle", "Time Crimes", "Source Code",
      "Looper", "Oldboy",
    ],
  ],
];

/** deterministic shuffle, so a "random" cut is reproducible */
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

const FOLDS = [3, 41, 907, 12345];
const PAGE = 12;
const DEEP = 60;

console.log(
  `catalog ${catalog.length} · AI edges ${process.env.AI_EDGES ? "ON" : "off"}` +
    ` · co-watch ${process.env.NO_COWATCH ? "STRIPPED" : "on"}\n`
);

const summary: { label: string; hits: number; chance: number; rank: number }[] = [];

for (const [label, names] of TASTES) {
  const films = names.map(find).filter((t): t is Title => Boolean(t));
  const gone = names.length - films.length;

  const hitPcts: number[] = [];
  const bestRanks: number[] = [];
  let sample: { recs: Title[]; held: Set<string> } | null = null;

  for (const fold of FOLDS) {
    const mixed = shuffle(films, fold);
    const half = Math.floor(mixed.length / 2);
    const library = mixed.slice(0, half);
    const held = new Set(mixed.slice(half).map((t) => t.id));

    let p = emptyProfile();
    const excl = new Set<string>();
    for (const t of library) {
      p = applySwipe(p, t, vf(t), "liked");
      excl.add(t.id);
    }

    const recs = recommend(pool, p, {
      excludeIds: excl,
      count: DEEP,
      seed: fold,
      vectorFor: vf,
      mode: "discover",
      likedTitles: library,
    }).map((r) => r.title);

    const top = recs.slice(0, PAGE);
    hitPcts.push(top.filter((t) => held.has(t.id)).length / PAGE);
    const first = recs.findIndex((t) => held.has(t.id));
    bestRanks.push(first < 0 ? DEEP + 1 : first + 1);
    if (!sample) sample = { recs: top, held };
  }

  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const held = Math.ceil(films.length / 2);
  // a random page of 12 from the catalog, given this many held-out titles
  const chance = (PAGE * held) / catalog.length;

  summary.push({
    label,
    hits: mean(hitPcts),
    chance,
    rank: [...bestRanks].sort((a, b) => a - b)[Math.floor(bestRanks.length / 2)],
  });

  console.log(
    `${label}\n  ${films.length} titles in catalog${gone ? ` (${gone} missing)` : ""}` +
      ` · ${Math.round(mean(hitPcts) * 100)}% of page 1 held out` +
      ` (chance ${(chance * 100).toFixed(1)}%)` +
      ` · first hit at rank ${summary[summary.length - 1].rank}`
  );
  if (sample) {
    console.log(
      "  " +
        sample.recs
          .map((t) => (sample!.held.has(t.id) ? `✓ ${t.title.en}` : `· ${t.title.en}`))
          .join("\n  ")
    );
  }
  console.log();
}

const meanHits = summary.reduce((s, r) => s + r.hits, 0) / summary.length;
const meanChance = summary.reduce((s, r) => s + r.chance, 0) / summary.length;
const meanRank = summary.reduce((s, r) => s + r.rank, 0) / summary.length;

console.log("─".repeat(70));
console.log(`  FEEL SCORE          ${(meanHits * 100).toFixed(1)}%   (chance ${(meanChance * 100).toFixed(1)}%)`);
console.log(`  lift over chance    ${(meanHits / meanChance).toFixed(1)}×`);
console.log(`  median first hit    rank ${Math.round(meanRank)} of ${DEEP}`);
console.log("─".repeat(70));
