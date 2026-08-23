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
 * THE FOUR TESTS
 *
 * Each target film is a viewer's taste. Every run starts from a completely
 * fresh account: empty profile, empty history, nothing carried over.
 *
 *   TEST 0 — THE FIRST PAGE
 *     What the very first Discover page is worth, before a single swipe. With
 *     no onboarding grid there is nothing to go on and it scores ~1%; with the
 *     grid, the viewer taps the tiles they love and the page is built from
 *     those taps alone. This is the only test that sees the onboarding screen,
 *     and the arm is opt-in:
 *
 *       PICKER=curated|derived|popular npm run benchmark   (default: off)
 *       PICKER_NEG=1|2                 also learn from the tiles left untapped
 *       SEEDS=8                        more fresh accounts, for close calls
 *
 *     Measured 2026-08-12, eight fresh accounts per viewer:
 *
 *       grid            first page   viewers with nothing to tap   after 20 likes
 *       none                  1%            —                          19%
 *       popularity list       4%            1 of 6                     17%
 *       genre × era          10%            1 of 6                     17%
 *       named canons          6%            none                       14%
 *       named + passes       11%            none                       18%
 *
 *     The last row is what ships. Two findings are worth keeping:
 *
 *     · Taps alone made the *later* session worse (19% → 14%). The simulated
 *       viewer taps anything sharing genres with its target — 12 Angry Men and
 *       The Sound of Music for a Before Sunrise fan — so six loose taps teach
 *       the engine six slightly wrong things, with no negative evidence to
 *       balance them. A real viewer taps films they love; this arm cannot.
 *     · Adding the untapped tiles as evidence recovers almost all of it
 *       (14% → 18%) and doubles the first page (6% → 11%). Evidence the grid
 *       was already collecting and throwing away.
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
import { resolveSeeds } from "../src/lib/data/taste-seeds";
import { featurize } from "../src/lib/engine/features";
import { recommend, type CandidateItem } from "../src/lib/engine/recommend";
import { applySwipe, emptyProfile } from "../src/lib/engine/taste";
import { buildRarityIndex } from "../src/lib/engine/facets";
import type { Title } from "../src/lib/types";
import { loadFullCatalog } from "./lib/catalog";

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
const ALL_SEEDS = [11, 707, 4242, 88, 1301, 5, 96431, 24601];
/** three is enough to spot a lucky run; SEEDS=8 when a gap needs settling */
const SEEDS = ALL_SEEDS.slice(0, Number(process.env.SEEDS ?? 3));
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

const catalog = loadFullCatalog();

/**
 * Experimental: swap or augment the catalog's co-watch edges with
 * model-written recommendation lists. AI_EDGES=ai | union | off (default).
 * Off by default and never used by the app — this is a measurement harness.
 */
if (process.env.AI_EDGES && process.env.AI_EDGES !== "off") {
  const raw = JSON.parse(
    readFileSync(process.env.AI_EDGES_FILE ?? "scripts/data/ai-edges.json", "utf8")
  ) as Record<string, string[]>;
  const idOf = new Map(catalog.map((t) => [t.title.en.toLowerCase(), t.id]));
  const byIdTmp = new Map(catalog.map((t) => [t.id, t]));
  let applied = 0;
  for (const [name, recs] of Object.entries(raw)) {
    const id = idOf.get(name.toLowerCase());
    if (!id) continue;
    const t = byIdTmp.get(id)!;
    const aiIds = recs
      .map((r) => idOf.get(r.toLowerCase()))
      .filter((x): x is string => Boolean(x) && x !== id);
    t.related =
      process.env.AI_EDGES === "ai"
        ? aiIds
        : [...new Set([...aiIds, ...(t.related ?? [])])].slice(0, 20);
    applied++;
  }
  console.log(`AI edges: ${process.env.AI_EDGES} mode, applied to ${applied} titles\n`);
}
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

/* ── the onboarding grid, as an optional arm ───────────────────────────────
   PICKER=curated | derived | popular | off (default)

   The panel above starts every viewer from a blank profile, so it is blind to
   the "pick a few you love" screen — the change that most affects a real first
   session. This arm runs the same six viewers through that screen first: they
   tap the tiles they would love (the same genre-overlap judgement they swipe
   with), and only then does the run begin.

   Three grids are implemented so the comparison is real rather than a
   before/after of one:
     popular — straight down the vote-count list (the first version shipped)
     derived — genre × era buckets, best-known title per bucket (the second)
     curated — the hand-named audience canons in taste-seeds.ts (current)
*/
const PICKER = process.env.PICKER ?? "off";
/** how many tiles a viewer is assumed to tap — a real one taps a handful */
const MAX_PICKS = 6;
const GRID_SIZE = 50;

function buildGrid(mode: string): Title[] {
  const byVotes = [...catalog].sort((a, b) => b.voteCount - a.voteCount);
  if (mode === "curated") return resolveSeeds(catalog, GRID_SIZE);
  if (mode === "popular") return byVotes.slice(0, GRID_SIZE);

  // the genre × era version, kept here only so it can still be measured
  const eras: ((y: number) => boolean)[] = [
    (y) => y < 1980,
    (y) => y >= 1980 && y < 2000,
    (y) => y >= 2000 && y < 2012,
    (y) => y >= 2012,
  ];
  const buckets = new Map<string, Title[]>();
  for (const t of byVotes) {
    const era = eras.findIndex((test) => test(t.year));
    if (era < 0) continue;
    for (const g of t.genres.slice(0, 2)) {
      const key = `${g.toLowerCase()}|${era}`;
      const lane = buckets.get(key) ?? [];
      if (lane.length < 6) lane.push(t);
      buckets.set(key, lane);
    }
  }
  const lanes = [...buckets.values()].sort((a, b) => b[0].voteCount - a[0].voteCount);
  const out: Title[] = [];
  const used = new Set<string>();
  for (let round = 0; out.length < GRID_SIZE && round < 6; round++) {
    for (const lane of lanes) {
      if (out.length >= GRID_SIZE) break;
      const pick = lane[round];
      if (pick && !used.has(pick.id)) {
        used.add(pick.id);
        out.push(pick);
      }
    }
  }
  return out;
}

const GRID = PICKER === "off" ? [] : buildGrid(PICKER);

interface RunResult {
  reached: number;
  hitRate: number;
  discover: Title[];
  /** tiles this viewer would have tapped, before any swipe */
  picked: number;
}

/**
 * One fresh account.
 *  - "deck":     stop the moment the target appears in the cards
 *  - "discover": never swipe the target, so it stays eligible for Discover
 */
function run(
  target: Title,
  seed: number,
  mode: "deck" | "discover" | "quality" | "cold"
): RunResult {
  const likesIt = swipesRight(target);
  let profile = emptyProfile();
  const shown = new Set<string>();
  const rated = new Set<string>();
  const liked: Title[] = [];
  let swipes = 0;
  let likes = 0;

  /* the onboarding screen, when this arm is on: tap the tiles you love.
     Picks are likes, but they are not swipes — a real user has swiped nothing
     at this point — so they do not count toward the reach or quality clocks. */
  let picked = 0;
  const tapped = new Set<string>();
  for (const tile of GRID) {
    if (picked >= MAX_PICKS) break;
    if (tile.id === target.id || !likesIt(tile)) continue;
    profile = applySwipe(profile, tile, vectorFor(tile), "liked");
    liked.push(tile);
    shown.add(tile.id);
    rated.add(tile.id);
    tapped.add(tile.id);
    picked++;
  }
  /* PICKER_NEG=1: the tiles the viewer looked at and did *not* tap.
     A grid of fifty produces up to six likes and no negatives at all, so
     everything those six touch — era, language, genre — is inflated with
     nothing to push back. The other forty-odd tiles were examined and passed
     over, which is exactly what a swipe-up means. */
  if (process.env.PICKER_NEG) {
    for (const tile of GRID) {
      if (tile.id === target.id || tapped.has(tile.id)) continue;
      profile = applySwipe(profile, tile, vectorFor(tile), "not_seen");
      // NEG=1 also retires the tile (a swipe would). Separating that matters:
      // retiring forty famous crowd-pleasers improves Discover on its own,
      // which is a different claim from learning anything.
      if (process.env.PICKER_NEG === "1") {
        shown.add(tile.id);
        rated.add(tile.id);
      }
    }
  }

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

  // what a brand-new account sees on Discover having only tapped the grid
  if (mode === "cold") return { reached: 0, hitRate: 0, discover: discoverNow(), picked };

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
          return { reached: swipes, hitRate: likes / Math.max(swipes, 1), discover: [], picked };
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
        return { reached: swipes, hitRate: likes / swipes, discover: discoverNow(), picked };
      }
      if (mode === "discover" && swipes % 5 === 0) {
        const d = discoverNow();
        if (d.some((t) => t.id === target.id)) {
          return { reached: swipes, hitRate: likes / swipes, discover: d, picked };
        }
      }
    }
  }
  return { reached: -1, hitRate: likes / Math.max(swipes, 1), discover: discoverNow(), picked };
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
  /** picker arm: tiles tapped, and the Discover page they alone produce */
  picked: number;
  cold: number;
  coldShown: Title[];
  coldHits: Title[];
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

  // TEST 0 — the very first Discover page, built from the grid taps alone
  const coldRuns = SEEDS.map((s) => run(film, s, "cold"));
  const coldGraded = coldRuns.map((r) => {
    const top = r.discover.filter((t) => t.id !== film.id).slice(0, GRADED);
    return { pct: top.length ? top.filter((t) => truth.has(t.id)).length / top.length : 0, top };
  });
  const coldOrdered = [...coldGraded].sort((a, b) => a.pct - b.pct);
  const coldMid = coldOrdered[Math.floor(coldOrdered.length / 2)];

  rows.push({
    picked: coldRuns.length ? coldRuns[0].picked : 0,
    cold: median(coldGraded.map((g) => g.pct)),
    coldShown: coldMid?.top ?? [],
    coldHits: (coldMid?.top ?? []).filter((t) => truth.has(t.id)),
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

if (true) {
  console.log(
    `\nTEST 0 — the onboarding grid (${PICKER}, ${GRID.length} tiles, up to ` +
      `${MAX_PICKS} taps)\n\n` +
      `  Quality of the very first Discover page, built from the taps alone —\n` +
      `  zero swipes. This is what a brand-new account actually sees.\n`
  );
  console.log("  target                 tiles this viewer would tap   first-page quality");
  for (const r of rows) {
    console.log(
      `  ${r.target.film.padEnd(21)} ${String(r.picked).padStart(10)}` +
        `                     ${String(Math.round(r.cold * 100) + "%").padStart(6)}`
    );
  }
  console.log();
  for (const r of rows) {
    if (!r.coldShown.length) continue;
    console.log(`  ${r.target.film} — first page:`);
    for (const t of r.coldShown) {
      console.log(`     ${r.coldHits.some((h) => h.id === t.id) ? "✓" : "·"} ${t.title.en}`);
    }
    console.log();
  }
  const coldAvg = rows.reduce((s, r) => s + r.cold, 0) / Math.max(rows.length, 1);
  const noTaps = rows.filter((r) => r.picked === 0).map((r) => r.target.film);
  console.log(`  first-page quality, all six viewers: ${Math.round(coldAvg * 100)}%`);
  console.log(
    `  viewers who found nothing to tap: ${noTaps.length ? noTaps.join(", ") : "none"}\n`
  );
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
