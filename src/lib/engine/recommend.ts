import { cosine, qualityPrior, recognizability, DIM } from "./features";
import {
  eraAffinity,
  isCalibrating,
  languageAffinity,
  seenConfidence,
  tasteConfidence,
  unseenConfidence,
  type TasteProfile,
} from "./taste";
import type { Recommendation, Title } from "../types";

export interface CandidateItem {
  title: Title;
  vector: Float32Array;
}

/* ── scoring weights ───────────────────────────────────────────────────
   Taste is scaled by confidence, so early on the recognizability and
   quality priors dominate and the deck stays full of titles the user has
   a real chance of having watched. */
const W_TASTE = 1.0;
const W_LIKED_CENTROID = 0.45;
const W_DISLIKED_PENALTY = 0.6;
/** pull toward regions the user has actually watched */
const W_SEEN = 0.5;
/** push away from regions they keep skipping as unwatched */
const W_UNSEEN = 0.65;
const W_QUALITY = 0.25;
/**
 * Pull toward well-known titles. This stays high even once taste is
 * established: a perfectly-matched film with 300 ratings is still a film
 * the user has never heard of, and a deck of those reads as random.
 */
const W_RECOGNITION_COLD = 0.9;
const W_RECOGNITION_WARM = 0.55;
/** favour languages the user actually watches */
const W_LANGUAGE = 0.3;
/** favour the era their likes cluster in */
const W_ERA = 0.28;

/** MMR diversity penalty: higher → more varied results */
const MMR_LAMBDA = 0.35;
/** extra penalty per already-picked result sharing the primary genre */
const GENRE_REPEAT_PENALTY = 0.16;
/** fraction of slots reserved for guided exploration */
const EXPLORE_RATIO = 0.1;

function centroid(sum: number[], count: number): number[] | null {
  if (count === 0) return null;
  return sum.map((x) => x / count);
}

/**
 * Two-stage recommender over an in-memory candidate pool (bundled catalog or
 * a pgvector pre-filtered set): blended scoring, then MMR re-ranking with a
 * genre-repeat penalty, then a small exploration injection.
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
    /**
     * Fraction of slots given to diverse anchors that probe unexplored taste
     * regions. Callers pass a value that shrinks as evidence accumulates, so
     * a cold profile still gets breadth while every swipe already steers the
     * remaining slots.
     */
    anchorRatio?: number;
  }
): Recommendation[] {
  const { excludeIds, count } = opts;
  const likedC = centroid(profile.likedSum, profile.likedCount);
  const dislikedC = centroid(profile.dislikedSum, profile.dislikedCount);
  const seenC = centroid(profile.seenSum, profile.seenCount);
  const unseenC = centroid(profile.unseenSum, profile.unseenCount);

  const confidence = tasteConfidence(profile);
  // familiarity signals are shrunk the same way: one watched title says
  // almost nothing about which corners of cinema the user knows
  const wSeen = W_SEEN * seenConfidence(profile);
  const wUnseen = W_UNSEEN * unseenConfidence(profile);
  const wRecognition =
    W_RECOGNITION_COLD + (W_RECOGNITION_WARM - W_RECOGNITION_COLD) * confidence;

  const scored = pool
    .filter((c) => !excludeIds.has(c.title.id))
    .map((c) => {
      const q = qualityPrior(c.title.rating, c.title.voteCount);
      const known = recognizability(c.title.voteCount);

      let score = W_QUALITY * q + wRecognition * known;

      if (profile.ratedSwipes > 0) {
        const tasteSim = cosine(profile.taste, c.vector);
        const likedSim = likedC ? cosine(likedC, c.vector) : 0;
        const dislikedSim = dislikedC ? Math.max(0, cosine(dislikedC, c.vector)) : 0;
        score +=
          confidence *
          (W_TASTE * tasteSim + W_LIKED_CENTROID * likedSim - W_DISLIKED_PENALTY * dislikedSim);
      }

      // familiarity: independent of taste, and available from the very
      // first "not seen" swipe
      if (seenC) score += wSeen * Math.max(0, cosine(seenC, c.vector));
      if (unseenC) score -= wUnseen * Math.max(0, cosine(unseenC, c.vector));

      // language and era are barely represented in the feature vector, so
      // they are applied directly — otherwise a keyword match alone can put
      // a 1970s Italian comedy above an obvious modern one
      score += W_LANGUAGE * languageAffinity(profile, c.title.originalLanguage);
      score += W_ERA * eraAffinity(profile, c.title.year);

      score += opts.coOccurrenceBonus?.get(c.title.id) ?? 0;
      return { c, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return [];

  // Stage 2: MMR re-ranking over the head of the ranked list
  const headSize = Math.min(scored.length, Math.max(count * 6, 80));
  const head = scored.slice(0, headSize);
  const picked: typeof head = [];
  const remaining = [...head];
  const genreCounts = new Map<string, number>();

  const exploreSlots = profile.ratedSwipes > 0 ? Math.ceil(count * EXPLORE_RATIO) : 0;
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
      // Vector diversity alone lets one tight cluster (animation, say) fill
      // the whole page, so genre saturation is penalised explicitly. All of
      // a title's genres count, not just the first: animated films scatter
      // across "animation", "family" and "adventure" and would otherwise
      // slip past a primary-genre-only check.
      let repeats = 0;
      for (const g of cand.c.title.genres) {
        repeats = Math.max(repeats, genreCounts.get(g) ?? 0);
      }
      const val = cand.score - MMR_LAMBDA * maxSim - GENRE_REPEAT_PENALTY * repeats;
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

  // Guided exploration: sample from the mid-tail (rank 20%..55%), still
  // biased toward titles the user could plausibly know
  if (exploreSlots > 0) {
    const tail = scored
      .slice(Math.floor(scored.length * 0.2), Math.floor(scored.length * 0.55))
      .filter((s) => !picked.includes(s));
    let rngState = (opts.seed ?? Date.now()) >>> 0;
    const rng = () => {
      rngState = (rngState * 1664525 + 1013904223) >>> 0;
      return rngState / 0xffffffff;
    };
    for (let k = 0; k < exploreSlots && tail.length > 0; k++) {
      // best of two random draws → skews toward the more recognizable
      const a = Math.floor(rng() * tail.length);
      const b = Math.floor(rng() * tail.length);
      const idx =
        tail[a].c.title.voteCount >= tail[b].c.title.voteCount ? a : b;
      picked.push(tail.splice(idx, 1)[0]);
    }
  }

  // Diverse anchors: instead of a separate "calibration mode" that ignores
  // taste entirely, breadth is bought with a shrinking share of slots. The
  // ranked picks above already reflect the newest swipe.
  const anchorRatio = Math.max(0, Math.min(1, opts.anchorRatio ?? 0));
  const anchorSlots = Math.round(count * anchorRatio);
  if (anchorSlots > 0 && picked.length > 0) {
    const takenIds = new Set(picked.map((p) => p.c.title.id));
    const median = picked[Math.floor(picked.length / 2)]?.score ?? 0;
    const anchorItems = calibrationDeck(
      pool,
      new Set([...excludeIds, ...takenIds]),
      anchorSlots
    )
      .map((t) => pool.find((p) => p.title.id === t.id))
      .filter((x): x is CandidateItem => Boolean(x))
      .map((c) => ({ c, score: median }));

    // drop the weakest ranked picks, then interleave the anchors so breadth
    // is spread through the deck rather than parked at the end
    const kept = picked.slice(0, Math.max(0, picked.length - anchorItems.length));
    const merged: typeof picked = [];
    const step = anchorItems.length > 0 ? Math.ceil(kept.length / anchorItems.length) : 0;
    let ai = 0;
    for (let i = 0; i < kept.length; i++) {
      merged.push(kept[i]);
      if (step > 0 && (i + 1) % step === 0 && ai < anchorItems.length) {
        merged.push(anchorItems[ai++]);
      }
    }
    while (ai < anchorItems.length) merged.push(anchorItems[ai++]);
    picked.length = 0;
    picked.push(...merged);
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
 * Cold-start calibration deck: diverse, widely-seen anchors. Greedy
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
      const val = minDist + recognizability(rest[i].title.voteCount) * 0.35;
      if (val > bestDist) {
        bestDist = val;
        bestIdx = i;
      }
    }
    picked.push(rest.splice(bestIdx, 1)[0]);
  }
  return picked.map((p) => p.title);
}

export { DIM, isCalibrating };
