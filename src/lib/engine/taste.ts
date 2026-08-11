import { DIM } from "./features";
import type { SwipeAction } from "../types";

/**
 * The user's taste fingerprint: an incrementally-updated set of vectors
 * built purely from swipe signals. Serializable to plain arrays so it can
 * live in localStorage (guests) or Postgres (signed-in users).
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
  ratedSwipes: number;
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
    ratedSwipes: 0,
  };
}

export function applySwipe(
  profile: TasteProfile,
  vector: Float32Array | number[],
  action: SwipeAction
): TasteProfile {
  if (action === "not_seen") return profile; // neutral: no taste signal

  const w = action === "liked" ? LIKE_WEIGHT : DISLIKE_WEIGHT;
  const next = {
    ...profile,
    taste: [...profile.taste],
    likedSum: [...profile.likedSum],
    dislikedSum: [...profile.dislikedSum],
  };
  for (let i = 0; i < DIM; i++) {
    next.taste[i] = next.taste[i] * RECENCY_DECAY + w * (vector[i] ?? 0);
  }
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
  if (action === "not_seen") return profile;

  const w = action === "liked" ? LIKE_WEIGHT : DISLIKE_WEIGHT;
  const next = {
    ...profile,
    taste: [...profile.taste],
    likedSum: [...profile.likedSum],
    dislikedSum: [...profile.dislikedSum],
  };
  for (let i = 0; i < DIM; i++) {
    next.taste[i] = (next.taste[i] - w * (vector[i] ?? 0)) / RECENCY_DECAY;
  }
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

/** Minimum rated swipes before recommendations switch from calibration to personal */
export const COLD_START_TARGET = 12;

export function isCalibrating(profile: TasteProfile): boolean {
  return profile.ratedSwipes < COLD_START_TARGET;
}
