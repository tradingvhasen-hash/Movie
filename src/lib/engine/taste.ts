import { DIM } from "./features";
import {
  applyFacets,
  emptyFacets,
  emptyFacetWeights,
  emptyStreaks,
  facetScore,
  pruneFacets,
  revertFacets,
  signalFor,
  titleTokens,
  trackStreak,
  updateFacetWeights,
  type FacetTables,
  type FacetWeights,
  type StreakState,
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
  /** titles the user has actually watched */
  seenCount: number;
  /** titles swiped away as unwatched */
  unseenCount: number;
}

export const LIKE_WEIGHT = 1.0;
export const DISLIKE_WEIGHT = -0.7;
/** decay applied to the running taste vector before each update → recency bias */
export const RECENCY_DECAY = 0.995;

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
    ratedSwipes: 0,
    totalSwipes: 0,
    seenCount: 0,
    unseenCount: 0,
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
    seenCount: p.seenCount ?? 0,
    unseenCount: p.unseenCount ?? 0,
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
  const tokens = titleTokens(title);
  const signal = signalFor(action);

  // measured before the update, so a facet cannot "predict" the very example
  // it is about to learn
  const before = facetScore(profile.facets, profile.facetWeights, tokens);

  const streak = trackStreak(profile.streaks, tokens, action, profile.totalSwipes);

  const next: TasteProfile = {
    ...profile,
    facets: pruneFacets(applyFacets(profile.facets, tokens, signal)),
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
  const signal = signalFor(action);

  const next: TasteProfile = {
    ...profile,
    facets: revertFacets(profile.facets, tokens, signal),
    // an undone swipe should not keep a theme benched
    streaks: { runs: {}, cooldown: profile.streaks.cooldown },
    totalSwipes: Math.max(0, profile.totalSwipes - 1),
  };

  if (action === "not_seen") {
    next.unseenCount = Math.max(0, profile.unseenCount - 1);
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

/** Calibration ends once taste evidence exists, or enough cards were seen */
export const COLD_START_TARGET = 8;
const COLD_START_MAX_CARDS = 30;

export function isCalibrating(profile: TasteProfile): boolean {
  return (
    profile.ratedSwipes < COLD_START_TARGET &&
    profile.totalSwipes < COLD_START_MAX_CARDS
  );
}
