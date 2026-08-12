import { cosine, qualityPrior, recognizability, DIM } from "./features";
import {
  explainMatch,
  facetScore,
  matchPercent,
  titleTokens,
  type FacetTables,
} from "./facets";
import { isCalibrating, tasteConfidence, type TasteProfile } from "./taste";
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
const W_FACETS = 1.6;
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

/** MMR diversity penalty: higher → more varied results */
const MMR_LAMBDA = 0.35;
/** extra penalty per already-picked result sharing a genre */
const GENRE_REPEAT_PENALTY = 0.16;
/** how many top-scored candidates the diversity pass considers */
const FINALIST_POOL = 60;

/* ── fame gate ─────────────────────────────────────────────────────────
   Obscure titles never enter the queue, at any stage. The tier widens as
   the user proves how much they watch, but even the widest tier is the top
   3,000 of the catalog by vote count — "99% of these I've never heard of"
   is a pool problem, and this is where it is fixed. */
const FAME_TIERS = [
  { untilSwipes: 40, size: 800 },
  { untilSwipes: 150, size: 1800 },
  { untilSwipes: Infinity, size: 3000 },
];

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
 * So Discover keeps a floor (nothing from the true long tail, where the
 * metadata is too thin to match on anyway) and opens everything above it.
 */
const DISCOVER_POOL = 4000;

export type RankMode = "swipe" | "discover";

export function fameTierSize(profile: TasteProfile, mode: RankMode = "swipe"): number {
  if (mode === "discover") return DISCOVER_POOL;
  for (const tier of FAME_TIERS) {
    if (profile.totalSwipes < tier.untilSwipes) return tier.size;
  }
  return FAME_TIERS[FAME_TIERS.length - 1].size;
}

/** pool → the same items ordered by vote count, computed once per catalog */
const fameOrder = new WeakMap<CandidateItem[], CandidateItem[]>();

function byFame(pool: CandidateItem[]): CandidateItem[] {
  let sorted = fameOrder.get(pool);
  if (!sorted) {
    sorted = [...pool].sort((a, b) => b.title.voteCount - a.title.voteCount);
    fameOrder.set(pool, sorted);
  }
  return sorted;
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
  if (profile.ratedSwipes === 0) return 0;
  const warm = Math.min(1, profile.totalSwipes / 60);
  return 0.25 - 0.13 * warm;
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

/* ── main entry point ──────────────────────────────────────────────────── */

export interface RecommendOptions {
  excludeIds: Set<string>;
  count: number;
  /** stable per-user seed: two people never get an identical deck */
  seed?: number;
  /** builds a feature vector on demand, for the finalist diversity pass */
  vectorFor?: (title: Title) => Float32Array;
  /** liked titles, for "because you liked" explanations */
  likedItems?: CandidateItem[];
  /** candidate id → bonus from collaborative co-occurrence (cloud path) */
  coOccurrenceBonus?: Map<string, number>;
  /** override the automatic exploration share */
  exploreRatio?: number;
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
  const gated = byFame(pool).slice(0, fameTierSize(profile, mode));

  const confidence = tasteConfidence(profile);
  const wRecognition =
    mode === "discover"
      ? W_RECOGNITION_DISCOVER
      : W_RECOGNITION_COLD + (W_RECOGNITION_WARM - W_RECOGNITION_COLD) * confidence;
  const { facets, facetWeights, streaks, totalSwipes } = profile;

  const scored: { c: CandidateItem; score: number; facet: number }[] = [];
  for (const c of gated) {
    if (excludeIds.has(c.title.id)) continue;
    const tokens = titleTokens(c.title);
    const fs = facetScore(facets, facetWeights, tokens, streaks.cooldown, totalSwipes);

    const q = qualityPrior(c.title.rating, c.title.voteCount);
    const known = recognizability(c.title.voteCount);
    const score =
      W_QUALITY * q +
      wRecognition * known +
      confidence * W_FACETS * fs.total +
      JITTER * jitterFor(c.title.id, seed) +
      (opts.coOccurrenceBonus?.get(c.title.id) ?? 0);

    scored.push({ c, score, facet: fs.total });
  }

  if (scored.length === 0) return [];
  scored.sort((a, b) => b.score - a.score);

  // exploration exists to *learn*, which is a swiping activity. A probe in a
  // recommendation grid is just an off-topic suggestion.
  const exploreRatio =
    opts.exploreRatio ?? (mode === "discover" ? 0 : exploreRatioFor(profile));
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

  return picked.map(({ c, score, facet }) => {
    let becauseOf: string | undefined;
    if (opts.likedItems && opts.likedItems.length > 0) {
      const cv = vecOf(c);
      if (cv) {
        let best = -Infinity;
        for (const li of opts.likedItems) {
          const lv = vecOf(li);
          if (!lv) continue;
          const s = cosine(lv, cv);
          if (s > best) {
            best = s;
            becauseOf = best > 0.25 ? li.title.id : undefined;
          }
        }
      }
    }
    return {
      title: c.title,
      score,
      match: matchPercent(facet, confidence),
      reasons: explainMatch(facets, facetWeights, c.title).map((r) => ({
        kind: r.kind as string,
        label: r.label,
      })),
      becauseOf,
    };
  });
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
