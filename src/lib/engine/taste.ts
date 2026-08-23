import { DIM } from "./features";
import {
  applyFacets,
  emptyFacets,
  emptyFacetWeights,
  emptyStreaks,
  ensureRarityIndex,
  facetScore,
  pruneFacets,
  revertFacets,
  facetSignals,
  seenSignals,
  titleTokens,
  trackStreak,
  updateFacetWeights,
  seenScore,
  type FacetTables,
  type FacetWeights,
  type StreakState,
  type TitleTokens,
} from "./facets";
import type { SwipeAction, Title } from "../types";

/**
 * The user's fingerprint, built purely from swipe signals.
 *
 * The facet tables are the model. Everything a swipe teaches — themes,
 * genres, actors, directors, decade, language — lands in them by name, so
 * evidence accumulates per value rather than being smeared across 384 shared
 * hash buckets. That is what lets the deck converge in tens of swipes rather
 * than hundreds.
 *
 * The blended vector alongside them is not used for ranking. It is kept
 * because it costs one pass per swipe (not per candidate) and it is what the
 * pgvector cloud path queries with once Supabase is switched on.
 *
 * Serializable to plain JSON so it can live in localStorage or Postgres.
 */
export interface TasteProfile {
  /** per-value evidence: the model that actually drives ranking */
  facets: FacetTables;
  /** how much each facet matters to *this* user, learned from their swipes */
  facetWeights: FacetWeights;
  /** consecutive-skip runs and the values they have benched */
  streaks: StreakState;

  /** blended taste direction — cloud pgvector queries only */
  taste: number[];
  /** centroid sum of liked titles (diversity + "because you liked") */
  likedSum: number[];
  likedCount: number;
  dislikedSum: number[];
  dislikedCount: number;

  /** likes + dislikes (taste evidence) */
  ratedSwipes: number;
  /** every swipe including "not seen" — also the clock streak cooldowns use */
  totalSwipes: number;
  /**
   * Tokens from the most recent liked titles, newest first.
   *
   * The tables are a *set* — they know what you like, not when. Sequence
   * carries real information that a set throws away: three horror films in a
   * row tonight means you want a fourth now, not the comedy you liked last
   * month. Netflix's 2025 rebuild is built on exactly this idea, reading the
   * viewing history as an ordered sequence rather than a bag.
   *
   * RECORDED AS TRIED AND NOT SHIPPED. A scoring bonus built on this was
   * measured at four weights and made the benchmark worse every time
   * (19% → 17%). The likely reason is that the benchmark's simulated viewers
   * have a fixed taste and never change mood mid-session, so there is no
   * momentum to capture and the signal only over-weights whatever came last —
   * which means the test is blind to the idea rather than disproving it. The
   * field is kept and maintained so a future test with mood-switching viewers
   * can try again; nothing reads it today.
   */
  recent: string[][];

  /** titles the user has actually watched */
  seenCount: number;
  /**
   * How many cards in a row the viewer has answered "haven't seen".
   *
   * A count is not a streak, and the difference is what this exists for. The
   * totals say what a whole session looked like; this says what the LAST few
   * cards looked like, which is the only thing that can tell the deck it is
   * currently in the wrong place. Reset by any answer that means "I know this
   * one" — liked, disliked, or watched-no-opinion.
   */
  unseenStreak: number;
  /** titles swiped away as unwatched */
  unseenCount: number;

  /**
   * A second set of tables answering a different question: **what does this
   * person watch at all?**
   *
   * The deck's whole job is to show cards a viewer can rate, and a card they
   * have never seen cannot be rated. Until now the engine answered "have you
   * seen this?" with `recognizability(voteCount)` — a global vote count, one
   * answer for the whole of humanity — and paid for it with a weight of 0.9
   * falling to 0.55, larger than the taste term's entire range.
   *
   * That was never tested, and could not be: every ruler in this repo defines
   * its simulated viewer as someone who knows the most-voted titles, so fame
   * predicts recognition *by construction*. One real 449-swipe session settled
   * it (`scripts/seen-model.py`), predicting the second half from the first:
   *
   *     fame — what shipped              AUC 0.453
   *     his own genres + decade          AUC 0.707
   *     both together                    AUC 0.704
   *
   * Below a coin, and adding nothing on top of the personal model. Broken
   * down it inverts: over 50k votes → 13% watched, 8–20k → 37%, 3–8k → 41%.
   * The most famous titles in the catalog were the ones he was *least* likely
   * to have seen, because they are global blockbusters and he watches
   * comedies.
   *
   * So every swipe-up, which used to be spent on a weak taste signal and
   * nothing else, now also writes a full answer here. One viewer is enough to
   * retire the claim that fame predicts recognition and enough to justify
   * learning the answer per person; it is *not* enough to change a global
   * constant, which is why the fame term stays and this is blended against it
   * as the person's own evidence accumulates.
   */
  seenFacets: FacetTables;
}

export const LIKE_WEIGHT = 1.0;
export const DISLIKE_WEIGHT = -0.7;
/** decay applied to the running taste vector before each update → recency bias */
export const RECENCY_DECAY = 0.995;
/** how many recent likes carry short-term momentum */
export const RECENT_LIKES = 5;

export function emptyProfile(): TasteProfile {
  return {
    facets: emptyFacets(),
    facetWeights: emptyFacetWeights(),
    streaks: emptyStreaks(),
    taste: new Array(DIM).fill(0),
    likedSum: new Array(DIM).fill(0),
    likedCount: 0,
    dislikedSum: new Array(DIM).fill(0),
    dislikedCount: 0,
    recent: [],
    ratedSwipes: 0,
    totalSwipes: 0,
    seenCount: 0,
    unseenCount: 0,
    unseenStreak: 0,
    seenFacets: emptyFacets(),
  };
}

/** tolerate profiles persisted by any earlier build */
export function normalizeProfile(p: Partial<TasteProfile> | undefined): TasteProfile {
  const base = emptyProfile();
  if (!p) return base;
  const vec = (v: unknown, fallback: number[]) =>
    Array.isArray(v) && v.length === DIM ? (v as number[]) : fallback;
  return {
    ...base,
    ...p,
    facets: p.facets && typeof p.facets === "object" ? { ...base.facets, ...p.facets } : base.facets,
    // absent from every profile written before this shipped; an empty set is
    // the correct starting point and the fame prior carries alone until it
    // fills, so nothing has to be migrated
    seenFacets:
      p.seenFacets && typeof p.seenFacets === "object"
        ? { ...base.seenFacets, ...p.seenFacets }
        : base.seenFacets,
    facetWeights:
      p.facetWeights && typeof p.facetWeights === "object"
        ? { ...base.facetWeights, ...p.facetWeights }
        : base.facetWeights,
    streaks:
      p.streaks && typeof p.streaks === "object"
        ? { runs: p.streaks.runs ?? {}, cooldown: p.streaks.cooldown ?? {} }
        : base.streaks,
    taste: vec(p.taste, base.taste),
    likedSum: vec(p.likedSum, base.likedSum),
    dislikedSum: vec(p.dislikedSum, base.dislikedSum),
    likedCount: p.likedCount ?? 0,
    dislikedCount: p.dislikedCount ?? 0,
    ratedSwipes: p.ratedSwipes ?? 0,
    totalSwipes: p.totalSwipes ?? p.ratedSwipes ?? 0,
    recent: Array.isArray(p.recent) ? p.recent : [],
    seenCount: p.seenCount ?? 0,
    unseenCount: p.unseenCount ?? 0,
    unseenStreak: p.unseenStreak ?? 0,
  };
}

/**
 * Fold one swipe into the fingerprint.
 *
 * Every action teaches something now. A "not seen" swipe used to touch only
 * a familiarity centroid and leave taste untouched, which is why skipping
 * thirty superhero films changed nothing about what came next; it now writes
 * negative evidence into the same tables the ranking reads, and feeds the
 * streak detector that benches a theme outright after three in a row.
 */
export function applySwipe(
  profile: TasteProfile,
  title: Title,
  vector: Float32Array | number[],
  action: SwipeAction
): TasteProfile {
  /**
   * The rarity tables are built in idle slices on the main thread so they do
   * not own the first second of the app (see `buildRarityIndexIdle`). A swipe
   * is the one main-thread thing that reads them for a decision that has to be
   * right, so it finishes the build first if it is still outstanding. By the
   * time anyone can swipe — after the welcome demo and the taste picker —
   * there has been far more idle time than it needs, so this is a no-op in
   * practice and a correctness guarantee in principle.
   */
  ensureRarityIndex();

  const tokens = titleTokens(title);
  const signals = facetSignals(action);

  // measured before the update, so a facet cannot "predict" the very example
  // it is about to learn
  const before = facetScore(profile.facets, profile.facetWeights, tokens);

  const streak = trackStreak(profile.streaks, tokens, action, profile.totalSwipes);

  const next: TasteProfile = {
    ...profile,
    facets: pruneFacets(applyFacets(profile.facets, tokens, signals, action === "disliked")),
    // every action teaches the exposure model, including the one that teaches
    // taste the least
    seenFacets: pruneFacets(applyFacets(profile.seenFacets, tokens, seenSignals(action))),
    facetWeights: updateFacetWeights(
      profile.facetWeights,
      before.perKind,
      action,
      profile.ratedSwipes
    ),
    streaks: streak.state,
    totalSwipes: profile.totalSwipes + 1,
  };

  if (action === "not_seen") {
    next.unseenCount = profile.unseenCount + 1;
    next.unseenStreak = profile.unseenStreak + 1;
    return next;
  }
  /* any answer meaning "I know this one" ends the run */
  next.unseenStreak = 0;

  /**
   * A grid tap: watched, no verdict.
   *
   * It counts toward `seenCount` — which is what the fame ledger and the
   * exposure model read — and stops there. No taste vector, no liked centroid,
   * no `ratedSwipes`, because the person did not say they liked it. Thirty
   * taps on a grid should make the site know thirty more titles you have seen
   * and know nothing new about what you enjoy, and that is exactly right: the
   * two questions are separate and this is the answer to only one of them.
   */
  if (action === "seen") {
    next.seenCount = profile.seenCount + 1;
    return next;
  }

  next.taste = [...profile.taste];
  next.likedSum = [...profile.likedSum];
  next.dislikedSum = [...profile.dislikedSum];

  const w = action === "liked" ? LIKE_WEIGHT : DISLIKE_WEIGHT;
  for (let i = 0; i < DIM; i++) {
    next.taste[i] = next.taste[i] * RECENCY_DECAY + w * (vector[i] ?? 0);
  }
  next.seenCount = profile.seenCount + 1;

  if (action === "liked") {
    for (let i = 0; i < DIM; i++) next.likedSum[i] += vector[i] ?? 0;
    next.likedCount = profile.likedCount + 1;
    next.recent = [
      [...tokens.story.slice(0, 6), ...tokens.genre],
      ...profile.recent,
    ].slice(0, RECENT_LIKES);
  } else {
    for (let i = 0; i < DIM; i++) next.dislikedSum[i] += vector[i] ?? 0;
    next.dislikedCount = profile.dislikedCount + 1;
  }
  next.ratedSwipes = profile.ratedSwipes + 1;
  return next;
}

/**
 * Inverse of applySwipe, for undo. The counters revert exactly; the learned
 * facet importances do not (a perceptron update has no clean inverse) — they
 * move by at most ~9% per swipe and are renormalised, so an undone swipe
 * leaves no visible trace.
 */
export function revertSwipe(
  profile: TasteProfile,
  title: Title,
  vector: Float32Array | number[],
  action: SwipeAction
): TasteProfile {
  const tokens = titleTokens(title);
  const signals = facetSignals(action);

  const next: TasteProfile = {
    ...profile,
    facets: revertFacets(profile.facets, tokens, signals, action === "disliked"),
    seenFacets: revertFacets(profile.seenFacets, tokens, seenSignals(action)),
    // an undone swipe should not keep a theme benched
    streaks: { runs: {}, cooldown: profile.streaks.cooldown },
    totalSwipes: Math.max(0, profile.totalSwipes - 1),
  };

  if (action === "not_seen") {
    next.unseenCount = Math.max(0, profile.unseenCount - 1);
    return next;
  }

  if (action === "seen") {
    next.seenCount = Math.max(0, profile.seenCount - 1);
    return next;
  }

  next.taste = [...profile.taste];
  next.likedSum = [...profile.likedSum];
  next.dislikedSum = [...profile.dislikedSum];

  const w = action === "liked" ? LIKE_WEIGHT : DISLIKE_WEIGHT;
  for (let i = 0; i < DIM; i++) {
    next.taste[i] = (next.taste[i] - w * (vector[i] ?? 0)) / RECENCY_DECAY;
  }
  next.seenCount = Math.max(0, profile.seenCount - 1);

  if (action === "liked") {
    for (let i = 0; i < DIM; i++) next.likedSum[i] -= vector[i] ?? 0;
    next.likedCount = Math.max(0, profile.likedCount - 1);
  } else {
    for (let i = 0; i < DIM; i++) next.dislikedSum[i] -= vector[i] ?? 0;
    next.dislikedCount = Math.max(0, profile.dislikedCount - 1);
  }
  next.ratedSwipes = Math.max(0, profile.ratedSwipes - 1);
  return next;
}

/**
 * Rated swipes before the model is trusted at full weight. Lower than the
 * vector era's value: named counters need far fewer examples than hash
 * buckets to say something real.
 */
export const TASTE_CONFIDENCE_K = 4;

/**
 * How far to trust the facet tables, 0..1.
 *
 * Skips count toward this, discounted the same way their signal is. Keying
 * confidence off rated swipes alone meant a user who skipped ten superhero
 * films in a row had a model that knew it perfectly well and a confidence of
 * zero to multiply it by — the tables said "not this" and the ranking ignored
 * them.
 */
export function tasteConfidence(profile: TasteProfile): number {
  const evidence = profile.ratedSwipes + 0.45 * profile.unseenCount;
  return evidence / (evidence + TASTE_CONFIDENCE_K);
}

/* ── has this person watched this? ────────────────────────────────────── */

/**
 * Swipes before the viewer's own exposure model is trusted half as far as it
 * ever will be.
 *
 * Set at 45 by analogy with taste — exposure has no rarity weighting, no
 * learned facet importances and no streak detector, so let it move slowly —
 * and then measured, which is the only reason it is not 45 now. Sweeping the
 * blend weight directly against a real 449-swipe export (`seen-probe.ts`), AUC
 * on everything the viewer had not swiped yet:
 *
 *     trained on    fame only   w=0.4   w=0.8   personal only
 *      5 swipes       0.472     0.535   0.654       0.692
 *     12              0.472     0.565   0.699       0.721
 *     60              0.473     0.577   0.682       0.677
 *    320              0.449     0.635   0.768       0.774
 *
 * More personal is better at *every* prefix, from the fifth swipe on. Genre
 * carries it and a viewer's first few likes are already coherent, so the
 * tables are informative long before they are large.
 *
 * 8, not the 4 the curve above argues for, and the reason is a thing that
 * measurement cannot see. The AUC test ranks cards the deck actually showed
 * this viewer; in production the term ranks the whole gate, most of which his
 * tables have no data for at all. A title sharing no token with anything he
 * has swiped scores exactly 0.5 — the neutral middle — so at full trust the
 * unexplored majority of the catalog loses its ordering entirely. Keeping a
 * real share on the prior early is what keeps that majority sorted sensibly
 * while the tables are still thin. The cost is the gap between the w=0.4 and
 * w=0.8 columns for the first twenty or so swipes; the alternative risks the
 * region the ruler is blind to.
 */
export const SEEN_CONFIDENCE_K = 8;

/**
 * The most of the recognition term the personal model may ever take.
 *
 * Not 1, even though on the one viewer measured the global prior scored below
 * a coin flip and added nothing on top of the personal model. Two reasons, and
 * both are about what the data cannot tell us:
 *
 *   - The exposure tables can only learn from cards the deck chose to show,
 *     and the deck chooses by fame. A viewer never shown an obscure title has
 *     taught the model nothing about obscure titles, and the model does not
 *     know the difference between "you skip these" and "you were never asked".
 *   - It is one viewer. Someone whose watching genuinely tracks the
 *     blockbuster list exists, and for them the prior is right.
 *
 * Holding a quarter of the term on the global prior costs little if the
 * personal model is right and is the whole safety net if it is not.
 */
const SEEN_MAX_TRUST = 0.75;

/**
 * How much a viewer's answers actually *separate* anything.
 *
 * Volume is not information. Someone who has answered "I watched it" to all
 * two hundred cards has taught the exposure model nothing about exposure —
 * every token is positive, including the fallback, so ranking by it is
 * ranking by nothing. Worse than nothing, in fact: the tables are then a
 * blurred copy of the taste tables, so letting the gate select on them
 * double-counts taste and quietly narrows the pool. A ruler caught exactly
 * that — a persona that never swipes up took 2.5x as long to reach four named
 * titles, which is the signature of a deck that has stopped exploring.
 *
 * The same is true at the other end, and that one was caught first: a viewer
 * who has recognised nothing has also said nothing that separates one title
 * from another.
 *
 * So trust scales with the balance of the two answers, `4p(1-p)`, which is 1
 * when they are evenly split and falls to 0 as either takes over. Not a fudge
 * factor and not tuned — it is the variance of the very thing being predicted,
 * and a predictor of a constant is worth nothing however much of it there is.
 * On the real 449-swipe session (37% watched) it reads 0.93, so the case this
 * was all built for is barely touched.
 */
function answerBalance(profile: TasteProfile): number {
  const answered = profile.seenCount + profile.unseenCount;
  if (answered === 0) return 0;
  const p = profile.seenCount / answered;
  return 4 * p * (1 - p);
}

export function seenTrust(profile: TasteProfile): number {
  const evidence = profile.totalSwipes;
  return (
    SEEN_MAX_TRUST *
    (evidence / (evidence + SEEN_CONFIDENCE_K)) *
    answerBalance(profile)
  );
}

/**
 * How likely *this* viewer is to have watched a title, in [0,1], blending
 * their own answers with the global fame prior by how many answers they have
 * given.
 *
 * `fame` is passed in rather than recomputed so the caller keeps its one
 * `recognizability(voteCount)` call per candidate — this runs on every card in
 * the gate on every re-rank.
 */
export function watchLikelihood(
  profile: TasteProfile,
  tokens: TitleTokens,
  fame: number
): number {
  const w = seenTrust(profile);
  if (w <= 0) return fame;
  // facetScore is [-1, 1]; a probability-shaped term is what the ranking adds
  const personal = 0.5 + 0.5 * seenScore(profile.seenFacets, tokens);
  return (1 - w) * fame + w * personal;
}

/** Calibration ends once taste evidence exists, or enough cards were seen */
export const COLD_START_TARGET = 8;
const COLD_START_MAX_CARDS = 30;

export function isCalibrating(profile: TasteProfile): boolean {
  return (
    profile.ratedSwipes < COLD_START_TARGET &&
    profile.totalSwipes < COLD_START_MAX_CARDS
  );
}
