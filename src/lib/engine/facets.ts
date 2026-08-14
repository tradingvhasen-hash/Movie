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
  // raised from 0.35 on user report that Discover kept surfacing older
  // titles they did not recognise. Deliberately a nudge, not a jump: era is
  // real information (people do lean modern or classic) but a weak one, and
  // over-weighting it would bury a great match from the wrong decade.
  era: 0.55,
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

/* ── how informative a value is ───────────────────────────────────────── */

/**
 * Rarity weighting.
 *
 * Without this, a value shared by most of the catalog counts as much as one
 * that picks out a handful of titles. Measured on the real catalog: the token
 * `en` appears in 87% of titles, so after twenty English likes it contributed
 * an identical +0.73 to *every* English candidate — a large constant that
 * carries no information at all, and enough on its own to lift The Dark
 * Knight above a comedy for someone who only likes comedies.
 *
 * The weight is simply the share of the catalog a value does *not* cover:
 *
 *     en (87% of titles)      → 0.13   near-universal, separates nothing
 *     comedy (33%)            → 0.67   still tells us a great deal
 *     2010s (30%)             → 0.70
 *     a specific director     → ~1.0
 *
 * Textbook IDF was tried first and measurably made recommendations worse
 * (8/12 → 6/12 comedies for a comedy-only library). It is built for free text
 * with an open vocabulary; our facets are small closed lists, so its steep log
 * curve punished `comedy` almost as hard as `en` while inflating one-off
 * keywords — and 46% of our keywords appear in exactly one title, so
 * inflating them amplifies pure noise. This curve leaves rare values at ~1
 * instead of boosting them, and only bites when a value approaches universal.
 */
const rarity: Record<FacetKind, Record<string, number>> = {
  story: {},
  genre: {},
  cast: {},
  director: {},
  era: {},
  language: {},
};
let rarityReady = false;

const RARITY_MIN = 0.08;

/**
 * Measure every value's rarity from the catalog. Called once after the
 * catalog loads; scoring falls back to uniform weights until then, so nothing
 * breaks if it never runs (the bundled sample set, or a test).
 */
export function buildRarityIndex(titles: Title[]): void {
  const n = titles.length;
  if (n === 0) return;

  const df: Record<FacetKind, Map<string, number>> = {
    story: new Map(),
    genre: new Map(),
    cast: new Map(),
    director: new Map(),
    era: new Map(),
    language: new Map(),
  };

  for (const title of titles) {
    const tokens = titleTokens(title);
    for (const kind of FACET_KINDS) {
      // a value counts once per title however often it appears in it
      for (const token of new Set(tokens[kind])) {
        df[kind].set(token, (df[kind].get(token) ?? 0) + 1);
      }
    }
  }

  for (const kind of FACET_KINDS) {
    const table: Record<string, number> = {};
    for (const [token, count] of df[kind]) {
      table[token] = Math.max(RARITY_MIN, 1 - count / n);
    }
    rarity[kind] = table;
  }
  rarityReady = true;
}

/** unknown values are treated as averagely informative */
function rarityOf(kind: FacetKind, token: string): number {
  if (!rarityReady) return 1;
  return rarity[kind][token] ?? 1;
}

/* ── reading the tables ───────────────────────────────────────────────── */

/**
 * How much of a rejection a value is actually to blame for.
 *
 * A user logged two hundred swipes and the deck's hit rate fell 37, 12, 17, 5
 * per fifty. Measured, the cause was not the pool running dry — 110 titles the
 * engine itself rated as his were still inside the gate, and 220 more had never
 * been shown. It was this table forgetting: `comedy` fell from an affinity of
 * 0.36 to 0.13 over 150 swipes *while he was liking comedies the whole time*.
 * The net evidence held at 7-11; the observation mass grew 25 → 55 and drowned
 * it.
 *
 * The reason is credit assignment. Shown a comedy that is not his kind, he
 * swipes left, and every value on that card takes the full -1 — including the
 * one that is the reason he is here. He rejected it *despite* being a comedy,
 * not *because* of it.
 *
 * Charging it symmetrically is not merely unkind, it is statistically wrong,
 * and the reason is the deck itself: we do not show a random sample. We show
 * mostly comedies, so nearly every rejection he can possibly make is a comedy.
 * Under that exposure, a run of rejected comedies does not mean the genre is
 * uninformative — it means the genre is necessary and not sufficient, and the
 * discrimination lives in the narrower values. The negatives carry almost no
 * information about the value we over-showed, and the tables were reading them
 * as if they carried all of it.
 *
 * So a rejection's weight on a value shrinks with how much that value has
 * already been endorsed. Nothing about *writing* changes — the stored counters
 * stay exact and undo stays exact — only how they are read.
 *
 * NOT the "best value outweighs worst" experiment rejected twice: that damped
 * values against each other when scoring a title, and left the tables to rot.
 * This is about who a rejection is charged to in the first place.
 *
 * TRIED, AND IT CHANGED NOTHING. The fix was built and swept: positive and
 * negative evidence are both recoverable from the stored pair — mass is the sum
 * of magnitudes and net their sum, so positive = (mass + net) / 2 — and a
 * rejection's weight was shrunk by how much the value had already been
 * endorsed, at read time so that undo stayed exact. Across the 200-swipe ruler,
 * at half-lives of 3, 6 and 12:
 *
 *     off          30 21 18 15  ·  32 24 24 13
 *     half-life 6  29 20 18 14  ·  31 23 20 14
 *
 * Nothing. The likely reason is that `updateFacetWeights` already routes around
 * a facet that has stopped predicting: as `comedy` decays, genre's *importance*
 * decays with it and the narrower facets carry the ranking. The affinity
 * collapse is real and measured, and it is not what the deck's decline is made
 * of.
 *
 * Freezing the fame gate was measured in the same pass, on the theory that the
 * pool was being diluted faster than the taste inside it grew — the gate does
 * widen from 1,165 to 1,915 across the session while the reachable taste falls
 * 149 to 110. At 0, 2 and 5 titles earned per rated card: 30 21 20 12 · 30 21
 * 18 15. Also nothing.
 */

/** A token's learned affinity in roughly [-1, 1], shrunk toward 0 when thin */
function tokenWeight(table: FacetTable, kind: FacetKind, token: string): number {
  const entry = table[token];
  if (!entry) return 0;
  return (entry[0] / (entry[1] + TOKEN_K)) * rarityOf(kind, token);
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
      sum += tokenWeight(table, kind, token);
    }

    /**
     * TRIED AND REJECTED: letting a title's best value outweigh its worst.
     *
     * A viewer who loves horror and rejects everything else teaches the tables
     * that drama, science fiction and comedy are all bad, and the horror left
     * in the pool is mostly hybrid — Interview with the Vampire is
     * horror/drama, Alien3 is horror/scifi. Summed, a strong horror score plus
     * a punished co-genre can go negative, which looked like an obvious cause
     * of a taste fading late in a session.
     *
     * Two forms were measured: damping every non-best value, and damping only
     * the negative ones when a positive is present. Neither moved anything —
     * the deck ranking, 500 real libraries, and both simulated sessions were
     * identical to four decimal places of usefulness.
     *
     * Tried a second time with a sharper instrument, because the reasoning
     * above still looked sound: the session ruler now measures how far the
     * deck lifts a viewer's genre above what the pool offers, which the
     * earlier share-based version could not separate from the catalog running
     * dry. It made things clearly worse. A horror viewer's lift across the
     * session, last third against first:
     *
     *     full negative evidence (shipped)   123%
     *     half the worst value damped         71%
     *     worst value ignored entirely        53%
     *
     * Damping the negative lets in hybrids whose other half the viewer has
     * rejected a hundred times, and those crowd out the titles that are
     * actually theirs. The measured cause of the horror running out was the
     * catalog: 45 horror titles inside the recognisable pool against 169
     * comedies, and a 150-swipe session consumes them.
     */
    const raw = Math.tanh(sum / Math.sqrt(list.length));
    perKind[kind] = raw;
    weighted += weights[kind] * raw;
    weightSum += weights[kind];
  }

  return { total: weightSum > 0 ? weighted / weightSum : 0, perKind };
}

/* ── writing the tables ───────────────────────────────────────────────── */

/**
 * How much of a skip's evidence each facet is allowed to keep.
 *
 * The second half of the bug that benching was the first half of. Removing
 * `genre` from the streak detector stopped the deck from *banning* a viewer's
 * own taste, but every swipe-up still wrote -0.35 against every genre on the
 * card. Thirty honest "never heard of it" answers on obscure comedies
 * therefore outweighed ten comedy likes, and the taste faded out — measured,
 * comedies fell to 5 of the next 20 with no genre benched at all.
 *
 * The reasoning is the same as the streak fix, and applies with more force
 * here because it is graded rather than a one-off bench. A skip says "this
 * title is not famous enough for me to have seen it". Charging that to
 * `superhero` — a keyword one title in a hundred carries — singles out
 * something real after a few repetitions. Charging it to `comedy`, which a
 * fifth of the catalog carries, is charging it to the viewer's world.
 *
 * A genre is only learned from titles the viewer has actually watched: a
 * dislike still writes the full -1. Not seeing something is not an opinion
 * about its category.
 */
const SKIP_SCALE: Record<FacetKind, number> = {
  story: 1,
  genre:
    typeof process !== "undefined" && process.env?.SKIP_GENRE
      ? Number(process.env.SKIP_GENRE)
      : 0,
  cast: 1,
  director: 1,
  era: 1,
  language: 1,
};

/** the evidence one swipe writes, per facet */
export function facetSignals(action: SwipeAction): Record<FacetKind, number> {
  const base =
    action === "liked" ? LIKE_SIGNAL : action === "disliked" ? DISLIKE_SIGNAL : SKIP_SIGNAL;
  const out = {} as Record<FacetKind, number>;
  for (const kind of FACET_KINDS) {
    out[kind] = action === "not_seen" ? base * SKIP_SCALE[kind] : base;
  }
  return out;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Fold one swipe into the tables. Mutates a copy-on-write clone of each
 * touched facet so React/Zustand see a new object.
 */
export function applyFacets(
  tables: FacetTables,
  tokens: TitleTokens,
  signals: Record<FacetKind, number>
): FacetTables {
  const next = { ...tables };
  for (const kind of FACET_KINDS) {
    const list = tokens[kind];
    const signal = signals[kind];
    if (list.length === 0 || signal === 0) continue;
    const mass = Math.abs(signal);
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
  signals: Record<FacetKind, number>
): FacetTables {
  const next = { ...tables };
  for (const kind of FACET_KINDS) {
    const list = tokens[kind];
    const signal = signals[kind];
    if (list.length === 0 || signal === 0) continue;
    const mass = Math.abs(signal);
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

/**
 * Facets a skip streak may bench — narrow ones only, and deliberately not
 * `genre`.
 *
 * This included `genre` and it was the worst bug in the engine's history. A
 * swipe-up means "I have not seen this", which is a fact about how well known
 * that one title is, not an opinion about a category. But three unfamiliar
 * comedies in a row were read as "this viewer dislikes comedy", and comedy was
 * removed from the deck for the next forty cards.
 *
 * Measured over a simulated session, the viewer's own genre collapsed from 9
 * cards in 10 to 2, and for a horror viewer to 0 — with horror, thriller *and*
 * drama benched at once. A user described it before any instrument here did:
 * "the taste gradually starts disappearing and becomes scattered."
 *
 * The mechanism was built for a real complaint — thirty superhero films in a
 * row — and that complaint is about `superhero`, a keyword one title in a
 * hundred carries. Benching it costs the viewer nothing. Benching `action`
 * deletes a fifth of their world on three data points.
 *
 * `cast` stays: an actor is narrow, and "not this person again" is a real
 * thing to want.
 */
const STREAK_KINDS: FacetKind[] = ["story", "cast"];

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
      const strength = tokenWeight(table, kind, token) * weights[kind];
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
