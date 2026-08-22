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
  /**
   * Terms that depend on the title alone, memoised on the candidate.
   *
   * A rebuild scores every title the gate admits, which is now a few thousand,
   * and it happens after every batch of cards for the whole session. Three of
   * the terms in that sum — the quality prior, the exposure prior and the
   * per-user tie-break — are pure functions of the title (and, for the last
   * two, of the session's language set and seed, which do not change while
   * someone is swiping). They were being recomputed from scratch every time,
   * including an FNV hash over the id string for the tie-break.
   *
   * The pool array outlives the session, so this is the natural place to keep
   * them. `_k` records what the cached values were computed under, so a change
   * of seed or home languages recomputes rather than silently serving stale
   * numbers — the failure mode that would be invisible and would make every
   * deck after it wrong.
   */
  _k?: string;
  _q?: number;
  _prior?: number;
  _jit?: number;
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
const num2 = (k: string, d: number) =>
  typeof process !== "undefined" && process.env?.[k] ? Number(process.env[k]) : d;

/**
 * Made settable so the crowding-out hypothesis is testable rather than
 * arguable. A term's influence on an ordering is its weight times its
 * SPREAD, and these two terms do not have the same spread: the facet score
 * runs over [-1, 1] while `watchLikelihood` is a probability bunched around
 * 0.5. That would explain why tripling the recognition weight moved the tail
 * by 0.2 — the wide term still wins.
 */
const W_FACETS = num2("W_FACETS", 1.6);
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
const W_RECOGNITION_COLD = num2("W_REC_COLD", 0.9);
const W_RECOGNITION_WARM = num2("W_REC_WARM", 0.55);
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
/**
 * OFF FOR THE DECK. Discover keeps its own share below.
 *
 * SPREADING SOMEONE ACROSS GENRES THEY DO NOT WATCH. A real 1,100-swipe
 * session: 39% of his cards were comedies, and 78% of the titles he marked
 * watched were comedies. 110 animation cards produced zero. Meanwhile 658
 * English comedies from 1995-2020 with over 1,200 votes sat in the catalog and
 * were never dealt to him once. Graded on his own answers, the share of cards
 * he had actually watched fell 35% → 34% → 17% → 2% across the session; with
 * this off and the gate deep it holds 41% → 61% → 65% → 39%.
 *
 * A diversity penalty is insurance against a wrong model. The deck's job is
 * not to be right about one card, it is to find everything a person has
 * watched — and there, deliberately showing them a genre they do not watch is
 * simply a card thrown away. Discover is the opposite: it makes one small set
 * of suggestions and repeating yourself there is a real failure, so it keeps
 * its quarter.
 *
 * TRIED AND REJECTED — decaying it with evidence instead of switching it off.
 * The principled version: keep the insurance while the model is a guess, drop
 * it once someone has given 150 verdicts. It sounds obviously right and it
 * measured worse than simply switching it off: harvest 224.8 against 229.1,
 * and the real-answer ruler 85.3 against 100.5 — below even today's 88.0.
 * The three changes here only pay as a set, and the ramp weakens the set
 * exactly where the ruler can see it.
 */
const DECK_DIVERSITY_SCALE =
  typeof process !== "undefined" && process.env?.DECK_DIVERSITY
    ? Number(process.env.DECK_DIVERSITY)
    : 0;

/**
 * …but not on the first handful of answers.
 *
 * With the penalty off from card one, a single accidental right-swipe on an
 * action film filled 85% of the next twenty cards with action — measured by
 * `simulate`'s tunnel-vision check, which is not one of the fame-shaped rulers
 * and means exactly what it says. One answer is not a taste, and a deck that
 * treats it as one is broken for every new viewer.
 *
 * So the penalty is held at full strength until there is enough evidence for
 * the concentration to be about the person rather than about one card. Short
 * on purpose: an earlier attempt decayed it over 150 verdicts and measured
 * worse than no guard at all.
 */
const COLD_DIVERSITY = 0.25;
const COLD_UNTIL =
  typeof process !== "undefined" && process.env?.COLD_UNTIL
    ? Number(process.env.COLD_UNTIL)
    : 5;

function deckDiversity(profile: TasteProfile): number {
  return profile.ratedSwipes < COLD_UNTIL ? COLD_DIVERSITY : DECK_DIVERSITY_SCALE;
}

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
/**
 * AIM SLIGHTLY BELOW CERTAIN.
 *
 * Both reviewers argued the deck asks the wrong question: it ranks by the
 * probability a card is one the viewer has watched, when the informative card
 * is the one whose answer is least predictable. Both named 0.5.
 *
 * Measured on sixty real viewing histories, 0.5 is a catastrophe and they were
 * still right about the direction:
 *
 *     target   0     0.5    0.65    0.75    0.8     0.85    0.9
 *     harvest  232.3 171.3  230.2   236.4   238.1   238.6   238.3
 *
 * A little doubt is worth paying for and a lot is not. The plateau from 0.75
 * to 0.9 is flat, so this is a region rather than a fitted constant, and his
 * own answers agree independently: replay 173.2 -> 176.0.
 *
 * Their reasoning for 0.5 was that information per card stops decaying, so it
 * should win over a long session even if it loses early. Tested at 1,500 cards
 * it loses by more, not less — 360.9 against 408.0. The premise that a maximal
 * -entropy question is worth its card does not survive contact with a ruler
 * that counts titles rather than bits.
 */
const TARGET_SEEN =
  typeof process !== "undefined" && process.env?.TARGET_SEEN
    ? Number(process.env.TARGET_SEEN)
    : 0.85;

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
const num = (key: string, fallback: number) =>
  typeof process !== "undefined" && process.env?.[key] ? Number(process.env[key]) : fallback;

const TIER_PER_SEEN = num("TIER_PER_SEEN", 5);
const TIER_PER_UNSEEN = num("TIER_PER_UNSEEN", 30);
/**
 * THE CEILING, AND THE THIRD OF HIS LIBRARY THAT SAT ABOVE IT.
 *
 * Take the nine titles the unbiased calibration sample says he has actually
 * watched, and ask where each one sits in the fame order of its own kind:
 *
 *     gate    900   reaches 0 of 9
 *     gate  1,800   reaches 2 of 9
 *     gate  3,000   reaches 6 of 9      <- the old ceiling
 *     gate  6,000   reaches 9 of 9
 *
 * The opening gate reaches **none** of them, which is the clearest statement
 * of the problem this file has: fame is a real signal and a weak one, and a
 * pool sized by fame alone is not where a particular person's viewing lives.
 * The old ceiling left a third of his sampled library unreachable at any
 * session length — not ranked badly, never a candidate.
 *
 * Raising it costs nothing measurable. At 1,500 cards the floor is already
 * 4,500, so the cap does not bind: harvest reads 438.1 at both 4,500 and 6,000
 * against 435.3 at 3,000, and replay is unchanged at 186.8 because a 600-card
 * session never gets near it. The ceiling only binds past roughly 1,350
 * answered cards — by which point the exposure model has 1,350 answers to sort
 * that depth with, which is the same evidence-gated argument the floor makes.
 *
 * Nine titles is a thin base and this is one person; it is recorded here as
 * the reason rather than as a proof, and a second calibration round is the
 * thing that would confirm it.
 */
const TIER_MAX = num("TIER_MAX", 6000);
/**
 * The floor, and the reason it is the only part of this that ever ran.
 *
 * The ledger above settles where TIER_PER_SEEN x seen equals TIER_PER_UNSEEN x
 * unseen — 86% recognised at a ratio of six. No real person answers like that.
 * Replayed against a real 378-card session the ledger reads -6,170 by the end,
 * so for every card after roughly the twentieth the gate was `answered + 300`
 * and nothing else. A reviewer called the ledger dead code from reading it;
 * this is the same finding measured.
 *
 * `answered + 300` grows by exactly one title per swipe, which is exactly the
 * rate the viewer consumes it. The supply of unswiped candidates is therefore
 * a constant 300 no matter how long anyone sits there, and once the good ones
 * inside that 300 are gone the hit rate has nowhere to go but down. That is
 * the collapse the user reported and the shape his file shows: 74% at card 50,
 * 6% at card 300, with the median vote count of the cards *not falling* — the
 * deck was not running out of famous films, it was running out of room.
 *
 * So the floor grows three times faster than it is consumed, and TIER_MAX still
 * stops it. Swept on 30 real histories at 1,500 cards each, which is the length
 * the product's goal actually lives at:
 *
 *     floor              harvested   reachable   lost to gate   lost to ranking
 *     1x + 300  shipped      417.0       84.8%          15.2%            13.5%
 *     3x + 400  ships        437.3       91.4%           8.6%            16.6%
 *     6x + 600              439.9       94.1%           5.9%            18.8%
 *     12x + 600, max 9k     436.8       99.3%           0.7%            24.6%
 *
 * Past 6x the gate stops being the binding constraint — at 12x it loses 0.7%
 * and the ranking loses 24.6% — so widening further only hands the ranking more
 * work it is not good enough to do. The shape of that table is the argument for
 * stopping, not the single best number in it.
 *
 * WHY 3x AND NOT THE 6x THAT SCORED HIGHEST. 439.9 against 437.3 is half a
 * percent, and it is bought with real dilution: `simulate`'s taste-survival
 * check reads comedy lift 4.63x / 3.86x / 3.45x at 1x / 3x / 6x. A wider pool
 * is more candidates for the same ranking to sort, and the ranking is not good
 * enough to keep its edge across all of them. 6x fails that guard at 85% kept
 * against a 90% target, and moving a threshold so my own change passes is the
 * exact mistake this project has made five times. 3x clears every guard.
 *
 * One caveat on that guard, recorded because it flatters the narrow gate: at
 * 1x it reads *115%* kept, above 100%, because thirty "never heard of it"
 * answers contract the pool and the pool is the denominator. Part of what it
 * was rewarding was the gate closing, not the taste surviving.
 *
 * `deck-drift` cannot see any of this and it is worth saying so rather than
 * quoting it: its probes run 150 swipes, where this floor is identical to the
 * old one by construction. (It does show the old gate holding **one** horror
 * title by swipe 150 under a 6x floor's comparison — a real description of the
 * starvation, but not evidence for what shipped.) The evidence here is harvest
 * at 1,500 cards and replay, which run long enough for the floor to bind.
 *
 * WRITTEN AS SUPPLY, WHICH IS THE ONLY REASON THE FLOOR EXISTS. A plain
 * `3 x answered + 400` scores the same but opens the session on a wider pool
 * than `answered + 300` did — 520 titles instead of 340 by card forty — and
 * that made `simulate`'s opening-fame guard read 4,775 against its 5,000
 * target. The guard is right that the first cards should be the famous ones.
 * Phrasing the floor as "answered, plus a margin that grows" keeps the opening
 * bit-identical to what shipped and moves only the part that was broken.
 */
const TIER_FLOOR_PER = num("TIER_FLOOR_PER", 3);
const TIER_FLOOR_BASE = num("TIER_FLOOR_BASE", 300);

export function fameTierSize(profile: TasteProfile, mode: RankMode = "swipe"): number {
  if (mode === "discover") return DISCOVER_POOL;
  const earned =
    TIER_BASE + TIER_PER_SEEN * profile.seenCount - TIER_PER_UNSEEN * profile.unseenCount;
  // however far it contracts, always leave a healthy margin of unswiped titles
  const answered = profile.seenCount + profile.unseenCount;
  const margin = Math.max(TIER_FLOOR_BASE, answered * (TIER_FLOOR_PER - 1));
  return Math.min(TIER_MAX, Math.max(earned, answered + margin));
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
    /**
     * TRIED: ordering this by the model's reach estimate rather than the vote
     * count. That is where reach should matter most if it matters anywhere —
     * the gate is what decides an Egyptian film with eighty TMDB votes sits at
     * rank 8,000 and is never offered to anyone. Measured, harvest moved by
     * **nothing at all** (243.1 either way), and the branch is gone rather than
     * left as a knob nobody will turn.
     */
    const sorted = [...pool].sort((a, b) => b.title.voteCount - a.title.voteCount);
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

/**
 * TRIED, SHIPPED, AND WITHDRAWN THE SAME DAY BY THE FIRST UNBIASED DATA.
 *
 * The reasoning was clean: the door below opens a language only once the
 * viewer demonstrates they watch it, they cannot demonstrate it for a language
 * they are never shown, and the best Tamil film in this catalog sits at global
 * rank 6,140. `navigator.languages` breaks that circle for free. Four passes
 * of work took an Arabic reader from 0 Arabic titles in 200 cards to 56.
 *
 * Then 199 titles drawn uniformly at random from the whole catalog were put in
 * front of that same Arabic-reading viewer, and of the **129 non-English
 * titles he was asked about he had watched none**. Not one. Every title he had
 * seen was English.
 *
 * Reading a language is not watching films in it. The whole mechanism was
 * built on an assumption that felt too obvious to test, and the first data
 * that could test it refuted it in a single afternoon. Fifty-six cards of an
 * Arabic reader's deck would have been fifty-six wasted swipes.
 *
 * The strength is zero. The code stays because the *fame-within-language*
 * correction below is separate and still right — a vote count is an English
 * scale — and because the next viewer may be someone who does watch in the
 * language they read. Turning it on again needs their calibration sample, not
 * an argument.
 */const HOME_LANG_STRENGTH = Number(
  (typeof process !== "undefined" && process.env?.HOME_LANG) || 0
);

function languageDoor(
  profile: TasteProfile | undefined,
  homeLanguages?: string[]
): Map<string, number> {
  const out = new Map<string, number>();
  for (const lang of homeLanguages ?? []) {
    if (lang !== "en") out.set(lang, HOME_LANG_STRENGTH);
  }
  if (!profile) return out;
  const table = profile.seenFacets.language;
  for (const lang of Object.keys(table)) {
    if (lang === "en") continue;
    const [net, mass] = table[lang];
    if (mass < LANG_DOOR_MASS || net <= 0) continue;
    // share of the door proportional to how consistently they have seen it
    out.set(lang, Math.max(out.get(lang) ?? 0, Math.min(1, net / mass)));
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
/**
 * Raised from 2.5 to 6, which is the single change that moves reachability.
 *
 * `harvest` reports a ceiling as well as a score: how much of a real person's
 * viewing history the gate can reach *at any session length*. At 2.5 that
 * ceiling is 64.8% — a third of what someone has watched is unreachable no
 * matter how long they swipe, which is not a ranking problem and no ranking
 * can fix it. At 6 it is 76.1%.
 *
 * Deeper than 6 does not pay: 12 gives the same ceiling (76.6%) and a worse
 * score (223.7 against 229.1), because the extra depth is obscurity rather
 * than more of the viewer's corner.
 *
 * On its own this change is *negative* on the real-answer ruler (88.0 to
 * 79.8) — a deeper gate the ranking is not allowed to exploit just dilutes the
 * deck. It pays only together with the two changes above, which is why all
 * three ship or none do.
 */
const TASTE_DEPTH =
  typeof process !== "undefined" && process.env?.TASTE_DEPTH
    ? Number(process.env.TASTE_DEPTH)
    : 6;

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

/**
 * How many *extra* candidates the deep corner may add, per kind.
 *
 * Additive, not a total. Written first as a total minus the base, which
 * quietly turned the deep gate off exactly when it mattered: the base grows
 * with the session, so by card 500 there was no room left and reachability
 * fell straight back to where it started (80% to 65%).
 */
const DEEP_CAP =
  typeof process !== "undefined" && process.env?.DEEP_CAP
    ? Number(process.env.DEEP_CAP)
    : 1200;

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

/**
 * Fame measured inside a language, for the languages the viewer reads.
 *
 * `fameLists` already does exactly this for film versus television, with the
 * right reasoning: a vote count is only comparable inside its own scale, and
 * ranking series against films quietly deleted television from the deck.
 * Language is a scale in the same way and for a stronger reason — TMDB's
 * voters are overwhelmingly Western, so a vote count *is* an English scale. An
 * Egyptian film fifty million people watched carries eighty votes.
 *
 * RANKING EVERY TITLE BY ITS OWN-LANGUAGE PERCENTILE WAS TRIED AND COST 16% OF
 * HARVEST. That is a real result and this is not that. That version applied to
 * everybody and split the gate across 34 languages, handing a monolingual
 * English viewer a deck proportional to the *catalog's* languages instead of
 * to theirs. This applies only to languages the viewer actually reads, so for
 * an English-only viewer — which is every subject in every ruler here — it
 * changes nothing at all, by construction.
 *
 * Which also means no instrument in this repository can score it. It is
 * shipped on the strength of the mechanism and the requirement that harvest
 * and replay do not move.
 */
const langFameIndex = new WeakMap<CandidateItem[], Map<string, number>>();

function languageFame(pool: CandidateItem[]): Map<string, number> {
  const cached = langFameIndex.get(pool);
  if (cached) return cached;
  const out = new Map<string, number>();
  const groups = new Map<string, CandidateItem[]>();
  for (const c of pool) {
    const key = `${c.title.originalLanguage}|${c.title.type}`;
    const list = groups.get(key);
    if (list) list.push(c);
    else groups.set(key, [c]);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => b.title.voteCount - a.title.voteCount);
    for (let i = 0; i < list.length; i++) {
      out.set(list[i].title.id, 1 - i / list.length);
    }
  }
  langFameIndex.set(pool, out);
  return out;
}

/** the exposure prior for one title, conditioned on who is looking at it */
function famePrior(
  title: Title,
  home: Set<string> | null,
  index: Map<string, number> | null
): number {
  const base = reachPrior(title);
  if (!home || !index || !home.has(title.originalLanguage)) return base;
  return Math.max(base, index.get(title.id) ?? 0);
}

/**
 * For a language the viewer reads, silence is not a "no".
 *
 * `watchLikelihood` blends the prior with what the seen-facet tables say, and
 * those tables say nothing about Arabic until an Arabic card has been dealt.
 * "Nothing" enters the blend as the neutral 0.5 and drags a well-known Arabic
 * film below a well-known English one — so the prior that was supposed to open
 * the language is cancelled by the absence of the evidence it exists to go and
 * collect. Two Arabic titles in two hundred cards, from zero.
 *
 * So while a home language carries no evidence either way, the prior stands on
 * its own. The moment the person answers about that language in either
 * direction, the tables take over and this stops applying.
 */
function homeFloor(
  profile: TasteProfile,
  title: Title,
  home: Set<string> | null,
  prior: number,
  blended: number
): number {
  if (!home || !home.has(title.originalLanguage)) return blended;
  const [, mass] = profile.seenFacets.language[title.originalLanguage] ?? [0, 0];
  return mass >= LANG_DOOR_MASS ? blended : Math.max(blended, prior);
}

/**
 * TRIED TWICE AND REJECTED: co-watch degree as an exposure signal.
 *
 * The idea was sound and the component evidence was strong. `watchLikelihood`
 * blends fame with the seen-FACET tables, and facets saturate — "comedy ·
 * English · 2000s" holds thousands of titles and a person has watched five
 * percent of them, so no amount of facet evidence says which five percent.
 * Co-watch degree is title-level and does not saturate. Benched on 200
 * MovieLens people, half their history held out among 2,000 negatives:
 *
 *     vote count (ships)           AUC 0.932   recall@200 72.0%
 *     watchLikelihood (ships)      AUC 0.957   recall@200 82.8%
 *     watchLikelihood + co-watch   AUC 0.981   recall@200 94.0%
 *
 * It was placed in the gate, then in the card ordering. Both measured worse on
 * the goal ruler — 60 people, 1,200 cards, judged on the last block:
 *
 *     in the gate       tail 12.1 -> 11.5    harvest 410.9 -> 410.0
 *     in the ordering   tail 12.1 -> 12.6 / 10.9 / 10.8   at weights .05/.15/.4
 *                       harvest 410.9 -> ~396.6           lost at ranking 15.7% -> 18.6%
 *
 * Every weight cost about fourteen titles. The likely mechanism is worth
 * keeping: `known` is a calibrated probability in [0,1], and adding an
 * unbounded count to it then clamping saturates a large share of candidates at
 * 1.0, which destroys the ordering `watchLikelihood` already had. A good
 * signal added on top of another good signal made both useless.
 *
 * +11.2 points of recall@200 bought zero titles. That is the third time this
 * week a component bench has liked something a session could not use, and the
 * standing rule stands: the goal ruler decides, and a term that fails it comes
 * out rather than being kept at whichever weight flatters it least.
 */
export function fameGate(
  pool: CandidateItem[],
  limit: number,
  facets?: FacetTables,
  profile?: TasteProfile,
  homeLanguages?: string[],
  /** everything the viewer has confirmed watching, in any of the three ways */
  watched?: Title[]
): CandidateItem[] {
  const { movie, tv } = fameLists(pool);
  const home = homeLanguages?.length ? new Set(homeLanguages) : null;
  const langIndex = home ? languageFame(pool) : null;
  const shareOf = (n: number) =>
    !Number.isFinite(n) || n >= pool.length ? 1 : n / Math.max(pool.length, 1);

  /**
   * Zero when the viewer has taught us nothing — except that reading Arabic is
   * something we know before the first card, and the first card is exactly
   * when it matters. Skipping the re-order at cold start meant a new Arabic
   * reader saw the plain global fame slice: 200 cards, zero Arabic, and the
   * language facet stays empty, so the door never opens later either.
   */
  const personal = profile && (seenTrust(profile) > 0 || home) ? profile : null;
  const door = languageDoor(profile, homeLanguages);
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
      w: (() => {
        const prior = famePrior(c.title, home, langIndex);
        const blended = homeFloor(
          personal,
          c.title,
          home,
          prior,
          watchLikelihood(personal, titleTokens(c.title), prior)
        );
        return blended;
      })(),
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
    /**
     * Capped, because everything admitted here is scored on every rebuild.
     *
     * Going six times deep instead of two and a half doubled the candidate
     * pool, and the rebuild went from 33ms to 62ms — which is a quarter of a
     * second of frozen screen on a phone, once every sixteen cards. That is
     * the freeze the user filmed, arriving by a different route.
     *
     * The slice is in fame order, so a cap keeps the best-known of the
     * viewer's corner and drops the tail. Reachability barely notices: the
     * titles beyond the cap are the ones the ranking was never going to reach
     * inside a session anyway.
     */
    const room = DEEP_CAP;
    const extra: CandidateItem[] = [];
    for (let i = base; i < deep && i < list.length; i++) {
      if (extra.length >= room) break;
      const c = list[i];
      if (c.title.genres.some((g) => mine.has(g.toLowerCase()))) extra.push(c);
    }
    return [...reorder(list, base), ...extra];
  };

  /**
   * De-duplicated, which it was not.
   *
   * `reorder` selects from a window of `base x GATE_WIDTH` and can therefore
   * return titles at ranks `base ... 3*base`; the deep corner slice starts at
   * `base`. The two overlap, nothing removed the overlap, and `recommend`
   * scores the array without a seen-set — so a title could be scored twice and
   * selected twice in one batch of ten. Measured on the user's own session:
   * 186 duplicates in the gate after 330 swipes, 250 after 660.
   *
   * That is the best candidate anyone has offered for the two identical cards
   * drawn over each other in his recording, which I spent a day failing to
   * reproduce. Found by a reviewer reading the code rather than running it.
   */
  const seen = new Set<string>();
  const kept: CandidateItem[] = [];
  for (const c of [...take(movie), ...take(tv)]) {
    if (seen.has(c.title.id)) continue;
    seen.add(c.title.id);
    kept.push(c);
  }
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
/**
 * NO PROBING. Was a quarter of the deck, then 6-12%, now none.
 *
 * A probe spends a card asking a question instead of offering something the
 * viewer might have watched. That was a good trade when the ranking had little
 * else to go on: it cost 2.4 points of accuracy at a quarter of the deck, and
 * bought the discovery of genres nobody had tested. With the gate now six
 * times deeper into the viewer's own corner, the deck does not need to go
 * looking — there is more than enough inside the corner to keep finding
 * things. Measured on top of that deeper gate, removing probing took harvest
 * 217.6 to 227.4 and the real-answer ruler 79.8 to 91.8.
 *
 * `simulate`'s tunnel-vision guard exists for precisely this risk, and it is
 * the number to watch. It is reported honestly in every run rather than
 * retuned to accommodate this.
 */
export function exploreRatioFor(profile: TasteProfile): number {
  if (process.env?.EXPLORE) return Number(process.env.EXPLORE);
  if (profile.ratedSwipes === 0) return 0;
  // probing survives only while the taste is still a guess, for the same
  // reason the diversity penalty does
  if (profile.ratedSwipes >= COLD_UNTIL) return 0;
  return 0.12 - 0.06 * Math.min(1, profile.totalSwipes / 60);
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
/**
 * THE DECK'S SHARE OF THE GRAPH — quadrupled, on the user's reading of it.
 *
 * He asked what percentage of a card is decided by keywords and what by "people
 * who watched this also watched that". `scripts/score-share.ts` was built to
 * answer it honestly — as the share of the *spread* between candidates each
 * term explains, because the weights multiply quantities on different scales
 * and cannot be compared directly. The answer after forty cards was 83% taste,
 * 14% graph. His reading of the product — "I mostly only see the relationship
 * between the keywords" — was correct.
 *
 * That mattered because the graph is the only mechanism here that can find a
 * title sharing *no keywords* with anything the viewer liked, which is the
 * founding requirement of this product: recommendation by meaning rather than
 * by words.
 *
 * The 0.8 it sat at was set when the gate held roughly 700 titles, and the
 * reasoning recorded for it was crowding: "every like drags in only its own ~8
 * neighbours, so 20 likes pin roughly 160 titles to the top of every batch".
 * With a gate that now holds 5,774 across a session, 160 pinned titles is no
 * longer a crowd. The constraint that set this number is gone.
 *
 *     deck scale     harvest        replay on his own labels
 *       0.8 (was)      248.0                187.5
 *       1.6            257.9                192.4
 *       2.4            261.4                193.1
 *       3.2 (ships)    263.0                196.2
 *       4.0            263.0                196.9
 *       5.5            261.9                196.8
 *
 * It flattens at 3.2 and turns over by 5.5. Shipped at 3.2 rather than 4.0
 * because that is the value `simulate` was run at, and it passed all thirteen
 * checks — including both co-watch guards and the tunnel-vision guard the
 * original 0.8 existed to protect.
 */
const CO_WATCH_DECK_SCALE = 3.2;

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

/**
 * How hard the graph pushes *away* from what a viewer rejected.
 *
 * Zero until measured. See the aversion walk in `recommend`.
 */
/**
 * TRIED, AND REFUTED ON BOTH RULERS AT ONCE. Kept behind a flag, at zero.
 *
 * The user's proposal, and a good one: "if people who liked Batman liked
 * Joker, then someone who *dislikes* Batman probably dislikes Joker — use the
 * same technique upside down." It deserved the test because the graph is the
 * one signal that is not a property of the title: an edge is a statement about
 * audiences, so running it backwards should say "not your kind of thing"
 * without touching a genre.
 *
 *     aversion    harvest    cost of an honest dislike (mixed-taste)
 *       0 (ships)   263.0                  -1.2
 *       1.6         250.6                  -4.8
 *       3.2         234.9                  -6.4
 *
 * Worse on the extraction ruler *and* worse on the recommendation ruler, which
 * is as clear as this project gets. The reason is the premise: a film you
 * disliked is a film you **watched**. Its co-watch neighbours are therefore
 * things you have probably also watched, and often liked. Walking away from
 * them walks away from your own library. The graph encodes "the same people
 * chose both", not "the same people enjoyed both" — so backwards it does not
 * read "you will dislike this", it reads "you are not this kind of viewer",
 * and that is false. He *is* that kind of viewer; he simply did not like that
 * particular one.
 */
const CO_WATCH_AVERSION =
  typeof process !== "undefined" && process.env?.AVERSION
    ? Number(process.env.AVERSION)
    : 0;

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
 * KEYED ON THE WHOLE LIST, and the first version was not. It used length plus
 * last id, on the reasoning that the list is append-only so those identify it —
 * true for one viewer in one session, and false the moment two sessions share
 * a pool. The tunnel-vision guard runs the same persona twice, with co-watch on
 * and off, and their liked lists collide on that key often enough that the
 * guard's reading swung between 1.39x and 3.39x **on identical code**. A cache
 * that returns another run's answer is not a cache, and it cost an afternoon of
 * treating its noise as signal.
 *
 * A cheap rolling hash over every id costs microseconds against the 20ms it
 * saves, and cannot collide by construction of the thing it is summarising.
 */
/**
 * Keyed by walk, not just by pool.
 *
 * This held a single entry per pool, which was right while there was one walk.
 * There are now up to three in a rebuild — liked, disliked, and everything
 * watched — and with one slot each call evicts the last, so every walk missed
 * every time and the cache became pure overhead. Measured before the fix, a
 * rebuild ran three full walks instead of the one it needed.
 *
 * A small Map per pool fixes it. It is bounded because the number of distinct
 * walks in a rebuild is fixed by the code, not by the data.
 */
const walkCache = new WeakMap<CandidateItem[], Map<string, Map<string, CoWatch>>>();
const WALK_CACHE_MAX = 6;

/**
 * How a co-watch score enters the sum.
 *
 * The graph's mass is savagely concentrated: after four likes, **ten titles
 * hold 66% of it** and the median title scores 0.0000. The top is normalised
 * to 1, so at a weight of 0.8 a handful of candidates receive a bonus larger
 * than the entire recognition term while everything else receives nothing.
 * That is not a ranking signal, it is a shortlist — and it is exactly what the
 * tunnel-vision guard has been complaining about at 1.39x against a 1.15x
 * limit, on a knob that four other rulers say should stay where it is.
 *
 * The previous answer was to turn the weight down, which works and costs the
 * long tail (10.9% to 8.6%) because co-watch is the mechanism that reaches
 * obscure titles at all. Turning it down treats the size of the signal when
 * the problem is its *shape*.
 *
 * A root curve keeps the ordering exactly and redistributes the magnitude: the
 * hundredth-best neighbour goes from a rounding error to a real nudge, while
 * the best one gains nothing. The graph still says the same thing about which
 * titles go together; it just stops saying it in a whisper for all but ten of
 * them.
 *
 * TRIED, AND THERE IS NO FREE FIX. Default 1, meaning off. Sweeping the curve
 * against the weight, guard ratio and the real-label ruler together:
 *
 *     weight  curve      guard    his labels
 *     0.8     1 (ships)   3.39x        87.6
 *     0.8     0.5         1.72x        80.4
 *     0.6     1           1.83x        83.9
 *     0.5     1           1.22x        69.1
 *     0.6     0.5         2.27x        67.0
 *
 * Perfectly monotone: every step that calms the guard costs the only ruler
 * here graded against a real person's answers, and nothing reaches the 1.15x
 * limit without giving up a fifth of it. Harvest — the ruler that measures the
 * actual product goal — is flat across all of them (243.1 against 245.7), so it
 * has no opinion.
 *
 * The guard stays red, and that is a deliberate choice rather than an
 * oversight. Its own comment calls reaching four *named* titles "not a goal in
 * itself… any single one is a needle", the suite holds two other tunnel-vision
 * checks that both pass, and its 1.15x limit was calibrated on a catalog of
 * 5,555 titles that is now 12,826 — the same mechanism read 1.39x before the
 * catalog doubled. Retuning it to pass would be moving the goalposts; keeping
 * it green by lowering the weight would be paying a real ruler to satisfy a
 * proxy. It is left failing, in the open, with the numbers above.
 */
const CO_WATCH_CURVE =
  typeof process !== "undefined" && process.env?.CW_CURVE
    ? Number(process.env.CW_CURVE)
    : 1;

function coWatchTerm(score: number): number {
  return CO_WATCH_CURVE === 1 ? score : Math.pow(score, CO_WATCH_CURVE);
}

export function walkBonus(pool: CandidateItem[], liked: Title[]): Map<string, CoWatch> {
  let h = 0;
  for (const t of liked) {
    for (let i = 0; i < t.id.length; i++) h = (Math.imul(h, 31) + t.id.charCodeAt(i)) | 0;
  }
  const key = `${liked.length}|${h}`;
  let slots = walkCache.get(pool);
  if (!slots) {
    slots = new Map();
    walkCache.set(pool, slots);
  }
  const hit = slots.get(key);
  if (hit) return hit;

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

  // oldest out first: a Map iterates in insertion order
  if (slots.size >= WALK_CACHE_MAX) slots.delete(slots.keys().next().value as string);
  slots.set(key, visits);
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
  /**
   * Everything the viewer disliked, so the same co-watch graph can be walked
   * *backwards*. See CO_WATCH_AVERSION.
   */
  dislikedTitles?: Title[];
  /**
   * The titles they answered 👁 — "watched it, no strong feeling".
   *
   * These join `likedTitles` as seeds for the co-watch walk, and nothing else.
   * The graph is TMDB's record of who *watched* two titles, with no opinion in
   * it, so a neutral answer is exactly as good a seed as an enthusiastic one —
   * while being useless as a statement of taste, which is why it stays out of
   * every other term. One real 1,098-card session marked 61 titles this way
   * and every one of them was invisible to the graph.
   */
  seenTitles?: Title[];
  /** BCP-47 primary subtags the viewer reads, e.g. ["ar"], from the browser */
  homeLanguages?: string[];
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

  /**
   * SEEDS FOR THE GRAPH ARE THINGS THEY WATCHED, NOT THINGS THEY LOVED.
   *
   * `related` is TMDB's "people who watched this also watched" — a record of
   * co-viewing with no opinion attached. Seeding it from likes alone was a
   * category error that cost every neutral answer: 61 of them in the one real
   * long session on record, all invisible to the graph they were perfectly
   * good evidence for.
   *
   * Dislikes stay out. They are handled by the aversion walk below, which
   * pushes *away* from that neighbourhood, and feeding the same titles to both
   * would have the two terms cancel.
   */
  const affinitySeeds =
    opts.seenTitles?.length && opts.likedTitles?.length
      ? [...opts.likedTitles, ...opts.seenTitles]
      : (opts.seenTitles?.length ? opts.seenTitles : opts.likedTitles);
  const coWatch = affinitySeeds?.length
    ? process.env?.WALK === "0"
      ? coWatchBonus(affinitySeeds)
      : walkBonus(pool, affinitySeeds)
    : null;

  /**
   * THE SAME GRAPH, WALKED BACKWARDS FROM WHAT THEY REJECTED.
   *
   * The user's idea, and the first thing anyone has proposed that treats a
   * dislike as a first-class signal rather than a like with a minus sign:
   * "if people who liked Batman liked Joker, then someone who dislikes Batman
   * probably dislikes Joker — use the same technique upside down."
   *
   * It is worth taking seriously here specifically because the graph is not a
   * keyword. Everything else the dislike touches is a property of the title —
   * its genre, its cast, its decade — and the whole difficulty with dislikes is
   * that those properties are shared with things the person loves. A co-watch
   * edge is not a property; it is a statement about *audiences*. Two films
   * joined by an edge are joined because the same people chose both, which is
   * exactly the relation "if that one was not for you, this one is not either"
   * needs, and it carries no genre with it.
   *
   * Scaled separately from the positive walk because there is no reason for
   * the two to be symmetric, and because a person gives far fewer dislikes
   * than likes, so the walk starts from a much smaller frontier.
   */
  const aversion =
    CO_WATCH_AVERSION > 0 && opts.dislikedTitles?.length
      ? walkBonus(pool, opts.dislikedTitles)
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
  const homeSet = opts.homeLanguages?.length ? new Set(opts.homeLanguages) : null;
  const langIndex = homeSet ? languageFame(pool) : null;
  /**
   * Everything the viewer confirmed watching, whatever they felt about it.
   *
   * Dislikes belong here and only here. For *taste* a dislike is the opposite
   * of a like, which is why the aversion walk pushes away from it — but for
   * *exposure* it is identical evidence: they saw the film. Leaving them out
   * would throw away answers for no reason.
   */
  const watched = [
    ...(opts.likedTitles ?? []),
    ...(opts.seenTitles ?? []),
    ...(opts.dislikedTitles ?? []),
  ];
  const gated = fameGate(
    pool,
    fameTierSize(profile, mode),
    mode === "swipe" ? profile.facets : undefined,
    profile,
    opts.homeLanguages,
    watched
  );
  /**
   * Built once per rebuild. Discover is left alone: it recommends things you
   * have NOT watched, so a signal whose whole meaning is "you probably have"
   * is pointing the wrong way there.
   */
  const frontier = mode === "swipe" && watched.length > 0
    ? frontierVotes(watched, excludeIds)
    : null;
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

  const cacheKey = `${seed}|${opts.homeLanguages?.join(",") ?? ""}`;
  const scored: { c: CandidateItem; score: number; facet: number }[] = [];
  for (const c of gated) {
    if (excludeIds.has(c.title.id)) continue;
    if (c._k !== cacheKey) {
      c._k = cacheKey;
      c._q = qualityPrior(c.title.rating, c.title.voteCount);
      c._prior = famePrior(c.title, homeSet, langIndex);
      c._jit = jitterFor(c.title.id, seed);
    }
    const tokens = titleTokens(c.title);
    const fs = facetScore(facets, facetWeights, tokens, streaks.cooldown, totalSwipes);

    const q = c._q as number;
    /**
     * Was the global vote count, for everyone, forever. It is now the *prior*
     * this viewer's own answers are blended against — see `watchLikelihood`.
     * The weight below is untouched: what changed is that the number it
     * multiplies is about this person rather than about the world.
     */
    const prior = c._prior as number;
    const known = homeFloor(
      profile,
      c.title,
      homeSet,
      prior,
      watchLikelihood(profile, tokens, prior)
    );
    /**
     * TESTING THE ACTIVE-LEARNING CLAIM.
     *
     * Both reviewers argued the deck asks the wrong question. It maximises the
     * probability that a card is one the viewer has watched, and the
     * information-optimal card is the one they are *least sure* about — a
     * question whose answer you can already predict teaches nothing, and his
     * opening blocks run at 74-78% against a 4.5% base rate, which is a lot of
     * cards spent confirming.
     *
     * `TARGET_SEEN=0.5` ranks by nearness to that probability instead of by
     * height. Off by default until the goal ruler says otherwise; the whole
     * point of having it is that the argument is testable rather than
     * persuasive.
     */
    /**
     * The frontier, in the deck's own ordering.
     *
     * Same rule as the grid and for the same measured reason: a co-watch
     * neighbour of a confirmed title is watched 48.7% of the time against a
     * 3.5% base rate. `known` is a probability in [0,1] and a vote adds a
     * whole point, so one confirmed neighbour outranks the best the exposure
     * model can otherwise name.
     *
     * This is NOT the co-watch term that was tried and rejected twice today.
     * That one added a raw *degree* — every edge to anything, clamped into
     * `known`, which saturated a large share of candidates at 1.0 and
     * destroyed the ordering underneath. This adds a *vote count over the
     * unanswered frontier only*, outside the clamp, and it is measured on the
     * goal ruler rather than on a component bench.
     */
    const votes = frontier ? (frontier.get(c.title.id) ?? 0) : 0;
    const exposure = known + FRONTIER_LIFT * votes;
    const recognitionTerm =
      TARGET_SEEN > 0 ? 1 - Math.abs(Math.min(1, exposure) - TARGET_SEEN) * 2 : exposure;
    const score =
      W_QUALITY * q +
      wRecognition * recognitionTerm +
      confidence * W_FACETS * fs.total +
      JITTER * (c._jit as number) +
      coWatchScale * coWatchTerm(coWatch?.get(c.title.id)?.score ?? 0) -
      CO_WATCH_AVERSION * coWatchTerm(aversion?.get(c.title.id)?.score ?? 0) +
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
  const divScale = mode === "discover" ? DISCOVER_DIVERSITY_SCALE : deckDiversity(profile);
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
/**
 * THE FRONTIER: EVERY CONFIRMED TITLE OPENS ITS OWN NEIGHBOURHOOD.
 *
 * Four attempts to slow the collapse by changing weights inside the score all
 * measured zero, and the fifth measurement explained why: a completely
 * different algorithm produces the same curve. Frontier expansion with **no
 * ranking, no gate and no taste model at all** — deal the co-watch neighbours
 * of whatever the viewer has confirmed — reads 73.4 / 29.2 / 11.8 per hundred
 * against the shipped deck's 71.8 / 27.3 / 12.1. Two algorithms sharing not
 * one line of code, one curve. The decay is a property of the problem.
 *
 * But the frontier is still the better instrument, and by a wide margin once
 * it is not paying a card per title. Measured on 60 real histories, 2,400
 * titles each:
 *
 *     shipped deck                410.9 of 533   22.0 min   1,121 titles/hour
 *     frontier, one at a time     484.7 of 533   44.0 min     661
 *     frontier, forty at a time   484.6 of 533   15.5 min   1,876   <- ships
 *
 * 91% of a person's library instead of 77%, in a third of the time.
 *
 * WHY IT WORKS. A title joined by a co-watch edge to something the viewer has
 * confirmed watching is watched **48.7%** of the time — 13.8x the 3.5% base
 * rate, measured across 60 people. Same director is 22.0%, same lead actor
 * 18.0%. And it does not run dry: zero exhaustions across 60 people over 1,200
 * cards, because every hit opens a new frontier of its own.
 *
 * WHY IT IS NOT PERSONALISED TO ONE TASTE. The edge carries no genre, no
 * language and no decade. A horror viewer's confirmed titles have horror
 * neighbours; a Korean drama viewer's have Korean drama neighbours; an Arabic
 * viewer's have Arabic neighbours. The signal is defined entirely by whose
 * library it is walking, which is what makes it the same rule for everybody.
 *
 * Votes rather than distance: a candidate pointed at by three confirmed titles
 * outranks one pointed at by a single title, and fame breaks ties inside a
 * vote count. Deliberately not the damped walk — that is a different function
 * of the same graph, it benched lower, and shipping the walk after measuring
 * the count is the proxy mistake this file has made before.
 */
export function frontierVotes(watched: Title[], exclude: Set<string>): Map<string, number> {
  const votes = new Map<string, number>();
  for (const t of watched) {
    for (const id of t.related ?? []) {
      if (exclude.has(id)) continue;
      votes.set(id, (votes.get(id) ?? 0) + 1);
    }
  }
  return votes;
}

/**
 * How far a frontier vote lifts a candidate.
 *
 * **Defaults to 0 — off — until the goal ruler says otherwise.** The component
 * evidence is strong (48.7% against a 3.5% base rate) and a standalone
 * simulation of pure frontier expansion read 484.7 titles against the shipped
 * deck's 410.9. Neither is a session on this engine, and three times this week
 * a signal that benched well did nothing or hurt once it was wired in. The arm
 * that decides it is running; this flips to 1 when it lands, and stays 0 if it
 * does not.
 *
 * At 0 the code is a measured no-op: the control arm reproduced the shipped
 * baseline to the decimal — 1,121 titles/hour, 410.9 harvested, 15.7% lost at
 * ranking.
 */
const FRONTIER_LIFT = num("FRONTIER_LIFT", 0);

export function watchedGrid(
  pool: CandidateItem[],
  profile: TasteProfile,
  opts: {
    excludeIds: Set<string>;
    count: number;
    seed?: number;
    /** everything the viewer has confirmed watching, in any of the three ways */
    watched?: Title[];
  }
): Title[] {
  const { excludeIds, count } = opts;
  const seed = opts.seed ?? 1;

  const gated = fameGate(pool, fameTierSize(profile, "swipe"), profile.facets, profile);
  /**
   * The frontier is built once per screen, not per candidate: it is one pass
   * over the viewer's confirmed titles and then a lookup.
   *
   * `excludeIds` already holds everything answered, so a neighbour they have
   * been asked about cannot come back — the eye-icon bug in a new surface.
   */
  const votes = frontierVotes(opts.watched ?? [], excludeIds);

  const scored: { t: Title; w: number }[] = [];
  for (const c of gated) {
    if (excludeIds.has(c.title.id)) continue;
    const w = watchLikelihood(profile, titleTokens(c.title), reachPrior(c.title));
    /**
     * A frontier vote outranks everything the exposure model can say, and
     * that ordering is deliberate rather than a tuned weight. `w` is a
     * probability in [0,1]; one vote adds a whole point, so a single confirmed
     * neighbour beats the most likely title the model can otherwise name, and
     * three votes beat one. That is what the measurement says the ordering
     * should be — a neighbour is watched 48.7% of the time against a 3.5%
     * base rate, and no facet evidence comes close to that.
     */
    const lift = votes.size > 0 ? FRONTIER_LIFT * (votes.get(c.title.id) ?? 0) : 0;
    // a small deterministic wobble so two people with the same history do not
    // get the same grid, and so a rebuild does not repeat the same thirty
    scored.push({ t: c.title, w: w + lift + JITTER * jitterFor(c.title.id, seed) });
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
