import type { SwipeAction, Title } from "../types";

/**
 * Direct facet counters — the replacement for the hashed feature vector in
 * the hot path.
 *
 * The old model hashed every keyword, genre, actor and decade into 384
 * shared buckets. That destroyed three things at once: it needed dozens of
 * examples before the signal outweighed the collisions, it could never say
 * *why* a title matched, and it cost 1,536 float operations per candidate.
 *
 * Here every value is simply counted under its own name. Fewer examples are
 * needed (a director seen twice is already evidence), the reason for a match
 * is readable straight off the table, and scoring a title touches ~20 map
 * lookups instead of 1,536 multiplications.
 *
 * Vectors still exist — they are what the final diversity pass uses — but
 * they are computed for the last ~60 candidates only, never the whole pool.
 */

export const FACET_KINDS = [
  "story",
  "genre",
  "cast",
  "director",
  "era",
  "language",
] as const;

export type FacetKind = (typeof FACET_KINDS)[number];

/** token → [net evidence, observation mass] */
export type FacetTable = Record<string, [number, number]>;
export type FacetTables = Record<FacetKind, FacetTable>;
export type FacetWeights = Record<FacetKind, number>;

/**
 * How much a single swipe moves a token. Skips are deliberately weaker than
 * dislikes — "I haven't seen this" is softer evidence than "I saw it and
 * disliked it" — but they are no longer zero, which is what made thirty
 * skipped superhero films teach the deck nothing.
 */
export const LIKE_SIGNAL = 1;
export const DISLIKE_SIGNAL = -1;
export const SKIP_SIGNAL = -0.35;

/** shrinkage on a token's mean: one sighting is a hint, five are evidence */
const TOKEN_K = 1.5;

/** keywords per title actually counted (TMDB tails off into noise) */
const MAX_KEYWORDS = 14;
const MAX_CAST = 4;

/** consecutive skips sharing a value before it is hard-suppressed */
export const STREAK_TRIGGER = 3;
/** how many further swipes a streak-suppressed value stays benched */
export const COOLDOWN_SWIPES = 40;

/** starting importance of each facet, before the user teaches us otherwise */
const DEFAULT_WEIGHTS: FacetWeights = {
  story: 1.15,
  genre: 1.0,
  cast: 0.7,
  director: 0.6,
  era: 0.35,
  language: 0.45,
};

/** learning rate for facet importance; deliberately slow and bounded */
const WEIGHT_LR = 0.09;
const WEIGHT_MIN = 0.15;
const WEIGHT_MAX = 2.6;
/** rated swipes before facet importance starts moving at all */
const WEIGHT_WARMUP = 3;

/** table entries kept per facet before the weakest are pruned */
const MAX_TOKENS: Record<FacetKind, number> = {
  story: 1400,
  genre: 64,
  cast: 900,
  director: 500,
  era: 24,
  language: 48,
};

export function emptyFacets(): FacetTables {
  return {
    story: {},
    genre: {},
    cast: {},
    director: {},
    era: {},
    language: {},
  };
}

export function emptyFacetWeights(): FacetWeights {
  return { ...DEFAULT_WEIGHTS };
}

/* ── token extraction ─────────────────────────────────────────────────── */

export type TitleTokens = Record<FacetKind, string[]>;

const norm = (s: string) => s.trim().toLowerCase();

const tokenCache = new Map<string, TitleTokens>();

/**
 * The facet values of a title. Cached by id — the catalog is immutable once
 * loaded, and this runs for every candidate on every re-rank.
 */
export function titleTokens(title: Title): TitleTokens {
  const hit = tokenCache.get(title.id);
  if (hit) return hit;

  const decade = `${Math.floor(title.year / 10) * 10}s`;
  const tokens: TitleTokens = {
    story: title.keywords.slice(0, MAX_KEYWORDS).map(norm),
    genre: title.genres.map(norm),
    cast: title.people.cast.slice(0, MAX_CAST).map(norm),
    director: title.people.director ? [norm(title.people.director)] : [],
    era: [decade],
    language: [norm(title.originalLanguage)],
  };
  tokenCache.set(title.id, tokens);
  return tokens;
}

/* ── reading the tables ───────────────────────────────────────────────── */

/** A token's learned affinity in roughly [-1, 1], shrunk toward 0 when thin */
function tokenWeight(table: FacetTable, token: string): number {
  const entry = table[token];
  if (!entry) return 0;
  return entry[0] / (entry[1] + TOKEN_K);
}

export interface FacetScore {
  /** blended score in [-1, 1] */
  total: number;
  /** per-facet contribution, before weighting */
  perKind: Record<FacetKind, number>;
}

/**
 * Score a title against the tables.
 *
 * Each facet's raw score is the sum of its token affinities divided by the
 * square root of how many tokens it has: dividing by the count would let one
 * strong keyword out of twelve vanish, while not dividing at all would let
 * keyword-rich titles win on volume alone. tanh then bounds each facet to
 * [-1, 1] so no single one can dominate the blend.
 */
export function facetScore(
  tables: FacetTables,
  weights: FacetWeights,
  tokens: TitleTokens,
  cooldown?: Record<string, number>,
  swipeClock = 0
): FacetScore {
  const perKind = {} as Record<FacetKind, number>;
  let weighted = 0;
  let weightSum = 0;

  for (const kind of FACET_KINDS) {
    const list = tokens[kind];
    if (list.length === 0) {
      perKind[kind] = 0;
      continue;
    }
    const table = tables[kind];
    let sum = 0;
    for (const token of list) {
      // a value benched by a skip streak is treated as maximally negative
      // until its cooldown expires, no matter what the table says
      if (cooldown && (cooldown[token] ?? 0) > swipeClock) {
        sum -= 1;
        continue;
      }
      sum += tokenWeight(table, token);
    }
    const raw = Math.tanh(sum / Math.sqrt(list.length));
    perKind[kind] = raw;
    weighted += weights[kind] * raw;
    weightSum += weights[kind];
  }

  return { total: weightSum > 0 ? weighted / weightSum : 0, perKind };
}

/* ── writing the tables ───────────────────────────────────────────────── */

export function signalFor(action: SwipeAction): number {
  if (action === "liked") return LIKE_SIGNAL;
  if (action === "disliked") return DISLIKE_SIGNAL;
  return SKIP_SIGNAL;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Fold one swipe into the tables. Mutates a copy-on-write clone of each
 * touched facet so React/Zustand see a new object.
 */
export function applyFacets(
  tables: FacetTables,
  tokens: TitleTokens,
  signal: number
): FacetTables {
  const next = { ...tables };
  const mass = Math.abs(signal);
  for (const kind of FACET_KINDS) {
    const list = tokens[kind];
    if (list.length === 0) continue;
    const table = { ...next[kind] };
    for (const token of list) {
      const prev = table[token];
      table[token] = prev
        ? [round3(prev[0] + signal), round3(prev[1] + mass)]
        : [round3(signal), round3(mass)];
    }
    next[kind] = table;
  }
  return next;
}

/** Exact inverse of applyFacets, for undo */
export function revertFacets(
  tables: FacetTables,
  tokens: TitleTokens,
  signal: number
): FacetTables {
  const next = { ...tables };
  const mass = Math.abs(signal);
  for (const kind of FACET_KINDS) {
    const list = tokens[kind];
    if (list.length === 0) continue;
    const table = { ...next[kind] };
    for (const token of list) {
      const prev = table[token];
      if (!prev) continue;
      const s = round3(prev[0] - signal);
      const n = round3(prev[1] - mass);
      if (n <= 0.001) delete table[token];
      else table[token] = [s, n];
    }
    next[kind] = table;
  }
  return next;
}

/**
 * Keep the tables bounded. Long sessions would otherwise accumulate
 * thousands of one-off keywords, all of them noise, and every one of them
 * gets written to localStorage on every swipe.
 */
export function pruneFacets(tables: FacetTables): FacetTables {
  const next = { ...tables };
  for (const kind of FACET_KINDS) {
    const table = next[kind];
    const keys = Object.keys(table);
    const limit = MAX_TOKENS[kind];
    if (keys.length <= limit) continue;
    // keep the tokens carrying the most evidence, in either direction
    keys.sort((a, b) => {
      const ea = table[a];
      const eb = table[b];
      return Math.abs(eb[0]) * eb[1] - Math.abs(ea[0]) * ea[1];
    });
    const kept: FacetTable = {};
    for (let i = 0; i < limit; i++) kept[keys[i]] = table[keys[i]];
    next[kind] = kept;
  }
  return next;
}

/* ── learning which facet matters to this user ────────────────────────── */

/**
 * Credit assignment: after a rated swipe we know the answer, so every facet
 * that predicted it gains importance and every facet that got it wrong loses
 * some. If someone's likes are held together by the lead actor and not the
 * story, `cast` climbs and `story` falls on its own — which is exactly the
 * "did I like it for the actor or the plot?" question the single blended
 * vector could never answer.
 *
 * `perKind` must be measured *before* the swipe is folded in, otherwise every
 * facet trivially predicts the example it just learned.
 */
export function updateFacetWeights(
  weights: FacetWeights,
  perKind: Record<FacetKind, number>,
  action: SwipeAction,
  ratedSwipes: number
): FacetWeights {
  if (action === "not_seen" || ratedSwipes < WEIGHT_WARMUP) return weights;
  const target = action === "liked" ? 1 : -1;

  const next = {} as FacetWeights;
  let sum = 0;
  for (const kind of FACET_KINDS) {
    const agreement = (perKind[kind] ?? 0) * target;
    const w = weights[kind] * (1 + WEIGHT_LR * Math.tanh(agreement * 2));
    next[kind] = Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, w));
    sum += next[kind];
  }
  // hold the mean fixed so the blend keeps a stable scale as weights shift
  const target_mean = FACET_KINDS.length;
  const scale = sum > 0 ? target_mean / sum : 1;
  for (const kind of FACET_KINDS) next[kind] = round3(next[kind] * scale);
  return next;
}

/* ── skip streaks ─────────────────────────────────────────────────────── */

export interface StreakState {
  /** value → consecutive skips it has appeared in */
  runs: Record<string, number>;
  /** value → swipe clock at which its suppression lifts */
  cooldown: Record<string, number>;
}

export function emptyStreaks(): StreakState {
  return { runs: {}, cooldown: {} };
}

/** facets a skip streak is allowed to bench — the ones a user thinks in */
const STREAK_KINDS: FacetKind[] = ["story", "genre", "cast"];

/**
 * Track runs of consecutive skips.
 *
 * Gradual down-weighting is too slow to feel like listening: by the time the
 * counters catch up the user has skipped thirty superhero films and concluded
 * the app is broken. So three consecutive skips sharing a value bench it
 * outright for the next forty swipes.
 *
 * Any rated swipe clears the runs — a like or a dislike means the user is
 * engaging with what they are shown, not fleeing a theme.
 */
export function trackStreak(
  state: StreakState,
  tokens: TitleTokens,
  action: SwipeAction,
  swipeClock: number
): { state: StreakState; benched: string[] } {
  if (action !== "not_seen") {
    return { state: { runs: {}, cooldown: state.cooldown }, benched: [] };
  }

  const runs: Record<string, number> = {};
  const cooldown = { ...state.cooldown };
  const benched: string[] = [];

  for (const kind of STREAK_KINDS) {
    for (const token of tokens[kind]) {
      const run = (state.runs[token] ?? 0) + 1;
      runs[token] = run;
      if (run >= STREAK_TRIGGER) {
        cooldown[token] = swipeClock + COOLDOWN_SWIPES;
        benched.push(token);
      }
    }
  }

  // drop expired benchings so the map cannot grow without bound
  for (const token of Object.keys(cooldown)) {
    if (cooldown[token] <= swipeClock) delete cooldown[token];
  }

  return { state: { runs, cooldown }, benched };
}

/* ── explanation ──────────────────────────────────────────────────────── */

/** Display label for a token, recovered from the title it came from */
function labelFor(title: Title, kind: FacetKind, token: string): string {
  const pools: Record<FacetKind, string[]> = {
    story: title.keywords,
    genre: title.genres,
    cast: title.people.cast,
    director: title.people.director ? [title.people.director] : [],
    era: [`${Math.floor(title.year / 10) * 10}s`],
    language: [title.originalLanguage.toUpperCase()],
  };
  return pools[kind].find((v) => norm(v) === token) ?? token;
}

export interface MatchReason {
  kind: FacetKind;
  label: string;
  strength: number;
}

/**
 * The two or three concrete values that most explain a match, strongest
 * first. This is what turns "83%" into "same director · thriller · 2010s".
 */
export function explainMatch(
  tables: FacetTables,
  weights: FacetWeights,
  title: Title,
  limit = 3
): MatchReason[] {
  const tokens = titleTokens(title);
  const reasons: MatchReason[] = [];

  for (const kind of FACET_KINDS) {
    const table = tables[kind];
    for (const token of tokens[kind]) {
      const strength = tokenWeight(table, token) * weights[kind];
      if (strength > 0.08) {
        reasons.push({ kind, label: labelFor(title, kind, token), strength });
      }
    }
  }

  reasons.sort((a, b) => b.strength - a.strength);
  // one reason per facet keeps the line informative instead of listing four
  // keywords that all say the same thing
  const seen = new Set<FacetKind>();
  const out: MatchReason[] = [];
  for (const r of reasons) {
    if (seen.has(r.kind)) continue;
    seen.add(r.kind);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Turn a raw blended score into a percentage that means something.
 *
 * The old percentage divided by the highest score in the batch, so the top
 * card was always 100% and an identical result could read 100% in one batch
 * and 83% in the next. A logistic curve on the absolute score is stable
 * across batches: the same title always reports the same number.
 */
export function matchPercent(total: number, confidence: number): number {
  const centred = total * 3.2 - 0.35;
  const p = 1 / (1 + Math.exp(-centred));
  // with no evidence yet, pull everything toward a neutral 50%
  return Math.round((0.5 + (p - 0.5) * (0.35 + 0.65 * confidence)) * 100);
}
