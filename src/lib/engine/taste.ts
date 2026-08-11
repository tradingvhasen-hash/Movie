import { DIM } from "./features";
import type { SwipeAction } from "../types";

/**
 * The user's fingerprint, built purely from swipe signals. Two independent
 * models are tracked:
 *
 *  - taste       — what they enjoy: likes pull, dislikes push
 *  - familiarity — what they are likely to have heard of: everything they
 *                  have seen (liked *or* disliked) pulls, everything they
 *                  swiped "not seen" pushes
 *
 * Keeping them apart matters: disliking a film still proves you know that
 * corner of cinema, and skipping ten anime proves you don't — a distinction
 * a single taste vector cannot express.
 *
 * Serializable to plain arrays so it can live in localStorage or Postgres.
 */
export interface TasteProfile {
  /** blended taste direction (likes pull, dislikes push) */
  taste: number[];
  /** centroid sum of liked titles */
  likedSum: number[];
  likedCount: number;
  /** centroid sum of disliked titles */
  dislikedSum: number[];
  dislikedCount: number;
  /** centroid sum of everything the user has actually watched */
  seenSum: number[];
  seenCount: number;
  /** centroid sum of everything the user swiped away as unwatched */
  unseenSum: number[];
  unseenCount: number;
  /** likes + dislikes (taste evidence) */
  ratedSwipes: number;
  /** every swipe including "not seen" (familiarity evidence) */
  totalSwipes: number;
}

export const LIKE_WEIGHT = 1.0;
export const DISLIKE_WEIGHT = -0.7;
/** decay applied to the running taste vector before each update → recency bias */
export const RECENCY_DECAY = 0.995;

export function emptyProfile(): TasteProfile {
  return {
    taste: new Array(DIM).fill(0),
    likedSum: new Array(DIM).fill(0),
    likedCount: 0,
    dislikedSum: new Array(DIM).fill(0),
    dislikedCount: 0,
    seenSum: new Array(DIM).fill(0),
    seenCount: 0,
    unseenSum: new Array(DIM).fill(0),
    unseenCount: 0,
    ratedSwipes: 0,
    totalSwipes: 0,
  };
}

/** tolerate profiles persisted before the familiarity model existed */
export function normalizeProfile(p: Partial<TasteProfile> | undefined): TasteProfile {
  const base = emptyProfile();
  if (!p || !Array.isArray(p.taste) || p.taste.length !== DIM) return base;
  return {
    ...base,
    ...p,
    seenSum: Array.isArray(p.seenSum) && p.seenSum.length === DIM ? p.seenSum : base.seenSum,
    unseenSum:
      Array.isArray(p.unseenSum) && p.unseenSum.length === DIM ? p.unseenSum : base.unseenSum,
    seenCount: p.seenCount ?? 0,
    unseenCount: p.unseenCount ?? 0,
    totalSwipes: p.totalSwipes ?? p.ratedSwipes ?? 0,
  } as TasteProfile;
}

export function applySwipe(
  profile: TasteProfile,
  vector: Float32Array | number[],
  action: SwipeAction
): TasteProfile {
  const next: TasteProfile = {
    ...profile,
    taste: [...profile.taste],
    likedSum: [...profile.likedSum],
    dislikedSum: [...profile.dislikedSum],
    seenSum: [...profile.seenSum],
    unseenSum: [...profile.unseenSum],
    totalSwipes: profile.totalSwipes + 1,
  };

  if (action === "not_seen") {
    // no taste signal, but strong evidence about what the user doesn't know
    for (let i = 0; i < DIM; i++) next.unseenSum[i] += vector[i] ?? 0;
    next.unseenCount += 1;
    return next;
  }

  const w = action === "liked" ? LIKE_WEIGHT : DISLIKE_WEIGHT;
  for (let i = 0; i < DIM; i++) {
    next.taste[i] = next.taste[i] * RECENCY_DECAY + w * (vector[i] ?? 0);
    next.seenSum[i] += vector[i] ?? 0;
  }
  next.seenCount += 1;

  if (action === "liked") {
    for (let i = 0; i < DIM; i++) next.likedSum[i] += vector[i] ?? 0;
    next.likedCount += 1;
  } else {
    for (let i = 0; i < DIM; i++) next.dislikedSum[i] += vector[i] ?? 0;
    next.dislikedCount += 1;
  }
  next.ratedSwipes += 1;
  return next;
}

/** Exact inverse of applySwipe for undo support */
export function revertSwipe(
  profile: TasteProfile,
  vector: Float32Array | number[],
  action: SwipeAction
): TasteProfile {
  const next: TasteProfile = {
    ...profile,
    taste: [...profile.taste],
    likedSum: [...profile.likedSum],
    dislikedSum: [...profile.dislikedSum],
    seenSum: [...profile.seenSum],
    unseenSum: [...profile.unseenSum],
    totalSwipes: Math.max(0, profile.totalSwipes - 1),
  };

  if (action === "not_seen") {
    for (let i = 0; i < DIM; i++) next.unseenSum[i] -= vector[i] ?? 0;
    next.unseenCount = Math.max(0, next.unseenCount - 1);
    return next;
  }

  const w = action === "liked" ? LIKE_WEIGHT : DISLIKE_WEIGHT;
  for (let i = 0; i < DIM; i++) {
    next.taste[i] = (next.taste[i] - w * (vector[i] ?? 0)) / RECENCY_DECAY;
    next.seenSum[i] -= vector[i] ?? 0;
  }
  next.seenCount = Math.max(0, next.seenCount - 1);

  if (action === "liked") {
    for (let i = 0; i < DIM; i++) next.likedSum[i] -= vector[i] ?? 0;
    next.likedCount = Math.max(0, next.likedCount - 1);
  } else {
    for (let i = 0; i < DIM; i++) next.dislikedSum[i] -= vector[i] ?? 0;
    next.dislikedCount = Math.max(0, next.dislikedCount - 1);
  }
  next.ratedSwipes = Math.max(0, next.ratedSwipes - 1);
  return next;
}

/** Rated swipes needed before the taste model is trusted at full weight */
export const TASTE_CONFIDENCE_K = 7;

/**
 * How much to trust the taste vector, 0..1. With one or two likes the
 * fingerprint is nearly meaningless — leaning on it fully is what makes a
 * single animated film flood the deck with cartoons — so its weight ramps
 * up as evidence accumulates and the popularity/quality prior fills the gap.
 */
export function tasteConfidence(profile: TasteProfile): number {
  return profile.ratedSwipes / (profile.ratedSwipes + TASTE_CONFIDENCE_K);
}

/** Familiarity is a coarser signal, so it firms up with less evidence */
const FAMILIARITY_K = 4;

export function seenConfidence(profile: TasteProfile): number {
  return profile.seenCount / (profile.seenCount + FAMILIARITY_K);
}

export function unseenConfidence(profile: TasteProfile): number {
  return profile.unseenCount / (profile.unseenCount + FAMILIARITY_K);
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
