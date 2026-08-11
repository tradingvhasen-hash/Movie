import { cosine, qualityPrior, DIM } from "./features";
import { isCalibrating, type TasteProfile } from "./taste";
import type { Recommendation, Title } from "../types";

export interface CandidateItem {
  title: Title;
  vector: Float32Array;
}

/** Weights for the blended ranking score */
const W_TASTE = 1.0;
const W_LIKED_CENTROID = 0.45;
const W_DISLIKED_PENALTY = 0.55;
const W_QUALITY = 0.3;
/** MMR diversity penalty: higher → more varied results */
const MMR_LAMBDA = 0.3;
/** fraction of slots reserved for guided exploration */
const EXPLORE_RATIO = 0.1;

function centroid(sum: number[], count: number): number[] | null {
  if (count === 0) return null;
  return sum.map((x) => x / count);
}

/**
 * Two-stage recommender over an in-memory candidate pool (bundled catalog or
 * a pgvector pre-filtered set): blended scoring, then MMR re-ranking for
 * diversity, then a small exploration injection.
 */
export function recommend(
  pool: CandidateItem[],
  profile: TasteProfile,
  opts: {
    excludeIds: Set<string>;
    count: number;
    /** map from candidate id → similarity bonus from collaborative co-occurrence */
    coOccurrenceBonus?: Map<string, number>;
    likedItems?: CandidateItem[]; // for "because you liked" explanations
    seed?: number;
  }
): Recommendation[] {
  const { excludeIds, count } = opts;
  const likedC = centroid(profile.likedSum, profile.likedCount);
  const dislikedC = centroid(profile.dislikedSum, profile.dislikedCount);
  const hasTaste = profile.ratedSwipes > 0;

  const scored = pool
    .filter((c) => !excludeIds.has(c.title.id))
    .map((c) => {
      const q = qualityPrior(c.title.rating, c.title.voteCount);
      let score: number;
      if (!hasTaste) {
        // pure cold start: quality + popularity ordering
        score = q + Math.log10(1 + c.title.popularity) * 0.1;
      } else {
        const tasteSim = cosine(profile.taste, c.vector);
        const likedSim = likedC ? cosine(likedC, c.vector) : 0;
        const dislikedSim = dislikedC ? Math.max(0, cosine(dislikedC, c.vector)) : 0;
        const coBonus = opts.coOccurrenceBonus?.get(c.title.id) ?? 0;
        score =
          W_TASTE * tasteSim +
          W_LIKED_CENTROID * likedSim -
          W_DISLIKED_PENALTY * dislikedSim +
          W_QUALITY * q +
          coBonus;
      }
      return { c, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return [];

  // Stage 2: MMR re-ranking over the head of the ranked list
  const headSize = Math.min(scored.length, Math.max(count * 5, 60));
  const head = scored.slice(0, headSize);
  const picked: typeof head = [];
  const remaining = [...head];

  const exploreSlots = hasTaste ? Math.ceil(count * EXPLORE_RATIO) : 0;
  const mainSlots = count - exploreSlots;

  while (picked.length < mainSlots && remaining.length > 0) {
    let bestIdx = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      let maxSim = 0;
      for (const p of picked) {
        const s = cosine(cand.c.vector, p.c.vector);
        if (s > maxSim) maxSim = s;
      }
      const val = cand.score - MMR_LAMBDA * maxSim;
      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    }
    picked.push(remaining.splice(bestIdx, 1)[0]);
  }

  // Guided exploration: sample from the mid-tail (rank 30%..70%), weighted by quality
  if (exploreSlots > 0) {
    const tail = scored.slice(
      Math.floor(scored.length * 0.3),
      Math.floor(scored.length * 0.7)
    ).filter((s) => !picked.includes(s));
    let rngState = (opts.seed ?? Date.now()) >>> 0;
    const rng = () => {
      rngState = (rngState * 1664525 + 1013904223) >>> 0;
      return rngState / 0xffffffff;
    };
    for (let k = 0; k < exploreSlots && tail.length > 0; k++) {
      const idx = Math.floor(rng() * tail.length);
      picked.push(tail.splice(idx, 1)[0]);
    }
  }

  const maxScore = picked.reduce((m, p) => Math.max(m, p.score), 0.0001);

  return picked.map(({ c, score }) => {
    let becauseOf: string | undefined;
    if (opts.likedItems && opts.likedItems.length > 0) {
      let best = -Infinity;
      for (const li of opts.likedItems) {
        const s = cosine(li.vector, c.vector);
        if (s > best) {
          best = s;
          becauseOf = best > 0.25 ? li.title.id : undefined;
        }
      }
    }
    return {
      title: c.title,
      score: Math.max(0, Math.min(1, score / (maxScore || 1))),
      becauseOf,
    };
  });
}

/**
 * Cold-start calibration deck: diverse, very popular anchors. Greedy
 * farthest-point selection over the onboarding pool so consecutive cards
 * probe different regions of taste space.
 */
export function calibrationDeck(
  pool: CandidateItem[],
  excludeIds: Set<string>,
  count: number
): Title[] {
  const anchors = pool.filter(
    (c) => c.title.onboarding && !excludeIds.has(c.title.id)
  );
  const base = anchors.length > 0 ? anchors : pool.filter((c) => !excludeIds.has(c.title.id));
  if (base.length === 0) return [];

  // vote count, not popularity: we want titles many people have actually
  // seen, not whatever is trending this week
  const sorted = [...base].sort((a, b) => b.title.voteCount - a.title.voteCount);
  const picked: CandidateItem[] = [sorted[0]];
  const rest = sorted.slice(1);

  while (picked.length < count && rest.length > 0) {
    let bestIdx = 0;
    let bestDist = -Infinity;
    for (let i = 0; i < rest.length; i++) {
      let minDist = Infinity;
      for (const p of picked) {
        const d = 1 - cosine(rest[i].vector, p.vector);
        if (d < minDist) minDist = d;
      }
      // favour distant AND widely-seen anchors
      const val = minDist + Math.log10(1 + rest[i].title.voteCount) * 0.04;
      if (val > bestDist) {
        bestDist = val;
        bestIdx = i;
      }
    }
    picked.push(rest.splice(bestIdx, 1)[0]);
  }
  return picked.map((p) => p.title);
}

export { DIM };
