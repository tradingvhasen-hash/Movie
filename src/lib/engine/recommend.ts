import { cosine, qualityPrior, reachPrior, recognizability, DIM } from "./features";
import {
  explainMatch,
  facetScore,
  matchPercent,
  titleTokens,
  type FacetTables,
} from "./facets";
import {
  isCalibrating,
  seenTrust,
  tasteConfidence,
  watchLikelihood,
  type TasteProfile,
} from "./taste";
import type { Recommendation, Title } from "../types";

export interface CandidateItem {
  title: Title;
  /** optional: the diversity pass builds vectors lazily for finalists only */
  vector?: Float32Array;
}

/* ── scoring weights ───────────────────────────────────────────────────
   The facet score carries the taste signal and is scaled by confidence, so
   early on the quality and recognizability priors dominate and the deck
   stays full of titles the user has a real chance of having watched. */
/**
 * Swept again when a user asked why famous, off-taste films keep appearing —
 * The Dark Knight for someone who has liked ten broad comedies. The score
 * composition confirmed him exactly: fame contributed +0.89 to that card
 * against +0.65 for Role Models, while the taste term separated them by only
 * 0.18. But *amplifying* taste is not the answer. On the 200-swipe ruler:
 *
 *     1.6 (shipped)   29  9  6  6  ·  30 19 16 22
 *     3               28  6 10  4  ·  31 18 18 19
 *     5               28  7  3  2  ·  31 18  6  2
 *
 * At five the deck locks onto whatever the tables currently believe and stops
 * recovering. Lowering the fame weight instead was swept too (0.55 → 0.1) and
 * moved nothing. The lever that worked was neither: it was how deep the gate
 * reaches inside the viewer's own corner — a supply problem, not a weighting
 * one, which is the third time today that has been the answer.
 */
const W_FACETS = 1.6;
/**
 * Weight of the meaning signal, when meaning-vectors are supplied.
 *
 * MEASURED, AND IT DID NOT WORK — read this before trying it again.
 * All 5,555 titles were embedded locally (all-MiniLM-L6-v2, free, 57s) from
 * their own text: title, genres, overview, keywords, director, cast. Then the
 * benchmark was run at several weights, twice — once on the shipped
 * 200-character overviews and again after re-fetching full-length ones:
 *
 *     baseline (no meaning)      15% overall, 4% on feel-defined tastes
 *     clipped text  w=0.25/0.5/0.9   13% / 8% / 13%,  feel 0%
 *     full text     w=0.4/0.8/1.4    13% / 11% / 15%, feel 0%
 *
 * Never better, and the feel line — the whole point — went to zero every
 * time. The reason showed up in a direct probe: Mad Max ↔ Rebel Moon scored
 * 0.359 while Mad Max ↔ John Wick scored 0.307. Their *plots* really are
 * alike (warrior versus tyrant in a wasteland); what separates them is craft
 * and tone, and no plot summary mentions craft or tone.
 *
 * So the bottleneck is the text, not the comparison. Embedding a summary
 * faithfully preserves a summary. The `souls` option below is kept because it
 * is the hook for the next experiment — text actually written to describe
 * mood and craft — but nothing supplies it today.
 */
const W_SOUL = 1.4;
const W_QUALITY = 0.25;
/**
 * Pull toward well-known titles. This stays high even once taste is
 * established: a perfectly-matched film with 300 ratings is still a film the
 * user has never heard of, and a deck of those reads as random.
 */
const W_RECOGNITION_COLD = 0.9;
const W_RECOGNITION_WARM = 0.55;
/**
 * In Discover, recognisability is barely rewarded at all — it is kept only
 * to break ties away from titles with almost no ratings. Ranking a
 * recommendation list by fame surfaces what the user has already watched.
 */
const W_RECOGNITION_DISCOVER = 0.12;

/**
 * Diversity, and why the two surfaces need different amounts of it.
 *
 * The deck needs plenty. A new user has told us nothing, and a batch of ten
 * near-identical cards teaches us almost nothing about them — variety is how
 * a taste gets *found*.
 *
 * Discover needs almost none. By then the taste is known and the user is
 * asking "what should I watch", so forcing a deliberately-different title into
 * the list means handing them something the engine itself scores at 48% while
 * an 80% match sits unshown. Measured on a five-sitcom library: at deck-level
 * diversity Discover returned The Lord of the Rings, Breaking Bad and The
 * Departed alongside the sitcoms; at a quarter of it, seven of eight were
 * strong matches and one stayed different.
 *
 * Both were on one dial until now — an oversight, since fame, exploration and
 * recognisability had already been split by mode.
 */
const MMR_LAMBDA = 0.35;
/** extra penalty per already-picked result sharing a genre */
const GENRE_REPEAT_PENALTY = 0.16;
/** measurement knob for the deck's share, swept in scripts/deck-drift.ts */
const DECK_DIVERSITY_SCALE =
  typeof process !== "undefined" && process.env?.DECK_DIVERSITY
    ? Number(process.env.DECK_DIVERSITY)
    : 0.25;

/** Discover keeps a quarter of it: one window for discovery, not four */
const DISCOVER_DIVERSITY_SCALE =
  typeof process !== "undefined" && process.env?.DIVERSITY
    ? Number(process.env.DIVERSITY)
    : 0.25;
/**
 * Where a blended score sits on the "recommend this" scale, used only to turn
 * it into the percentage shown to the user. Roughly the centre and half-width
 * of the range scores occupy in Discover.
 */
const RANK_MIDPOINT = 0.4;
/**
 * Widened after using the app: at 0.6 a heavy user saw four cards all reading
 * exactly 95%, which implies a precision the number does not have. Widening
 * helps, but only so far — the honest finding is that the top ten results out
 * of four thousand really are near-equally good, so this figure is flat at the
 * top no matter how it is scaled. The reason line under each card is what
 * actually distinguishes them.
 */
const RANK_SPREAD = 2.2;

/** how many top-scored candidates the diversity pass considers */
const FINALIST_POOL = 60;

/**
 * RE-RANK COST AFTER THE CATALOG GREW, stated rather than buried.
 *
 * The catalog went from 5,555 titles to 12,826 and a re-rank went from a 24ms
 * median to roughly 33-38ms against a 40ms guard. Profiled, at 120 swipes:
 *
 *     the whole re-rank        58 ms
 *     of which the graph walk  21 ms
 *     of which the fame gate    8 ms
 *
 * The walk dominates and its cost barely moves with the number of liked
 * titles, because `WALK_FRONTIER` caps hop two at 600 nodes however many seeds
 * it started from. Caching it (below) removes the work on every swipe that is
 * not a like, which is most of them.
 *
 * Sweeping the frontier at 150 / 300 / 600 produced 38.5 / 33.7 / 35.4ms —
 * no ordering at all, because this machine's timing varies by about 5ms
 * between identical runs. There is no signal here to tune against, so nothing
 * was tuned. The guard is now marginal rather than comfortable, it is measured
 * off the swipe critical path (the re-rank is already non-blocking), and if it
 * ever matters on a real phone the answer is to ship less catalog, not to
 * shave the walk.
 */

/* ── fame gate ─────────────────────────────────────────────────────────
   Obscure titles never enter the queue, at any stage. The tier widens as
   the user proves how much they watch, but even the widest tier is the top
   3,000 of the catalog by vote count — "99% of these I've never heard of"
   is a pool problem, and this is where it is fixed. */
/**
 * Discovery is the opposite problem to swiping.
 *
 * A card can only be rated if the user has heard of the title, so the deck is
 * gated hard on fame. A recommendation is only useful if they *haven't* seen
 * it — and the titles they are most likely to have already seen are exactly
 * the famous ones. Running Discover through the swipe settings meant it drew
 * from the top ~1,800 of the catalog and led with the 23rd most-watched film
 * in existence: a correct answer to the wrong question.
 *
 * It kept a floor at the top 4,000 on the theory that thinner metadata below
 * that could not be matched on anyway. Measured, that theory was wrong: the
 * floor was hiding 28% of the catalog and cost 2 points of benchmark quality
 * (17% → 19%). Discover now draws from everything.
 *
 * This matches what the retrieval-bottleneck literature reports — that the
 * limiting factor in cold-start recommendation is usually whether the right
 * item entered the candidate pool at all, not how it was scored once there.
 * The deck keeps its fame tiers, because a card you have never heard of is
 * genuinely unratable.
 */
const DISCOVER_POOL = Infinity;

export type RankMode = "swipe" | "discover";

/**
 * How much of what we have shown this viewer they had actually seen.
 *
 * The engine has stored both halves of this since the swipe-up was taught to
 * teach, and never once read them. Every widening of the pool was driven by a
 * swipe counter — "they have swiped a lot, they must watch a lot" — while the
 * viewer was answering "never heard of it" over and over and nothing listened.
 */
export function recognitionRate(profile: TasteProfile): number {
  const answered = profile.seenCount + profile.unseenCount;
  if (answered === 0) return 0;
  return profile.seenCount / answered;
}

/**
 * How much the rate above can be believed yet.
 *
 * This used to be handled inside `recognitionRate` by returning 1 when fewer
 * than ten cards had been answered — "assume the pool is fine rather than
 * punish a new account". That reads as generous and is the opposite: a rate of
 * 1 relaxes the recognition weight all the way to its warm setting, so the
 * viewer we know *least* about was the one being pushed deepest into the
 * catalog. It is the same inversion that was fixed when this stopped following
 * confidence, reappearing at the cold-start boundary.
 *
 * A new account now holds the cold setting and earns its way out of it.
 */
function recognitionEvidence(profile: TasteProfile): number {
  return Math.min(1, (profile.seenCount + profile.unseenCount) / 20);
}

/**
 * How deep into the catalog the deck may reach.
 *
 * This was three fixed steps on a swipe counter — 800 titles, then 1,800 after
 * forty rated swipes, then 3,000 — and it only ever widened. A viewer who kept
 * answering "never heard of it" was pushed deeper anyway, and the median card
 * sank from the 200th best-known title to the 1,200th over a session.
 *
 * It is now a ledger. Every title the viewer has actually seen earns a little
 * more depth; every "never heard of it" pays some of it back. That reacts on
 * the next card rather than after a threshold, and it cannot run away: the
 * pool a viewer ends up with is the one they demonstrated they can follow.
 */
/**
 * The ratio of these two is the whole design, and it is arithmetic rather than
 * taste: the pool stops moving when TIER_PER_SEEN x seen equals
 * TIER_PER_UNSEEN x unseen, so a ratio of six settles at a viewer recognising
 * six cards in seven — 86%. A first attempt used 20 and 15, which settles at
 * 43% recognised, and measured exactly that badly.
 */
const TIER_BASE =
  typeof process !== "undefined" && process.env?.TIER_BASE
    ? Number(process.env.TIER_BASE)
    : 900;
const TIER_PER_SEEN = 5;
const TIER_PER_UNSEEN = 30;
const TIER_MAX =
  typeof process !== "undefined" && process.env?.TIER_MAX
    ? Number(process.env.TIER_MAX)
    : 3000;

export function fameTierSize(profile: TasteProfile, mode: RankMode = "swipe"): number {
  if (mode === "discover") return DISCOVER_POOL;
  const earned =
    TIER_BASE + TIER_PER_SEEN * profile.seenCount - TIER_PER_UNSEEN * profile.unseenCount;
  // however far it contracts, always leave a healthy margin of unswiped titles
  const answered = profile.seenCount + profile.unseenCount;
  return Math.min(TIER_MAX, Math.max(earned, answered + 300));
}

/**
 * Pool ordered by fame — but fame measured *within its own kind*.
 *
 * TMDB vote counts are a film scale. A famous series collects a fraction of
 * the votes a mid-tier film does, so ranking everything on one list quietly
 * deleted television from the deck: of 1,187 series in the catalog, 42 sat
 * inside the top 800, against 21% of the catalog being series.
 *
 * What that meant in practice, reported by a user and then confirmed here:
 * someone who says they love Brooklyn Nine-Nine and asks for more of the same
 * cannot be shown The Office (rank 1,018), How I Met Your Mother (928) or
 * Modern Family (1,751) — nor Brooklyn Nine-Nine itself (1,463). The three
 * answers any person would give were locked out of the first forty cards by
 * arithmetic, and no amount of taste modelling could reach them.
 *
 * So the gate now takes the same *share* of each kind. A tier of 800 out of
 * 5,555 is the top 14%, and it stays the top 14% of films and the top 14% of
 * series rather than the top 14% of one merged list. Both lists are still
 * ordered by fame inside themselves, so nothing obscure gets in.
 */
const fameOrder = new WeakMap<CandidateItem[], { movie: CandidateItem[]; tv: CandidateItem[] }>();

/**
 * Fame, and the second scale it is blind to.
 *
 * The paragraph above explains why a vote count cannot be compared between
 * film and television. The identical thing is true of language: TMDB's voters
 * are overwhelmingly Western, so a vote count is an English scale. An Egyptian
 * film fifty million people watched carries perhaps eighty votes; a mid-tier
 * American comedy carries three thousand. Ranked together, every non-English
 * title sorts below every English one and the gate never reaches it.
 *
 * TRIED THE OBVIOUS FIX AND IT WAS WRONG. Ranking every title by its
 * percentile *within its own language* is the exact analogue of the film/TV
 * split and it looks right on paper. Measured, absolute harvest fell 16% —
 * because the gate's ~900 slots then get split across 27 languages for
 * everybody, including the viewer who only watches English. It hands every new
 * person a deck proportional to the **catalog's** languages instead of to
 * **theirs**, which is the same class of error as answering "have you seen
 * this?" with a global vote count.
 *
 * So the language lists are built here but not merged. `fameGate` opens a door
 * into them only for languages the viewer has shown they watch — see
 * `languageDoor`. A new account gets the global fame order unchanged, which is
 * exactly today's behaviour, and the door opens on evidence.
 */
function fameLists(pool: CandidateItem[]) {
  let lists = fameOrder.get(pool);
  if (!lists) {
    // GATE_REACH=1 orders the queue by the model's reach estimate instead of
    // the vote count. This is where reach should matter most if it matters at
    // all: the gate is what decides an Egyptian film with eighty TMDB votes
    // sits at rank 8,000 and is never offered to anyone.
    const byReach = typeof process !== "undefined" && process.env?.GATE_REACH === "1";
    const sorted = [...pool].sort((a, b) =>
      byReach
        ? reachPrior(b.title) - reachPrior(a.title) ||
          b.title.voteCount - a.title.voteCount
        : b.title.voteCount - a.title.voteCount
    );
    lists = {
      movie: sorted.filter((c) => c.title.type !== "tv"),
      tv: sorted.filter((c) => c.title.type === "tv"),
    };
    fameOrder.set(pool, lists);
  }
  return lists;
}

/** per-language fame order, built once per pool, read only through the door */
const langOrder = new WeakMap<CandidateItem[], Map<string, CandidateItem[]>>();

function languageLists(pool: CandidateItem[]): Map<string, CandidateItem[]> {
  let lists = langOrder.get(pool);
  if (!lists) {
    lists = new Map();
    for (const c of pool) {
      const key = c.title.originalLanguage;
      const list = lists.get(key);
      if (list) list.push(c);
      else lists.set(key, [c]);
    }
    for (const list of lists.values()) {
      list.sort((a, b) => b.title.voteCount - a.title.voteCount);
    }
    langOrder.set(pool, lists);
  }
  return lists;
}

/**
 * Which languages this viewer actually watches, and how deep to go in each.
 *
 * Read from the exposure tables rather than the taste tables, because the
 * question is "have you seen it", not "did you like it" — someone can watch a
 * great deal of Hindi cinema and rate most of it badly, and they should still
 * be asked about Hindi films.
 *
 * English needs no door: it is already the whole of the global fame order.
 * Everything else is invisible without one, which is the point.
 */
const LANG_DOOR_MASS = 2;

function languageDoor(profile: TasteProfile | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!profile) return out;
  const table = profile.seenFacets.language;
  for (const lang of Object.keys(table)) {
    if (lang === "en") continue;
    const [net, mass] = table[lang];
    if (mass < LANG_DOOR_MASS || net <= 0) continue;
    // share of the door proportional to how consistently they have seen it
    out.set(lang, Math.min(1, net / mass));
  }
  return out;
}

/**
 * The titles the gate actually admits.
 *
 * Exported because instruments must not reimplement it. The session ruler
 * measured what the deck was missing against "the top N of the catalog by
 * votes" and reported a ranking failure that did not exist: the gate takes
 * the top share of films and the top share of series *separately*, so at a
 * limit of 865 it holds the 623 best-known films and the 233 best-known
 * series, not the 865 best-known titles. Halloween sat outside it, and the
 * ruler was blaming the ranking for not showing a card it was never offered.
 */
/**
 * How much deeper the gate reaches for a title inside the viewer's taste.
 *
 * A hard fame cutoff answers "would they have heard of this?" with a fact
 * about the whole catalog, and that answer is wrong the moment a taste is
 * known. Measured on a viewer who had just liked three broad comedies, the
 * gate locked out Anchorman, Wedding Crashers, Knocked Up, Pineapple Express
 * and Old School — films that viewer has certainly seen — while admitting
 * Spirited Away, District 9 and Death Note, which they may well not have. Of
 * the fifteen titles Discover recommended, the deck could not even see twelve,
 * and it got *worse* as the taste sharpened: 12 of 15 reachable after one
 * like, 1 of 15 after ten.
 *
 * So the gate now models recognition the way people actually work: everybody
 * knows the famous, and everybody knows their own corner far deeper. That is
 * the same rule the session ruler has used to decide what its simulated viewer
 * has heard of since before this problem was found.
 *
 * NOT the taste door that was tried and rejected in v10. That admitted any
 * graph neighbour at any depth and cost eight points of recognition. This is
 * bounded — a fixed multiple of the gate, and only on the genre the viewer has
 * demonstrably liked — so a deep obscurity stays out whether the graph likes
 * it or not.
 */
const TASTE_DEPTH =
  typeof process !== "undefined" && process.env?.TASTE_DEPTH
    ? Number(process.env.TASTE_DEPTH)
    : 2.5;

/**
 * Is this title in the viewer's own corner?
 *
 * Cheap on purpose — only the genre facet, which is the dimension recognition
 * actually follows. The bar is a *mean* rather than a sign: the first version
 * admitted any genre with positive net evidence, and after a hundred swipes
 * almost every genre carries some, so the deep half of the gate opened for
 * everything and session recognition fell from 93% to 81%. A viewer's corner
 * is the handful of genres they like *consistently*, not every genre they have
 * ever nodded at.
 */
/** how far below the favourite a genre may sit and still count as the corner */
const TASTE_MARGIN =
  typeof process !== "undefined" && process.env?.TASTE_MARGIN
    ? Number(process.env.TASTE_MARGIN)
    : 0.15;

/**
 * The genres the deep half of the gate opens for — the viewer's corner.
 *
 * Narrowed twice, both times by measurement. Admitting any genre with positive
 * evidence took session recognition from 93% to 81%: after a hundred swipes
 * nearly every genre carries some positive, so "deep" applied to everything.
 * Requiring a consistent mean was not enough either. What works is the
 * favourite and whatever ties with it, which is what "your own corner" means
 * to a person and what the session ruler has always assumed.
 */
/**
 * Your corner is your *favourite* genre, not a genre that clears a bar.
 *
 * This asked for an absolute mean above 0.4, and that turned the mechanism off
 * exactly when it was needed. A viewer swiping through his own genre rejects
 * most of it — the comedies he does not care for are still comedies — so
 * `comedy` falls from 0.36 to 0.13 across 150 swipes even while he is liking
 * comedies. Below the bar the corner emptied, the deep half of the gate closed,
 * and 93 of the 131 titles in his hand-written taste sat unswiped and
 * unreachable. **The taste locked itself out.**
 *
 * Rejecting most of a genre is what having a specific taste looks like from the
 * inside, and it says nothing about whether the genre is still yours. What
 * identifies a corner is that nothing else comes close, so the test is
 * relative: the best genre, plus whatever ties with it, provided it is liked at
 * all and there is enough evidence that one lucky swipe cannot claim it.
 */
const CORNER_MASS = 3;

function corner(facets: FacetTables): Set<string> {
  const table = facets.genre;
  let best = -Infinity;
  const means = new Map<string, number>();
  for (const g of Object.keys(table)) {
    const [net, mass] = table[g];
    if (mass < CORNER_MASS) continue;
    const mean = net / mass;
    means.set(g, mean);
    if (mean > best) best = mean;
  }
  const out = new Set<string>();
  if (best <= 0) return out;
  for (const [g, mean] of means) {
    if (mean >= best - TASTE_MARGIN) out.add(g);
  }
  return out;
}

/**
 * The titles the gate actually admits.
 *
 * Exported because instruments must not reimplement it. The session ruler
 * measured what the deck was missing against "the top N of the catalog by
 * votes" and reported a ranking failure that did not exist: the gate takes
 * the top share of films and the top share of series *separately*, so at a
 * limit of 865 it holds the 623 best-known films and the 233 best-known
 * series, not the 865 best-known titles. Halloween sat outside it, and the
 * ruler was blaming the ranking for not showing a card it was never offered.
 */
/**
 * How much wider than the gate to look before choosing who gets in.
 *
 * The gate's ordering was global fame, which is a claim about humanity and
 * was measured against one real viewer at AUC 0.453 — worse than a coin. The
 * ranking already stopped believing it (`watchLikelihood`); the gate still
 * did, so the deck could rank beautifully over a pool chosen by the wrong
 * question. A viewer's own corner reached in via `TASTE_DEPTH`, but that is a
 * genre filter standing in for a model we now actually have.
 *
 * So the gate considers this many gate-fulls of the fame-ordered list and
 * keeps the ones *this person* is most likely to have watched. Not the whole
 * catalog: fame is a weak signal, not a worthless one, and reading the bottom
 * of a 5,555-title list through a model built on a hundred swipes would let
 * one shared keyword drag something genuinely obscure into the deck.
 *
 * With no swipes yet `watchLikelihood` returns the fame prior unchanged, so
 * this reduces *exactly* to the old gate at cold start and personalises at
 * precisely the rate the evidence justifies — the same measured trust curve,
 * with no second constant to tune.
 */
const GATE_WIDTH =
  typeof process !== "undefined" && process.env?.GATE_WIDTH
    ? Number(process.env.GATE_WIDTH)
    : 3;

/**
 * TRIED AND REJECTED: reserving part of the gate for the fame order.
 *
 * Personalising the gate and the co-watch graph both answer "more of what this
 * person already chose", so the obvious worry is that they compound and the
 * pool closes in. Reserving a share of every gate for titles chosen by fame
 * alone would guarantee a frontier for exploration and the graph to reach into,
 * however confident the exposure model became.
 *
 * Built, and it earns nothing. The tunnel-vision guard reads 1.39x at a reserve
 * of half the gate, three quarters, and none at all — identical to three
 * decimal places, because that guard's persona never swipes up, so its answers
 * carry no exposure information, `seenTrust` is zero and the personal gate is
 * not running at all. And on the real-label ruler the reserve is a straight
 * cost:
 *
 *     reserve none      82.7      (30 seeds)
 *     reserve a quarter 78.9
 *     reserve a half    75.5
 *
 * The compounding it was built for is not there to prevent. What made the
 * guard move was `answerBalance`, which correctly stops trusting an exposure
 * model built from a viewer who answered the same way every time — and the
 * 1.39x it exposed is what the engine read *before* any of this shipped.
 */

export function fameGate(
  pool: CandidateItem[],
  limit: number,
  facets?: FacetTables,
  profile?: TasteProfile
): CandidateItem[] {
  const { movie, tv } = fameLists(pool);
  const shareOf = (n: number) =>
    !Number.isFinite(n) || n >= pool.length ? 1 : n / Math.max(pool.length, 1);

  // zero when the viewer has taught us nothing, so the work is skipped
  // entirely on the first cards rather than computed and thrown away
  const personal = profile && seenTrust(profile) > 0 ? profile : null;
  const door = languageDoor(profile);
  const langs = door.size > 0 ? languageLists(pool) : null;

  const reorder = (list: CandidateItem[], keep: number) => {
    if (!personal || keep >= list.length) return list.slice(0, keep);
    const window = list.slice(0, Math.min(list.length, Math.round(keep * GATE_WIDTH)));

    /**
     * The door: the best-known titles of the languages this viewer watches,
     * added to the window so `watchLikelihood` can rank them against the rest.
     *
     * Without this they are unreachable by arithmetic — an Arabic film sits
     * near global rank 8,000 and the window ends at 2,700. With it they are
     * merely *candidates*, and the exposure model decides, which is the whole
     * difference between this and the version that cost 16% of harvest.
     */
    if (langs) {
      const kind = list === fameLists(pool).tv ? "tv" : "movie";
      const seen = new Set(window.map((c) => c.title.id));
      for (const [lang, strength] of door) {
        const src = langs.get(lang);
        if (!src) continue;
        let taken = 0;
        const room = Math.round(keep * strength);
        for (const c of src) {
          if (taken >= room) break;
          if ((c.title.type === "tv") !== (kind === "tv")) continue;
          if (seen.has(c.title.id)) continue;
          window.push(c);
          taken++;
        }
      }
    }
    const scored = window.map((c) => ({
      c,
      w: watchLikelihood(personal, titleTokens(c.title), reachPrior(c.title)),
    }));
    scored.sort((a, b) => b.w - a.w);
    return scored.slice(0, keep).map((s) => s.c);
  };

  const mine = facets ? corner(facets) : null;
  const take = (list: CandidateItem[]) => {
    const base = Math.round(list.length * shareOf(limit));
    if (!mine || mine.size === 0) return reorder(list, base);
    // anchored to the base rather than the contracted gate. The ledger
    // narrows the pool when a viewer keeps answering "never heard of it", and
    // that is right about the catalog at large — but their own corner is the
    // part they *do* know, and it should not shrink with it. Without this a
    // viewer who swipes up a lot ends up with a gate of 400 holding 8 of the
    // 131 titles in their taste.
    const deep = Math.round(
      list.length * shareOf(Math.max(limit, TIER_BASE) * TASTE_DEPTH)
    );
    return [
      ...reorder(list, base),
      ...list
        .slice(base, deep)
        .filter((c) => c.title.genres.some((g) => mine.has(g.toLowerCase()))),
    ];
  };

  const kept = [...take(movie), ...take(tv)];
  // back into fame order. Concatenating the two lists left every film ahead of
  // every series, and the exploration pass takes the first twelve candidates
  // of a genre from this array — so it could never pick a series at all.
  kept.sort((a, b) => b.title.voteCount - a.title.voteCount);
  return kept;
}

/** pool → every genre in it, computed once per catalog */
const genreIndex = new WeakMap<CandidateItem[], string[]>();

function allGenres(pool: CandidateItem[]): string[] {
  let list = genreIndex.get(pool);
  if (!list) {
    const set = new Set<string>();
    for (const c of pool) for (const g of c.title.genres) set.add(g.toLowerCase());
    list = [...set];
    genreIndex.set(pool, list);
  }
  return list;
}

/* ── exploration ───────────────────────────────────────────────────────── */

/**
 * Share of each batch spent deliberately off-profile.
 *
 * Without it the deck can only recycle what it already knows, so a genre the
 * user loves but was never shown stays undiscovered — the "it kept giving me
 * the same movies" complaint. A quarter of the early batches probe genres we
 * have no evidence about, tapering once the picture is filled in.
 */
export function exploreRatioFor(profile: TasteProfile): number {
  if (process.env?.EXPLORE) return Number(process.env.EXPLORE);
  if (profile.ratedSwipes === 0) return 0;
  const warm = Math.min(1, profile.totalSwipes / 60);
  // Halved from 0.25. A quarter of the deck spent on probes was set when the
  // ranking had little else to offer; now that the graph carries real signal,
  // measured on 500 real libraries, that quarter costs 2.4 points of accuracy
  // (25.7% with no probing, 23.3% with a quarter). Exploration still earns its
  // place — the tunnel-vision check exists for exactly this — but it no longer
  // gets to spend one card in four proving it.
  return 0.12 - 0.06 * warm;
}

/**
 * Per-user tie-break, in [-0.5, 0.5].
 *
 * A pure function of (title, seed), so a card keeps the same nudge for the
 * whole session — the deck is stable while you swipe — but two users ranking
 * the same catalog never see the same order. Without it the engine is fully
 * deterministic and everyone's opening deck was identical.
 */
function jitterFor(id: string, seed: number): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) / 4294967296) - 0.5;
}

/** how far the tie-break may move a score (scores span roughly 0…1.5) */
const JITTER = 0.09;

/** deterministic, seedable PRNG (mulberry32) */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Genres ranked by how little we know about the user's opinion of them,
 * least-known first. This is the "show me something different" list, and it
 * is evidence-driven rather than random: once a genre has been tested a few
 * times it stops being a candidate for exploration.
 */
function unexploredGenres(
  facets: FacetTables,
  pool: CandidateItem[],
  rng: () => number
): string[] {
  const table = facets.genre;
  return allGenres(pool)
    .map((g) => ({ g, mass: table[g]?.[1] ?? 0, jitter: rng() }))
    .sort((a, b) => a.mass - b.mass || a.jitter - b.jitter)
    .map((x) => x.g);
}

/* ── co-watch signal ───────────────────────────────────────────────────── */

/** how much a single co-watch link can add */
const CO_WATCH_HIT = 0.22;
/** ceiling, so a title recommended by many likes cannot swamp everything */
const CO_WATCH_MAX =
  typeof process !== "undefined" && process.env?.COWATCH_MAX
    ? Number(process.env.COWATCH_MAX)
    : 0.85;

/**
 * The two surfaces want opposite things from this signal.
 *
 * Discover answers "what should I watch now", and a tight circle around what
 * you already love is exactly right — at full strength it took a comedy-only
 * library from 8/12 to 12/12.
 *
 * The swipe deck is where you *teach* the engine, and there the same tightness
 * is harmful: every like drags in only its own ~8 neighbours, so 20 likes pin
 * roughly 160 titles to the top of every batch and crowd out everything else.
 * Measured, that pushed La La Land from 20 swipes away to 101, and
 * Interstellar from 165 to 233 — the deck circles inside one family instead of
 * mapping the rest of your taste.
 */
/**
 * The deck's share of the graph — and the reason it is not Discover's 32.
 *
 * At 0.3 (where it sat while Discover moved to 32) the deck was ignoring the
 * signal entirely: fame contributed up to 0.9 to a card's score and the graph
 * at most 0.26, so someone who had just said they love Brooklyn Nine-Nine was
 * shown Interstellar, Spirited Away and Schindler's List. Reported by a user,
 * then reproduced exactly by scripts/deck-probe.ts.
 *
 * Graded on 500 real libraries in swipe mode — a ruler that did not exist
 * until that complaint, because every earlier ruler graded Discover only:
 *
 *     weight     0.3    2     8    12    16    32
 *     accuracy  19.3  20.0  22.4  22.8  23.8  23.3
 *     reach     0.90x       0.95x 0.87x 1.13x 1.23x   (guard: <=1.15x)
 *
 * 12 rather than the higher-scoring 16 or 32: the deck is where a taste is
 * *taught*, and above roughly 16 it starts circling its own suggestions —
 * the tunnel-vision guard in simulate.ts fails outright at 32. At 12 the deck
 * is both more accurate and faster to reach a new taste than with the signal
 * switched off, which is the combination worth having.
 *
 * Re-swept when the graph became real co-watching rather than a prediction of
 * it. A better graph pulls harder, so the same weight now circles more:
 *
 *     weight            0.3   0.4  0.45   0.5   0.6
 *     real people      26.5  27.2  27.7  27.9  28.5
 *     swipes to reach  1.15  1.09  1.09  1.16  1.22   (guard: <=1.15x)
 *
 * 0.45 rather than the higher-scoring 0.6, for the reason the guard exists:
 * the deck is where a taste is *taught*, and the top of that sweep fails it
 * outright. The cost is under a point of accuracy, well inside the interval,
 * and it buys back the deck's ability to find a taste it has not been shown.
 *
 * The guard itself is noisy — it times four specific needles, and one of them
 * flipping moves the ratio by several points — so the pass is taken with a
 * margin rather than at the line.
 */
/**
 * Re-swept once the gate stopped starving the deck, and the answer moved.
 *
 * A user's own 200-swipe log showed the deck still fading, and the probe found
 * why: at swipe 150 the facet tables scored *High School Musical* at +0.77 and
 * *Charlie's Angels* at +0.78 for a broad-comedy viewer, against +0.49 for
 * Groundhog Day and +0.56 for Meet the Parents. The tables had learned "comedy,
 * teenagers, friends" literally — the right category and the wrong feel, which
 * is the failure this project exists to fix, reappearing at card 150.
 *
 * The graph does not make that mistake; The Hangover's neighbours are not High
 * School Musical. It was simply too quiet to overrule the tables.
 *
 *     weight     0.45   0.8   1.2   1.6
 *     session      54    63    67    73   (up-heavy strategy)
 *                  88    92    91    89   (left-heavy)
 *     500 people 30.9  32.0     -     -
 *     long tail   7.2   9.9     -     -
 *     guard      1.47  1.39  3.21  3.55   (limit 1.15)
 *
 * 0.8 is the best setting on every ruler here, and above it the guard breaks
 * outright.
 *
 * CORRECTION, and the error was mine. This paragraph used to claim 0.8
 * "improves every ruler at once, including the tunnel-vision guard" — while
 * the table directly above it records that guard at 1.39 against a limit of
 * 1.15. It has never passed at this weight. The mistake went unnoticed because
 * the exposure model briefly masked it: that guard's persona never swipes up,
 * and until `answerBalance` shipped, a viewer who had answered "watched" to
 * everything was still trusted, which happened to widen the pool and read 1.05.
 * Removing that false trust was correct and restored the true reading.
 *
 * So: 0.8 costs this guard and always has. The alternative is 0.6, which passes
 * it at 1.10 and costs the long tail (10.9% to 8.6%), a cold-deck target, and
 * the real-label ruler (82.7 to 77.4 over 30 seeds) — because co-watch is the
 * mechanism that reaches obscure titles at all. Four rulers prefer 0.8 and one
 * prefers 0.6.
 *
 * 0.8 stays, and the failure is recorded rather than papered over. The guard
 * itself needs a look it has not had: reaching four *named* titles is a needle
 * hunt by its own admission, and its absolute numbers now say the deck finds
 * them in 305 swipes where the build that set the 1.15 limit took 547.
 */
const CO_WATCH_DECK_SCALE = 0.8;

/**
 * Discover's share of the graph signal.
 *
 * This number looks absurd next to the 0.15 it replaced, and the reason is
 * that the graph underneath it is a different object. It used to be TMDB's
 * "also watched" list, which points at sequels and same-season releases; at
 * full strength it dragged the engine down to 13.6% on real people, so it was
 * throttled almost off. It is now the distilled graph — where 200,000 people's
 * behaviour implies each title sits — and the sweep runs the other way:
 *
 *     weight        0.6    2     4     8    16    32    64
 *     real people  19.4  20.8  22.4  24.5  25.6  27.3  26.4
 *
 * A signal worth trusting wants to be trusted. The old one never was.
 *
 * Swept again on the behavioural graph, and it wants more still:
 *
 *     weight        0.6    1.0    1.6    2.4    3.2
 *     real people  32.6   34.3   34.1   34.2   34.1
 *     long tail    12.4   14.5   15.2   15.7   15.8
 *
 * Accuracy arrives by 1.0 and the long tail by 1.6, and both are flat after.
 * 1.6 is where the curve has landed; going further would be trusting the
 * graph more than the measurement asks for, and Discover still has to hold
 * a single-taste library together (simulate check 8).
 */
const CO_WATCH_DISCOVER_SCALE = 1.6;

/** measurement only, deck side. Unset in the browser. */
const DECK_ENV =
  typeof process !== "undefined" && process.env?.DECK_COWATCH
    ? Number(process.env.DECK_COWATCH)
    : null;

/** measurement only: COWATCH=0.5 npm run human. Unset in the browser. */
const COWATCH_ENV =
  typeof process !== "undefined" && process.env?.COWATCH
    ? Number(process.env.COWATCH)
    : null;

/**
 * Score candidates by what the people who watched your favourites went on to
 * watch.
 *
 * This is the one thing the facet tables structurally cannot do. They can
 * only connect two titles through a value both carry, and measured on the
 * real catalog *The Hangover* and *Rush Hour* share exactly one — the word
 * "comedy". Their keyword lists ("amnesia, blackjack, chapel" against
 * "martial arts, fbi, chinese mafia") describe events, never the feel that
 * makes them the same kind of night in. TMDB's audience data knows they go
 * together because the same people watch both.
 *
 * Links are ordered by relevance, so earlier ones count for more, and hits
 * from several different likes accumulate — a title recommended by four of
 * your favourites is a stronger bet than one recommended by a single one.
 */
export interface CoWatch {
  score: number;
  /** id of the liked title that contributed most — a real "because you liked" */
  from: string;
  fromStrength: number;
}

export function coWatchBonus(liked: Title[]): Map<string, CoWatch> {
  const bonus = new Map<string, CoWatch>();
  for (const title of liked) {
    const links = title.related;
    if (!links || links.length === 0) continue;
    for (let rank = 0; rank < links.length; rank++) {
      // first neighbour ≈ full weight, last ≈ 40%
      const positional = 1 - (0.6 * rank) / links.length;
      const add = CO_WATCH_HIT * positional;
      const id = links[rank];
      const prev = bonus.get(id);
      if (!prev) {
        bonus.set(id, { score: add, from: title.id, fromStrength: add });
      } else {
        prev.score = Math.min(CO_WATCH_MAX, prev.score + add);
        if (add > prev.fromStrength) {
          prev.from = title.id;
          prev.fromStrength = add;
        }
      }
    }
  }
  return bonus;
}

/* ── walking the graph ──────────────────────────────────────────────────
   `coWatchBonus` above looks exactly one step out from each liked title. That
   is why adding edges did nothing measurable: a fourth or fifth neighbour of a
   film you liked lands in the same small neighbourhood the first three already
   reached, so it is more of what we had rather than more reach.

   Two hops is different in kind. If A points at B and B points at C, there is
   evidence for A→C that no single source ever wrote down — and C can sit in a
   part of the catalog no direct edge from A touches. This is the same shape as
   the graph recommenders (P3α / RP3β, Pinterest's Pixie) that keep beating far
   heavier models, and at 5,555 titles it costs almost nothing.

   Two details carry the whole result:

   · SYMMETRY. Edges are followed in both directions. Measured earlier as five
     lines for the largest single gain in the bake-off (25.3 → 26.3), because
     half the useful links only existed one way round.

   · DEGREE DAMPING. Arriving mass is divided by the target's own connectivity,
     raised to GAMMA. Without it a walk of any length drains into the handful
     of famous titles that everything links to, and the recommendations become
     a popularity list with extra steps — which is precisely the failure that
     forced the co-watch weight down to 0.15 in the first place. */

interface Graph {
  /** node → its neighbours and the weight of each link */
  out: Map<string, { to: string; w: number }[]>;
  /** node → total weight arriving at it, for damping */
  deg: Map<string, number>;
}

const graphCache = new WeakMap<CandidateItem[], Graph>();

function buildGraph(pool: CandidateItem[]): Graph {
  const cached = graphCache.get(pool);
  if (cached) return cached;

  const out = new Map<string, { to: string; w: number }[]>();
  const deg = new Map<string, number>();
  const link = (a: string, b: string, w: number) => {
    const list = out.get(a);
    if (list) list.push({ to: b, w });
    else out.set(a, [{ to: b, w }]);
    deg.set(b, (deg.get(b) ?? 0) + w);
  };

  for (const c of pool) {
    const links = c.title.related;
    if (!links?.length) continue;
    for (let rank = 0; rank < links.length; rank++) {
      // a source's own ordering is information: its first pick is not its last
      const w = 1 - (0.6 * rank) / links.length;
      link(c.title.id, links[rank], w);
      link(links[rank], c.title.id, w);
    }
  }

  const graph = { out, deg };
  graphCache.set(pool, graph);
  return graph;
}

/** how far the walk goes. Three hops is where the returns stop. */
const WALK_HOPS = Number(process.env.HOPS ?? 2);
/** mass surviving each further hop, so near neighbours still outrank far ones */
const WALK_DECAY = 0.55;
/** strength of the damping against well-connected titles */
const WALK_GAMMA = 0.6;
/** nodes carried into the next hop — bounds the cost, changes nothing else */
const WALK_FRONTIER = 600;

/**
 * The walk costs about 20ms on the current graph and is recomputed on every
 * re-rank — but a re-rank happens after *every* swipe, and the liked list only
 * changes on a right-swipe. Two thirds of the work was being thrown away.
 *
 * The list is append-only, so its length plus its last id identify it exactly;
 * there is no need to hash the whole thing. Keyed on the pool as well, so a
 * different catalog never reads another's answer.
 */
const walkCache = new WeakMap<
  CandidateItem[],
  { key: string; value: Map<string, CoWatch> }
>();

export function walkBonus(pool: CandidateItem[], liked: Title[]): Map<string, CoWatch> {
  const key = `${liked.length}|${liked[liked.length - 1]?.id ?? ""}`;
  const hit = walkCache.get(pool);
  if (hit && hit.key === key) return hit.value;

  const graph = buildGraph(pool);
  const visits = new Map<string, CoWatch>();
  const seeds = new Set(liked.map((t) => t.id));

  // every liked title starts with the same mass, and carries its own identity
  // along so a recommendation can still say which like produced it
  let frontier = liked.map((t) => ({ id: t.id, mass: 1 / liked.length, from: t.id }));

  for (let hop = 1; hop <= WALK_HOPS; hop++) {
    const next = new Map<string, { mass: number; from: string; fromMass: number }>();

    for (const node of frontier) {
      const edges = graph.out.get(node.id);
      if (!edges?.length) continue;
      let total = 0;
      for (const e of edges) total += e.w;

      for (const e of edges) {
        if (seeds.has(e.to)) continue; // never recommend what they gave us
        const damp = Math.pow(graph.deg.get(e.to) ?? 1, WALK_GAMMA);
        const share = (node.mass * (e.w / total)) / damp;
        const prev = next.get(e.to);
        if (!prev) {
          next.set(e.to, { mass: share, from: node.from, fromMass: share });
        } else {
          prev.mass += share;
          if (share > prev.fromMass) {
            prev.from = node.from;
            prev.fromMass = share;
          }
        }
      }
    }

    const decay = Math.pow(WALK_DECAY, hop - 1);
    for (const [id, v] of next) {
      const add = v.mass * decay;
      const prev = visits.get(id);
      if (!prev) {
        visits.set(id, { score: add, from: v.from, fromStrength: add });
      } else {
        prev.score += add;
        if (add > prev.fromStrength) {
          prev.from = v.from;
          prev.fromStrength = add;
        }
      }
    }

    if (hop === WALK_HOPS) break;
    frontier = [...next.entries()]
      .sort((a, b) => b[1].mass - a[1].mass)
      .slice(0, WALK_FRONTIER)
      .map(([id, v]) => ({ id, mass: v.mass, from: v.from }));
  }

  /**
   * Rescale so the strongest candidate always scores 1.
   *
   * Without this the signal quietly dies as a library grows, because the walk
   * starts with one unit of mass split across everything the viewer has liked:
   * five likes give each seed a fifth, fifty likes give each a fiftieth, and
   * the visits at the far end shrink with them. Measured over a simulated
   * session, the graph's contribution to the cards on screen fell from 0.011
   * in the first ten swipes to 0.002 by the eightieth — an 80% collapse — while
   * the keyword model, which is scaled by confidence and therefore *rises*,
   * silently took over. That is exactly what a user described: the first ten
   * cards felt hand-picked and by the sixtieth they were merely the right
   * genre.
   *
   * The graph's job is to rank, not to have an opinion about how much someone
   * has swiped. Its scale is now fixed and its weight lives entirely in the
   * one constant per surface.
   */
  let peak = 0;
  for (const v of visits.values()) if (v.score > peak) peak = v.score;
  if (peak > 0) {
    for (const v of visits.values()) {
      v.score /= peak;
      v.fromStrength /= peak;
    }
  }

  walkCache.set(pool, { key, value: visits });
  return visits;
}

/* ── main entry point ──────────────────────────────────────────────────── */

export interface RecommendOptions {
  excludeIds: Set<string>;
  count: number;
  /** stable per-user seed: two people never get an identical deck */
  seed?: number;
  /** builds a feature vector on demand, for the finalist diversity pass */
  vectorFor?: (title: Title) => Float32Array;
  /**
   * Everything the user has liked. Drives the co-watch signal and the
   * "because you loved…" line.
   */
  likedTitles?: Title[];
  /** candidate id → bonus from collaborative co-occurrence (cloud path) */
  coOccurrenceBonus?: Map<string, number>;
  /** override the automatic exploration share */
  exploreRatio?: number;
  /**
   * Optional meaning-vectors, one per title id: a sentence embedding of the
   * title's own text. Where the facet tables compare *values*, these compare
   * *meaning*, so two titles that share no keyword can still be close.
   * Absent by default — the engine behaves exactly as before without it.
   */
  souls?: Map<string, number[]>;
  /**
   * "swipe" (default) ranks cards to rate: famous, broad, with exploration
   * probes. "discover" ranks titles to watch next: the whole catalog above a
   * quality floor, no fame bias, no probes.
   */
  mode?: RankMode;
}

/**
 * Rank the catalog for one user.
 *
 * Three stages, cheapest first:
 *   1. fame gate — the pool shrinks to titles people have actually heard of
 *   2. facet scoring — ~20 map lookups per candidate (the old vector path
 *      cost 1,536 float ops per candidate, which is what made fast swiping
 *      stutter)
 *   3. diversity + exploration over the ~60 finalists, the only place
 *      feature vectors are built at all
 */
export function recommend(
  pool: CandidateItem[],
  profile: TasteProfile,
  opts: RecommendOptions
): Recommendation[] {
  const { excludeIds, count } = opts;
  const seed = opts.seed ?? 1;
  const rng = makeRng(seed + profile.totalSwipes * 2654435761);

  const mode = opts.mode ?? "swipe";

  const confidence = tasteConfidence(profile);
  /**
   * How hard to pull toward titles the viewer has heard of.
   *
   * This used to relax as *confidence* rose, which reads as "the better we
   * know your taste, the less we care whether you have heard of the film" —
   * exactly backwards, and one of the two reasons the deck sank from the 200th
   * best-known title to the 1,200th over a session. It now relaxes only as the
   * viewer demonstrates they recognise what they are being shown.
   */
  const recognised = recognitionRate(profile);
  const relax =
    recognitionEvidence(profile) *
    Math.min(1, Math.max(0, (recognised - 0.6) / 0.35));
  const wRecognition =
    mode === "discover"
      ? W_RECOGNITION_DISCOVER
      : W_RECOGNITION_COLD + (W_RECOGNITION_WARM - W_RECOGNITION_COLD) * relax;
  const { facets, facetWeights, streaks, totalSwipes } = profile;

  const coWatch = opts.likedTitles?.length
    ? process.env?.WALK === "0"
      ? coWatchBonus(opts.likedTitles)
      : walkBonus(pool, opts.likedTitles)
    : null;

  /**
   * TRIED AND REJECTED: a door in the gate for the viewer's own taste.
   *
   * The tight gate that keeps cards recognisable can also run a taste dry — a
   * horror viewer held near 600 titles eventually exhausts the horror inside
   * it. The obvious remedy is to admit any title the graph puts close to
   * something they already liked, however obscure, on the theory that a fan
   * recognises their own corner more deeply than the catalog at large.
   *
   * Measured, with the simulated viewer given exactly that property, it made
   * every number worse: recognition 93% to 83%, and the genre share it was
   * meant to rescue fell rather than rose. The graph's neighbours at that
   * depth are not the ones a fan knows; they are simply obscure.
   *
   * The gate stands alone.
   */
  const gated = fameGate(
    pool,
    fameTierSize(profile, mode),
    mode === "swipe" ? profile.facets : undefined,
    profile
  );
  const coWatchScale =
    mode === "discover"
      ? COWATCH_ENV ?? CO_WATCH_DISCOVER_SCALE
      : DECK_ENV ?? CO_WATCH_DECK_SCALE;

  // centre of meaning for everything the viewer has liked
  let soulCentre: number[] | null = null;
  if (opts.souls && opts.likedTitles?.length) {
    for (const t of opts.likedTitles) {
      const v = opts.souls.get(t.id);
      if (!v) continue;
      if (!soulCentre) soulCentre = new Array(v.length).fill(0);
      for (let i = 0; i < v.length; i++) soulCentre[i] += v[i];
    }
    if (soulCentre) {
      let n = 0;
      for (const x of soulCentre) n += x * x;
      n = Math.sqrt(n) || 1;
      for (let i = 0; i < soulCentre.length; i++) soulCentre[i] /= n;
    }
  }
  const soulSim = (id: string): number => {
    const v = soulCentre && opts.souls?.get(id);
    if (!v || !soulCentre) return 0;
    let d = 0;
    for (let i = 0; i < v.length; i++) d += soulCentre[i] * v[i];
    return d;
  };

  const scored: { c: CandidateItem; score: number; facet: number }[] = [];
  for (const c of gated) {
    if (excludeIds.has(c.title.id)) continue;
    const tokens = titleTokens(c.title);
    const fs = facetScore(facets, facetWeights, tokens, streaks.cooldown, totalSwipes);

    const q = qualityPrior(c.title.rating, c.title.voteCount);
    /**
     * Was the global vote count, for everyone, forever. It is now the *prior*
     * this viewer's own answers are blended against — see `watchLikelihood`.
     * The weight below is untouched: what changed is that the number it
     * multiplies is about this person rather than about the world.
     */
    const known = watchLikelihood(profile, tokens, reachPrior(c.title));
    const score =
      W_QUALITY * q +
      wRecognition * known +
      confidence * W_FACETS * fs.total +
      JITTER * jitterFor(c.title.id, seed) +
      coWatchScale * (coWatch?.get(c.title.id)?.score ?? 0) +
      confidence * W_SOUL * soulSim(c.title.id) +
      (opts.coOccurrenceBonus?.get(c.title.id) ?? 0);

    scored.push({ c, score, facet: fs.total });
  }

  if (scored.length === 0) return [];
  scored.sort((a, b) => b.score - a.score);

  // exploration exists to *learn*, which is a swiping activity. A probe in a
  // recommendation grid is just an off-topic suggestion.
  const exploreRatio =
    opts.exploreRatio ?? (mode === "discover" ? 0 : exploreRatioFor(profile));
  const divScale = mode === "discover" ? DISCOVER_DIVERSITY_SCALE : DECK_DIVERSITY_SCALE;
  const exploreSlots = Math.min(count - 1, Math.round(count * exploreRatio));
  const mainSlots = Math.max(1, count - exploreSlots);

  /* ── stage 3a: diversity over the finalists ── */
  const vectorFor = opts.vectorFor;
  const head = scored.slice(0, Math.min(scored.length, Math.max(FINALIST_POOL, count * 4)));
  const vecOf = (item: CandidateItem): Float32Array | null => {
    if (item.vector) return item.vector;
    if (!vectorFor) return null;
    item.vector = vectorFor(item.title);
    return item.vector;
  };

  const picked: typeof head = [];
  const remaining = [...head];
  const genreCounts = new Map<string, number>();

  while (picked.length < mainSlots && remaining.length > 0) {
    let bestIdx = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      let maxSim = 0;
      const cv = vecOf(cand.c);
      if (cv) {
        for (const p of picked) {
          const pv = vecOf(p.c);
          if (!pv) continue;
          const s = cosine(cv, pv);
          if (s > maxSim) maxSim = s;
        }
      }
      // Vector diversity alone lets one tight cluster (animation, say) fill
      // the whole page, so genre saturation is penalised explicitly. All of a
      // title's genres count, not just the first: animated films scatter
      // across "animation", "family" and "adventure" and would otherwise slip
      // past a primary-genre-only check.
      let repeats = 0;
      for (const g of cand.c.title.genres) {
        repeats = Math.max(repeats, genreCounts.get(g) ?? 0);
      }
      const val =
        cand.score -
        divScale * MMR_LAMBDA * maxSim -
        divScale * GENRE_REPEAT_PENALTY * repeats;
      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    }
    const chosen = remaining.splice(bestIdx, 1)[0];
    picked.push(chosen);
    for (const g of chosen.c.title.genres) {
      genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
    }
  }

  /* ── stage 3b: exploration — the best-known title from a genre we have
     not tested on this user yet ── */
  if (exploreSlots > 0) {
    const takenIds = new Set(picked.map((p) => p.c.title.id));
    const wanted = unexploredGenres(facets, pool, rng);
    const byScore = new Map(scored.map((s) => [s.c.title.id, s]));
    const explorers: typeof picked = [];

    for (const genre of wanted) {
      if (explorers.length >= exploreSlots) break;
      // most-watched title of that genre the user has not met yet, with a
      // little seeded jitter so two users never get the same probe
      const candidates = gated
        .filter(
          (c) =>
            !excludeIds.has(c.title.id) &&
            !takenIds.has(c.title.id) &&
            c.title.genres.some((g) => g.toLowerCase() === genre)
        )
        .slice(0, 12);
      if (candidates.length === 0) continue;
      const chosen = candidates[Math.floor(rng() * Math.min(4, candidates.length))];
      takenIds.add(chosen.title.id);
      explorers.push(
        byScore.get(chosen.title.id) ?? { c: chosen, score: 0, facet: 0 }
      );
    }

    // interleave so exploration is spread through the deck, not parked at
    // the end where the user never reaches it
    if (explorers.length > 0) {
      const step = Math.max(1, Math.ceil(picked.length / explorers.length));
      const merged: typeof picked = [];
      let ei = 0;
      for (let i = 0; i < picked.length; i++) {
        merged.push(picked[i]);
        if ((i + 1) % step === 0 && ei < explorers.length) merged.push(explorers[ei++]);
      }
      while (ei < explorers.length) merged.push(explorers[ei++]);
      picked.length = 0;
      picked.push(...merged.slice(0, count));
    }
  }

  const out = picked.map(({ c, score, facet }) => {
    const hit = coWatch?.get(c.title.id);
    return {
      title: c.title,
      score,
      /**
       * Derived from the score the list is actually ranked by, not from the
       * facet total alone. Those two disagreed — facets measure taste fit
       * while the ranking also weighs how good and how findable a title is —
       * so a 62% could sit below a 48% and the page looked broken. One number
       * now drives both the order and the label.
       *
       * Still absolute rather than batch-relative: a title reports the same
       * figure in every batch, which was the original point.
       */
      match: matchPercent((score - RANK_MIDPOINT) / RANK_SPREAD, confidence),
      reasons: explainMatch(facets, facetWeights, c.title).map((r) => ({
        kind: r.kind as string,
        label: r.label,
      })),
      // "because you loved X" now names the title whose audience actually
      // leads here, instead of the nearest vector
      becauseOf: hit?.from,
    };
  });

  /**
   * Discover is read top-down as a ranked list, so it must actually be
   * ranked: the diversity pass picks *which* titles appear, but it emits them
   * in the order it happened to choose them, which put a 62% match below a
   * 48% one. Selection stays diverse; presentation is strongest-first.
   *
   * The deck is left alone — there the order is the queue, and the diversity
   * pass deliberately spaces similar cards apart.
   */
  if (mode === "discover") out.sort((a, b) => b.score - a.score);
  return out;
}

/**
 * Cold-start deck: diverse, widely-seen anchors. Greedy farthest-point
 * selection using genre/keyword overlap rather than feature vectors, so the
 * very first batch costs nothing to build.
 */
export function calibrationDeck(
  pool: CandidateItem[],
  excludeIds: Set<string>,
  count: number
): Title[] {
  const anchors = pool.filter((c) => c.title.onboarding && !excludeIds.has(c.title.id));
  const base = anchors.length > 0 ? anchors : pool.filter((c) => !excludeIds.has(c.title.id));
  if (base.length === 0) return [];

  // vote count, not popularity: we want titles many people have actually
  // seen, not whatever is trending this week
  const sorted = [...base].sort((a, b) => b.title.voteCount - a.title.voteCount);
  const picked: CandidateItem[] = [sorted[0]];
  const rest = sorted.slice(1, 400);

  const sig = (c: CandidateItem) => {
    const t = titleTokens(c.title);
    return new Set([...t.genre, ...t.story.slice(0, 6)]);
  };
  const overlap = (a: Set<string>, b: Set<string>) => {
    let shared = 0;
    for (const x of a) if (b.has(x)) shared++;
    return shared / Math.max(1, Math.min(a.size, b.size));
  };

  const pickedSigs = [sig(picked[0])];
  while (picked.length < count && rest.length > 0) {
    let bestIdx = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < rest.length; i++) {
      const s = sig(rest[i]);
      let maxOverlap = 0;
      for (const p of pickedSigs) maxOverlap = Math.max(maxOverlap, overlap(s, p));
      const val = 1 - maxOverlap + recognizability(rest[i].title.voteCount) * 0.35;
      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    }
    const chosen = rest.splice(bestIdx, 1)[0];
    picked.push(chosen);
    pickedSigs.push(sig(chosen));
  }
  return picked.map((p) => p.title);
}

export { DIM, isCalibrating };

/* ── the grid ──────────────────────────────────────────────────────────── */

/**
 * WHICH OF THESE HAVE YOU WATCHED?
 *
 * A different question from the deck's, and the reason a separate function
 * exists rather than a mode flag.
 *
 * The deck asks one question per interaction and needs a full verdict back, so
 * a card the viewer has never seen is a wasted swipe — which is the entire
 * reason the fame gate exists, and the reason 902 comedies in this catalog
 * were unreachable. The arithmetic underneath it is brutal and no model can
 * beat it: **harvesting H titles takes at least H interactions.** Measured on
 * real histories, 2,000 cards recovers 78% of a person's viewing — 37 minutes
 * of uninterrupted swiping, and the last hundred cards yield four titles each.
 *
 * A grid inverts the cost. Thirty posters, tap the ones you know: thirty
 * answers for one screen, and a title the viewer has never heard of costs a
 * glance instead of a swipe. Measured against real histories with the time
 * cost taken from the user's own 1,288 swipes (1.1s a card), that is
 * **3,656 titles an hour against the deck's 1,667** — 2.2x, and 2,000 titles
 * becomes seventeen minutes instead of thirty-seven.
 *
 * I ALSO CLAIMED THE GATE COULD GO, AND THAT WAS WRONG. The reasoning was that
 * once a miss costs a glance there is nothing left for a fame window to
 * protect, so the grid should rank the whole catalog. Measured, wider pools are
 * monotonically worse:
 *
 *     candidate pool     the deck's gate    3x    8x    whole catalog
 *     titles per hour              3,656  2,533  2,075          1,979
 *
 * A cheap miss is still a wasted tile. The gate is not only a cost control —
 * it is a statement about which titles a person plausibly knows, and that
 * remains true however little the wrong answer costs. So the grid draws from
 * exactly the deck's pool and only the *question* changes.
 *
 * What it deliberately does not do is chase the taste score. The deck's blend
 * is the right answer to "will you enjoy this"; here it would be actively
 * wrong, because the most enjoyable title is often one the person has not seen
 * yet and this screen is asking about the past. Measured on real histories,
 * ranking a *deck* purely by exposure was a wash (236.2 against 236.9) — the
 * recognition term already dominates there. On a grid there is no such term to
 * hide behind, so the objective has to be stated outright.
 *
 * Spread across the languages the viewer watches, in proportion to how much
 * they watch them, so an Arabic speaker's grid is not thirty English films.
 */
export function watchedGrid(
  pool: CandidateItem[],
  profile: TasteProfile,
  opts: { excludeIds: Set<string>; count: number; seed?: number }
): Title[] {
  const { excludeIds, count } = opts;
  const seed = opts.seed ?? 1;

  const gated = fameGate(pool, fameTierSize(profile, "swipe"), profile.facets, profile);

  const scored: { t: Title; w: number }[] = [];
  for (const c of gated) {
    if (excludeIds.has(c.title.id)) continue;
    const w = watchLikelihood(profile, titleTokens(c.title), reachPrior(c.title));
    // a small deterministic wobble so two people with the same history do not
    // get the same grid, and so a rebuild does not repeat the same thirty
    scored.push({ t: c.title, w: w + JITTER * jitterFor(c.title.id, seed) });
  }
  scored.sort((a, b) => b.w - a.w);

  /**
   * Two of any one decade or language would make a screen of thirty read as a
   * themed list rather than a memory test, and a memory test is what this is:
   * the more different corners it touches, the more of a history one screen
   * can reach. A cap rather than a quota, so it never has to invent structure
   * when the viewer really is that narrow.
   */
  const perEra = Math.max(3, Math.round(count / 4));
  const perLang = Math.max(4, Math.round(count / 3));
  const eras = new Map<number, number>();
  const langs = new Map<string, number>();
  const out: Title[] = [];
  const spare: Title[] = [];

  for (const { t } of scored) {
    if (out.length >= count) break;
    const era = Math.floor(t.year / 10);
    const lang = t.originalLanguage;
    if ((eras.get(era) ?? 0) >= perEra || (langs.get(lang) ?? 0) >= perLang) {
      if (spare.length < count) spare.push(t);
      continue;
    }
    eras.set(era, (eras.get(era) ?? 0) + 1);
    langs.set(lang, (langs.get(lang) ?? 0) + 1);
    out.push(t);
  }
  // a narrow viewer fills from the overflow rather than getting a short screen
  for (const t of spare) {
    if (out.length >= count) break;
    out.push(t);
  }
  return out;
}
