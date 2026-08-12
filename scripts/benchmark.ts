/**
 * THE BENCHMARK — run this after every change to the engine.
 *
 *   npm run benchmark
 *
 * `simulate.ts` answers "is anything broken?". This answers the harder
 * question: "is it any good?" — and it is the one that decides whether a
 * change ships.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE THREE TESTS
 *
 * Each target film is a viewer's taste. Every run starts from a completely
 * fresh account: empty profile, empty history, nothing carried over.
 *
 *   TEST 1 — DECK REACH
 *     Swipe as that viewer would (right on the same kind of film, left
 *     otherwise). How many swipes before the target itself appears in the
 *     cards? Not a goal in itself — hundreds of titles usually fit a taste
 *     equally well, so any one of them is a needle — but a sharp detector for
 *     a deck that has stopped exploring.
 *
 *   TEST 2 — DISCOVER REACH
 *     Same, but the target is never swiped, and we ask how many swipes before
 *     it appears on the Discover page. This measures how fast the engine works
 *     out a taste well enough to recommend into it.
 *
 *   TEST 3 — DISCOVER QUALITY  ← the one that actually matters
 *     Of the titles Discover ends up showing, how many would a knowledgeable
 *     person genuinely recommend to someone who loves the target?
 *
 *     Genre overlap is not good enough to judge this: Mad Max: Fury Road and
 *     Rebel Moon are both "scifi/action/adventure" and could not be less
 *     alike. So each target carries a hand-written list of titles that are a
 *     real recommendation — the answer a person would give if asked "I loved
 *     X, what next?". Test 3 is the share of Discover that lands in that list.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * BASELINE — measured 2026-08-12, commit 94fe257 (co-watch deck fix).
 * These are the script's own numbers. Compare any change against them.
 *
 *   target               kind    fame    cards  discover  hit-rate  quality
 *   Rush Hour            genre   #940      83      80       33%       42%
 *   The Conjuring        genre   #240      31      25       33%       33%
 *   Mad Max: Fury Road   feel     #28     157      30       59%        0%
 *   Before Sunrise       feel   #1184      70      70       39%        8%
 *   Ride Along           genre  #2468     154     105       36%        0%
 *   High Noon            genre  #3671   never       5        5%        8%
 *   ────────────────────────────────────────────────────────────────────
 *   OVERALL QUALITY                                                   15%
 *   tastes defined by genre                                           21%
 *   tastes defined by feel                                             4%
 *
 * Read the quality column as a *relative* score, not an absolute grade. It
 * only counts exact matches against the hand-written lists, so a genuinely
 * good recommendation that simply is not on the list scores zero — judged by
 * eye the same pages look far better than 15%. What matters is the direction
 * it moves when the engine changes, and the gap between the last two lines.
 *
 * That gap is the whole story, and it is why the panel is built the way it is:
 *
 *   tastes defined by GENRE  ("cop comedies", "haunted-house horror")
 *      → the engine has real signal to work with, and it shows.
 *
 *   tastes defined by FEEL   ("quiet talky romance", "gritty practical action")
 *      → near zero. Mad Max: Fury Road and Rebel Moon are both
 *        "scifi/action/adventure" and could not be less alike; nothing in the
 *        catalog separates them, because the words describe events and
 *        categories, never mood. No amount of arithmetic on those words
 *        recovers information that was never in them.
 *
 * If a change is meant to add *understanding* rather than tuning, the Before
 * Sunrise and Mad Max numbers are where it has to show up.
 */
import { readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { featurize } from "../src/lib/engine/features";
import { recommend, type CandidateItem } from "../src/lib/engine/recommend";
import { applySwipe, emptyProfile } from "../src/lib/engine/taste";
import { buildRarityIndex } from "../src/lib/engine/facets";
import type { Title } from "../src/lib/types";

/* ── the taste panel ───────────────────────────────────────────────────────
   Six viewers, spread across difficulty and — more importantly — across the
   two kinds of taste. `recommend` is the ground truth for test 3: titles a
   person would actually name. Entries not present in the catalog are ignored
   and reported, so the panel can be written freely. */

interface Target {
  film: string;
  kind: "genre" | "feel";
  note: string;
  recommend: string[];
}

const PANEL: Target[] = [
  {
    film: "Rush Hour",
    kind: "genre",
    note: "mismatched-partner cop comedy",
    recommend: [
      "Beverly Hills Cop", "Beverly Hills Cop II", "Beverly Hills Cop III",
      "Bad Boys", "Bad Boys II", "Bad Boys for Life", "Lethal Weapon",
      "Lethal Weapon 2", "Lethal Weapon 3", "Lethal Weapon 4", "21 Jump Street",
      "22 Jump Street", "The Other Guys", "Starsky & Hutch", "Tango & Cash",
      "Men in Black", "Central Intelligence", "Ride Along", "Ride Along 2",
      "The Nice Guys", "Hot Fuzz", "Shanghai Noon", "Rush Hour 2", "Rush Hour 3",
      "The Heat", "The Hitman's Bodyguard", "Midnight Run", "48 Hrs.",
      "Kiss Kiss Bang Bang", "Blue Streak",
    ],
  },
  {
    film: "The Conjuring",
    kind: "genre",
    note: "supernatural haunting horror",
    recommend: [
      "Insidious", "Insidious: Chapter 2", "Insidious: Chapter 3",
      "Insidious: The Last Key", "Annabelle", "Annabelle: Creation",
      "Annabelle Comes Home", "The Nun", "The Nun II", "Sinister", "Sinister 2",
      "The Exorcist", "Poltergeist", "Paranormal Activity", "Paranormal Activity 2",
      "Oculus", "The Babadook", "Hereditary", "The Others", "The Ring",
      "Ouija: Origin of Evil", "The Amityville Horror", "Lights Out",
      "The Conjuring 2", "The Conjuring: The Devil Made Me Do It", "Dark Water",
      "The Grudge", "Ju-on: The Grudge", "Dead Silence", "The Woman in Black",
    ],
  },
  {
    film: "Mad Max: Fury Road",
    kind: "feel",
    note: "visceral, practical-effects action; almost no dialogue",
    recommend: [
      "John Wick", "John Wick: Chapter 2", "John Wick: Chapter 3 - Parabellum",
      "John Wick: Chapter 4", "Dredd", "The Raid", "The Raid 2",
      "Edge of Tomorrow", "Mad Max 2: The Road Warrior", "Mad Max",
      "Terminator 2: Judgment Day", "The Terminator", "Aliens", "District 9",
      "Snowpiercer", "Sicario", "Children of Men", "Predator", "Total Recall",
      "Kill Bill: Vol. 1", "Baby Driver", "Nobody", "Extraction", "The Northman",
      "Furiosa: A Mad Max Saga", "Atomic Blonde", "Upgrade", "Blade Runner 2049",
    ],
  },
  {
    film: "Before Sunrise",
    kind: "feel",
    note: "quiet, talky, romantic; two people and a conversation",
    recommend: [
      "Before Sunset", "Before Midnight", "Lost in Translation", "Her",
      "Eternal Sunshine of the Spotless Mind", "In the Mood for Love",
      "Call Me by Your Name", "La La Land", "Blue Valentine", "Past Lives",
      "Once", "Roman Holiday", "Manhattan", "Annie Hall", "(500) Days of Summer",
      "Brief Encounter", "Certified Copy", "Paterson", "Columbus", "Frances Ha",
      "Lady Bird", "Marriage Story", "The Worst Person in the World",
      "Aftersun", "Normal People", "Amélie", "Midnight in Paris",
      "Eat Pray Love", "Sideways",
    ],
  },
  {
    film: "Ride Along",
    kind: "genre",
    note: "broad buddy-cop comedy",
    recommend: [
      "Central Intelligence", "Rush Hour", "Rush Hour 2", "Bad Boys",
      "21 Jump Street", "22 Jump Street", "The Other Guys", "Get Hard",
      "Night School", "Jumanji: Welcome to the Jungle", "Beverly Hills Cop",
      "Tower Heist", "Grown Ups", "Let's Be Cops", "Hot Fuzz", "The Heat",
      "Starsky & Hutch", "Ride Along 2", "Bad Boys II", "Blue Streak",
      "The Hitman's Bodyguard", "Spy", "Tag", "Game Night",
    ],
  },
  {
    film: "High Noon",
    kind: "genre",
    note: "classic western",
    recommend: [
      "The Searchers", "Shane", "Rio Bravo", "The Good, the Bad and the Ugly",
      "A Fistful of Dollars", "For a Few Dollars More",
      "Once Upon a Time in the West", "The Magnificent Seven",
      "Butch Cassidy and the Sundance Kid", "Unforgiven", "Stagecoach",
      "True Grit", "3:10 to Yuma", "The Wild Bunch", "Tombstone",
      "Open Range", "The Man Who Shot Liberty Valance", "The Ox-Bow Incident",
      "My Darling Clementine", "Red River", "Django Unchained",
      "The Assassination of Jesse James by the Coward Robert Ford",
    ],
  },
];

/** fresh accounts, several of them, so no result is a lucky seed */
const SEEDS = [11, 707, 4242];
const CAP = 300;
const DISCOVER_SIZE = 24;
/**
 * Test 3 is graded once the viewer has liked this many titles — never at the
 * moment the target happens to surface, and not after a fixed number of
 * swipes either.
 *
 * Grading at arrival entangled quality with reach: a target found at swipe 5
 * was judged against a profile that knew almost nothing, and the same engine
 * scored 67% / 0% / 8% across three seeds of one target. A fixed swipe count
 * fixed the variance but was unfair across targets, because hit-rates differ
 * wildly (63% for Mad Max, 5% for High Noon) — 40 swipes is 25 likes for one
 * viewer and 2 for another. Counting likes asks every taste the same
 * question: "once you have told it twenty things you love, what does it
 * recommend?"
 */
const QUALITY_LIKES = 20;
/** how many of Discover's top slots test 3 grades */
const GRADED = 12;

const SOULS: Map<string, number[]> | undefined = process.env.SOULS
  ? new Map(Object.entries(JSON.parse(readFileSync(process.env.SOULS, "utf8"))))
  : undefined;

const catalog = decodeCatalog(
  JSON.parse(readFileSync("public/catalog.json", "utf8")) as EncodedCatalog
);
const pool: CandidateItem[] = catalog.map((title) => ({ title }));
buildRarityIndex(catalog);

const vecCache = new Map<string, Float32Array>();
const vectorFor = (t: Title) => {
  let v = vecCache.get(t.id);
  if (!v) {
    v = featurize(t);
    vecCache.set(t.id, v);
  }
  return v;
};

const byName = new Map(catalog.map((t) => [t.title.en.toLowerCase(), t]));
const fameRank = new Map(
  [...catalog].sort((a, b) => b.voteCount - a.voteCount).map((t, i) => [t.id, i + 1])
);
const genresOf = (t: Title) => new Set(t.genres.map((g) => g.toLowerCase()));

/**
 * How the simulated viewer swipes. Genre overlap is a crude stand-in for
 * human judgement, and deliberately *not* what the engine optimises, so the
 * engine has to discover the taste rather than being handed it. Its weakness
 * is single-genre targets, where little else in the catalog can clear the
 * bar — which is why the hit-rate column runs low for those.
 */
function swipesRight(target: Title) {
  const tg = genresOf(target);
  return (t: Title) => {
    const g = genresOf(t);
    let shared = 0;
    for (const x of g) if (tg.has(x)) shared++;
    return shared / new Set([...g, ...tg]).size >= 0.5;
  };
}

interface RunResult {
  reached: number;
  hitRate: number;
  discover: Title[];
}

/**
 * One fresh account.
 *  - "deck":     stop the moment the target appears in the cards
 *  - "discover": never swipe the target, so it stays eligible for Discover
 */
function run(
  target: Title,
  seed: number,
  mode: "deck" | "discover" | "quality"
): RunResult {
  const likesIt = swipesRight(target);
  let profile = emptyProfile();
  const shown = new Set<string>();
  const rated = new Set<string>();
  const liked: Title[] = [];
  let swipes = 0;
  let likes = 0;

  const discoverNow = () =>
    recommend(pool, profile, {
      excludeIds: rated,
      count: DISCOVER_SIZE,
      seed,
      vectorFor,
      mode: "discover",
      likedTitles: liked,
      souls: SOULS,
    }).map((r) => r.title);

  while (swipes < CAP) {
    const batch = recommend(pool, profile, {
      excludeIds: shown,
      count: 10,
      seed,
      vectorFor,
      likedTitles: liked,
      souls: SOULS,
    });
    if (batch.length === 0) break;

    for (const rec of batch) {
      if (swipes >= CAP) break;

      if (rec.title.id === target.id) {
        if (mode === "deck") {
          return { reached: swipes, hitRate: likes / Math.max(swipes, 1), discover: [] };
        }
        shown.add(rec.title.id); // seen, deliberately left unrated
        continue;
      }

      const like = likesIt(rec.title);
      if (like) {
        liked.push(rec.title);
        likes++;
      }
      profile = applySwipe(profile, rec.title, vectorFor(rec.title), like ? "liked" : "disliked");
      shown.add(rec.title.id);
      rated.add(rec.title.id);
      swipes++;

      if (mode === "quality" && likes >= QUALITY_LIKES) {
        return { reached: swipes, hitRate: likes / swipes, discover: discoverNow() };
      }
      if (mode === "discover" && swipes % 5 === 0) {
        const d = discoverNow();
        if (d.some((t) => t.id === target.id)) {
          return { reached: swipes, hitRate: likes / swipes, discover: d };
        }
      }
    }
  }
  return { reached: -1, hitRate: likes / Math.max(swipes, 1), discover: discoverNow() };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/* ── run the panel ─────────────────────────────────────────────────────── */

console.log(`catalog: ${catalog.length} titles · ${SEEDS.length} fresh accounts per target\n`);

interface Row {
  target: Target;
  film: Title;
  deck: string;
  discover: string;
  quality: number;
  hitRate: number;
  shown: Title[];
  hits: Title[];
  spread: string;
}
const rows: Row[] = [];

for (const target of PANEL) {
  const film = byName.get(target.film.toLowerCase());
  if (!film) {
    console.log(`⚠️  ${target.film} is not in the catalog — skipped`);
    continue;
  }

  const truth = new Set<string>();
  let missing = 0;
  for (const name of target.recommend) {
    const t = byName.get(name.toLowerCase());
    if (t) truth.add(t.id);
    else missing++;
  }

  const deckRuns = SEEDS.map((s) => run(film, s, "deck"));
  const discRuns = SEEDS.map((s) => run(film, s, "discover"));

  const fmt = (rs: RunResult[]) => {
    const ok = rs.filter((r) => r.reached >= 0).map((r) => r.reached);
    if (ok.length === 0) return `never`;
    const never = rs.length - ok.length;
    return `${median(ok)}${never ? ` (${never}✗)` : ""}`;
  };

  // grade every Discover page produced, then take the median
  const qualRuns = SEEDS.map((s) => run(film, s, "quality"));
  const graded = qualRuns.map((r) => {
    const top = r.discover.filter((t) => t.id !== film.id).slice(0, GRADED);
    const hits = top.filter((t) => truth.has(t.id));
    return { pct: top.length ? hits.length / top.length : 0, top, hits };
  });
  // show the run that *is* the median, not whichever seed happened to be
  // first — otherwise the printed list and the printed score disagree
  const ordered = [...graded].sort((a, b) => a.pct - b.pct);
  const best = ordered[Math.floor(ordered.length / 2)];
  const spread = graded.map((g) => `${Math.round(g.pct * 100)}%`).join(" / ");

  rows.push({
    target,
    film,
    deck: fmt(deckRuns),
    discover: fmt(discRuns),
    quality: median(graded.map((g) => g.pct)),
    hitRate: median(qualRuns.map((r) => r.hitRate)),
    shown: best.top,
    hits: best.hits,
    spread,
  });

  if (missing > 0) {
    console.log(
      `   note: ${missing}/${target.recommend.length} of the reference titles for ` +
        `${target.film} are not in this catalog`
    );
  }
}

console.log("\nTEST 1 & 2 — swipes needed, from a fresh account each time\n");
console.log("  target                kind   fame     cards      discover   swipe hit-rate");
for (const r of rows) {
  console.log(
    `  ${r.target.film.padEnd(21)} ${r.target.kind.padEnd(6)} #${String(fameRank.get(r.film.id)).padEnd(7)} ` +
      `${r.deck.padEnd(10)} ${r.discover.padEnd(10)} ${Math.round(r.hitRate * 100)}%`
  );
}

console.log(`\n\nTEST 3 — would a person actually recommend what Discover shows?\n`);
for (const r of rows) {
  console.log(
    `  ${r.target.film} — ${Math.round(r.quality * 100)}%  (${r.target.note})` +
      `   [per seed: ${r.spread}]`
  );
  for (const t of r.shown) {
    const good = r.hits.some((h) => h.id === t.id);
    console.log(`     ${good ? "✓" : "·"} ${t.title.en}`);
  }
  console.log();
}

/* ── the headline ──────────────────────────────────────────────────────── */

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(xs.length, 1);
const byGenre = rows.filter((r) => r.target.kind === "genre").map((r) => r.quality);
const byFeel = rows.filter((r) => r.target.kind === "feel").map((r) => r.quality);

console.log("─".repeat(70));
console.log(`  OVERALL QUALITY            ${Math.round(avg(rows.map((r) => r.quality)) * 100)}%`);
console.log(`  tastes defined by genre    ${Math.round(avg(byGenre) * 100)}%   (baseline 88%)`);
console.log(`  tastes defined by feel     ${Math.round(avg(byFeel) * 100)}%   (baseline 15%)`);
console.log("─".repeat(70));
console.log(
  `\n  The gap between those two lines is the state of the engine.\n` +
    `  Closing it needs understanding of mood and story, not more tuning.\n`
);
