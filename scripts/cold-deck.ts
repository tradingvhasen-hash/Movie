/**
 * THE COLD DECK — the first twenty cards, which no ruler here has ever graded.
 *
 *   npx tsx scripts/cold-deck.ts
 *
 * A user reported that Discover had got better while the deck got worse, and
 * every instrument in this repo disagreed with him. He was right, and the
 * reason each ruler missed it is worth writing down, because it is the same
 * reason five times:
 *
 *   · the 500-people ruler builds one page from HALF A FULL LIBRARY — it has
 *     no idea what happens after three likes
 *   · the session ruler explicitly exempts the opening blocks, and that
 *     exemption is a line I wrote myself
 *   · the vibe pairs grade Discover, not the deck
 *
 * So the gap he complained about is exactly the gap I had excused from
 * judgement. This grades it.
 *
 * THE THIRD NUMBER IS THE IMPORTANT ONE. Discover and the deck rank the same
 * catalog with the same taste; the deck additionally applies a fame gate. So
 * if Discover finds a title and the deck cannot even see it, that is a gate
 * problem by definition, with no interpretation needed. When this was written
 * the answer was 3 of 15 — Anchorman, Wedding Crashers, Knocked Up and nine
 * others were locked out of the deck entirely for a viewer who had just liked
 * three broad comedies.
 *
 * TARGETS, written before the fix was measured:
 *
 *     own-genre share of the first 20   >= 60% after three likes
 *     reachable share of Discover's 15  >= 50%
 *     recognised share of the 20        >= 85%  (taste must not be bought
 *                                                with titles nobody knows)
 *
 * The third target began as "median fame rank <= 900" and that was the same
 * mistake this whole file is about. Fame across the entire catalog is a poor
 * proxy for "have you heard of it" once a taste is known: Anchorman sits at
 * rank 1,455 and every comedy viewer alive has seen it, while a documentary at
 * rank 800 is one they have not. So recognition is modelled the way the
 * session ruler already models it — the famous, plus your own corner far
 * deeper — rather than by a single catalog-wide cutoff. Median fame is still
 * printed, because it is the number that would hide a real collapse.
 */
import { readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { featurize } from "../src/lib/engine/features";
import {
  fameGate,
  fameTierSize,
  recommend,
  type CandidateItem,
} from "../src/lib/engine/recommend";
import { applySwipe, emptyProfile } from "../src/lib/engine/taste";
import { buildRarityIndex } from "../src/lib/engine/facets";
import type { Title } from "../src/lib/types";
import { loadFullCatalog } from "./lib/catalog";

const catalog = loadFullCatalog();
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

/**
 * Fame within its own kind, scaled back onto one axis — the same correction
 * the session ruler needed. TMDB vote counts are a film scale, so ranking
 * everything on one list calls famous series obscure: Gilmore Girls reads as
 * rank 4,481 on the combined list.
 */
const fameRank = new Map<string, number>();
for (const kind of ["movie", "tv"] as const) {
  const of = catalog.filter((t) => t.type === kind);
  [...of]
    .sort((a, b) => b.voteCount - a.voteCount)
    .forEach((t, i) =>
      fameRank.set(t.id, Math.round(((i + 1) * catalog.length) / of.length))
    );
}

const find = (n: string) =>
  catalog.find((t) => t.title.en.toLowerCase() === n.toLowerCase());

const SHOW = process.env.SHOW === "1";
const AT = (process.env.AT ?? "1,3,5,10").split(",").map(Number);

/** libraries named by hand — "top comedies by votes" is a superhero viewer */
const VIEWERS: { name: string; genre: string; likes: string[] }[] = [
  {
    name: "broad comedy",
    genre: "comedy",
    likes: [
      "The Hangover", "Superbad", "Step Brothers", "Bridesmaids", "Ted",
      "Tropic Thunder", "Anchorman: The Legend of Ron Burgundy", "Zoolander",
      "Dumb and Dumber", "Wedding Crashers",
    ],
  },
  {
    name: "horror",
    genre: "horror",
    likes: [
      "The Conjuring", "Hereditary", "The Shining", "Insidious", "Sinister",
      "It", "The Exorcist", "A Quiet Place", "Get Out", "The Ring",
    ],
  },
  {
    name: "science fiction",
    genre: "scifi",
    likes: [
      "Interstellar", "Blade Runner 2049", "Arrival", "Ex Machina", "The Matrix",
      "Inception", "District 9", "Edge of Tomorrow", "Looper", "Moon",
    ],
  },
];

let allPass = true;

for (const viewer of VIEWERS) {
  const titles = viewer.likes.map(find).filter((t): t is Title => Boolean(t));
  const isMine = (t: Title) =>
    t.genres.some((g) => g.toLowerCase() === viewer.genre.toLowerCase());

  /**
   * The same rule the session ruler uses: a viewer knows the famous, and knows
   * their own corner far deeper. A horror enthusiast has heard of obscure
   * horror, and that is a fact about people rather than a convenience.
   */
  const HEARD_OF = Number(process.env.HEARD_OF ?? 900);
  const HEARD_OF_IN_TASTE = Number(process.env.HEARD_OF_IN_TASTE ?? 2500);
  const knows = (t: Title) => {
    const r = fameRank.get(t.id) ?? Infinity;
    return r <= HEARD_OF || (isMine(t) && r <= HEARD_OF_IN_TASTE);
  };

  console.log(`\n${viewer.name} — ${titles.length} named titles available\n`);
  console.log(
    "  likes   own genre /20   reachable of Discover's 15   recognised   median fame"
  );

  const rows: {
    at: number;
    mine: number;
    reach: number;
    fame: number;
    known: number;
  }[] = [];

  for (const n of AT) {
    let p = emptyProfile();
    const shown = new Set<string>();
    const liked: Title[] = [];
    for (const t of titles.slice(0, n)) {
      p = applySwipe(p, t, vf(t), "liked");
      liked.push(t);
      shown.add(t.id);
    }

    const deck = recommend(pool, p, {
      excludeIds: shown,
      count: 20,
      seed: 7,
      vectorFor: vf,
      likedTitles: liked,
      mode: "swipe",
    });
    const disc = recommend(pool, p, {
      excludeIds: shown,
      count: 15,
      seed: 7,
      vectorFor: vf,
      likedTitles: liked,
      mode: "discover",
    });

    // the decisive number: can the deck even SEE what Discover recommends?
    const gate = new Set(
      fameGate(pool, fameTierSize(p, "swipe")).map((c) => c.title.id)
    );
    const reach = disc.filter((r) => gate.has(r.title.id)).length;

    const mine = deck.filter((r) => isMine(r.title)).length;
    const ranks = deck
      .map((r) => fameRank.get(r.title.id) ?? Infinity)
      .sort((a, b) => a - b);
    const fame = ranks[Math.floor(ranks.length / 2)];

    const known = deck.filter((r) => knows(r.title)).length;
    rows.push({ at: n, mine, reach, fame, known });
    console.log(
      `  ${String(n).padStart(5)}${String(mine).padStart(15)}` +
        `${`${reach}/15`.padStart(29)}${`${known}/20`.padStart(13)}` +
        `${String(fame).padStart(14)}`
    );

    if (SHOW && n === 3) {
      console.log("\n    deck:");
      for (const r of deck.slice(0, 10))
        console.log(`      ${isMine(r.title) ? "*" : " "} ${r.title.title.en}`);
      console.log("    discover:");
      for (const r of disc.slice(0, 10))
        console.log(
          `      ${gate.has(r.title.id) ? "in gate " : "LOCKED  "}${r.title.title.en}`
        );
      console.log();
    }
  }

  const three = rows.find((r) => r.at === 3) ?? rows[0];
  const checks: [string, boolean, string][] = [
    ["own genre >= 60% after 3 likes", three.mine >= 12, `${three.mine}/20`],
    ["can reach >= 50% of Discover's", three.reach >= 8, `${three.reach}/15`],
    [
      "recognised >= 85% of every deck",
      Math.min(...rows.map((r) => r.known)) >= 17,
      `worst ${Math.min(...rows.map((r) => r.known))}/20 · median fame up to ` +
        `${Math.max(...rows.map((r) => r.fame))}`,
    ],
  ];
  console.log();
  for (const [name, ok, detail] of checks) {
    if (!ok) allPass = false;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(32)} ${detail}`);
  }
}

console.log(`\n${allPass ? "all targets met" : "TARGETS MISSED"}\n`);
