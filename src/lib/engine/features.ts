import type { Title } from "../types";

/**
 * Feature-hashing vectorizer: turns a title's metadata into a fixed-size
 * numeric vector capturing its themes (keywords), genre blend, creators,
 * era and language. Pure math — no external AI service. The same layout is
 * used by the seed script, the client engine and pgvector storage, so an
 * embedding upgrade later only needs to swap this file's output.
 *
 * Layout (total 384 dims):
 *   [0,   256) keyword hashing space  (weight 1.0)  — plot/theme "soul"
 *   [256, 288) genre hashing space    (weight 0.8)
 *   [288, 352) people hashing space   (weight 0.55) — director + top cast
 *   [352, 376) era/type block         (weight 0.3)
 *   [376, 384) original language      (weight 0.2)
 */
export const DIM = 384;

const KW_OFF = 0;
const KW_DIM = 256;
const GENRE_OFF = 256;
const GENRE_DIM = 32;
const PEOPLE_OFF = 288;
const PEOPLE_DIM = 64;
const ERA_OFF = 352;
const ERA_DIM = 24;
const LANG_OFF = 376;
const LANG_DIM = 8;

const W_KW = 1.0;
const W_GENRE = 0.8;
const W_PEOPLE = 0.55;
const W_ERA = 0.3;
const W_LANG = 0.2;

/** FNV-1a 32-bit hash */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Hash a token into [offset, offset+dim) with a ±1 sign to reduce collision bias */
function hashInto(vec: Float32Array, token: string, offset: number, dim: number, weight: number) {
  const h = fnv1a(token);
  const idx = offset + (h % dim);
  const sign = (h & 0x80000000) !== 0 ? -1 : 1;
  vec[idx] += sign * weight;
}

function normalizeBlock(vec: Float32Array, offset: number, dim: number, targetWeight: number) {
  let norm = 0;
  for (let i = offset; i < offset + dim; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return;
  const scale = targetWeight / norm;
  for (let i = offset; i < offset + dim; i++) vec[i] *= scale;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * @param idf optional keyword → idf weight map (built by the seed script over
 *   the full corpus). Without it, keywords get uniform weight — fine for the
 *   bundled sample catalog.
 */
export function featurize(title: Title, idf?: Record<string, number>): Float32Array {
  const v = new Float32Array(DIM);

  for (const kw of title.keywords) {
    const k = norm(kw);
    hashInto(v, `kw:${k}`, KW_OFF, KW_DIM, idf?.[k] ?? 1);
  }
  for (const g of title.genres) {
    hashInto(v, `g:${norm(g)}`, GENRE_OFF, GENRE_DIM, 1);
  }
  if (title.people.director) {
    hashInto(v, `dir:${norm(title.people.director)}`, PEOPLE_OFF, PEOPLE_DIM, 1.4);
  }
  for (const actor of title.people.cast.slice(0, 4)) {
    hashInto(v, `cast:${norm(actor)}`, PEOPLE_OFF, PEOPLE_DIM, 1);
  }
  const decade = Math.floor(title.year / 10) * 10;
  hashInto(v, `decade:${decade}`, ERA_OFF, ERA_DIM, 1);
  hashInto(v, `type:${title.type}`, ERA_OFF, ERA_DIM, 0.8);
  hashInto(v, `lang:${norm(title.originalLanguage)}`, LANG_OFF, LANG_DIM, 1);

  // Normalize each block to its target weight, then the whole vector to unit length
  normalizeBlock(v, KW_OFF, KW_DIM, W_KW);
  normalizeBlock(v, GENRE_OFF, GENRE_DIM, W_GENRE);
  normalizeBlock(v, PEOPLE_OFF, PEOPLE_DIM, W_PEOPLE);
  normalizeBlock(v, ERA_OFF, ERA_DIM, W_ERA);
  normalizeBlock(v, LANG_OFF, LANG_DIM, W_LANG);

  let n = 0;
  for (let i = 0; i < DIM; i++) n += v[i] * v[i];
  n = Math.sqrt(n);
  if (n > 0) for (let i = 0; i < DIM; i++) v[i] /= n;
  return v;
}

export function cosine(a: Float32Array | number[], b: Float32Array | number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < DIM; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    na += (a[i] ?? 0) * (a[i] ?? 0);
    nb += (b[i] ?? 0) * (b[i] ?? 0);
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Bayesian-smoothed quality prior in [0,1] (IMDb-style weighted rating) */
export function qualityPrior(rating: number, voteCount: number, meanRating = 6.8, m = 500): number {
  const wr = (voteCount / (voteCount + m)) * rating + (m / (voteCount + m)) * meanRating;
  return Math.max(0, Math.min(1, (wr - 4) / 5.5));
}

/**
 * How likely an average person is to have heard of a title, in [0,1].
 * Vote count is the best available proxy: unlike TMDB "popularity" it
 * accumulates over a title's whole life rather than spiking on release.
 * Log-scaled because the difference between 200 and 2,000 ratings matters
 * far more than between 30,000 and 40,000.
 */
/**
 * The prior for "has this person seen it", best available per title.
 *
 * `reach` is a language model's estimate of how many people in a title's own
 * audience actually watched it, computed once offline. It replaces the vote
 * count because the vote count was measured against a real viewer's 526
 * answers at **AUC 0.500** — a coin flip — while reach scored 0.639 on the
 * same sample, and because a TMDB vote count structurally cannot see an
 * Egyptian film that fifty million people watched.
 *
 * The vote count remains the fallback for the 946 titles the run did not
 * reach. Those skew Malayalam, Tamil and Arabic, which is the worst place for
 * a gap and is recorded as such rather than smoothed over.
 */
export function reachPrior(title: { reach?: number; voteCount: number }): number {
  const fame = recognizability(title.voteCount);
  const r = title.reach;
  if (r === undefined || REACH_WEIGHT <= 0) return fame;
  const mapped = REACH_SCALE_A + REACH_SCALE_B * Math.pow(r, REACH_GAMMA);
  return fame * (1 - REACH_WEIGHT) + mapped * REACH_WEIGHT;
}

/**
 * Reach is on its own scale and has to be put on this one.
 *
 * Shipped raw first, and it cost 40% of the real-label ruler (88.0 → 52.5) —
 * not because the ordering was worse, which is what AUC measured and what
 * improved, but because the *distribution* is completely different:
 *
 *     percentile        recognizability        reach
 *     median                      0.583        0.140
 *     90th                        0.795        0.380
 *     mean                        0.575        0.178
 *
 * The score computes `wRecognition * known` with `wRecognition` near 0.9, so
 * substituting a term that averages 0.178 for one that averages 0.575 silently
 * divides the entire recognition weight by three and hands the ranking to the
 * taste and quality terms. Every constant around it was tuned against the old
 * spread.
 *
 * These three numbers map reach's range onto recognizability's without
 * touching its ordering — a power curve fitted so the median, the 90th and the
 * mean land where the old prior's did. What ships is the model's *ranking*,
 * which is the part that was measured better; nothing about the balance of the
 * score changes, which is the part that was never in question.
 */
/**
 * MEASURED, AND IT DOES NOT SURVIVE CONTACT WITH THE ENGINE. Default 0.
 *
 * In isolation the model's reach estimate is clearly the better prior. On one
 * viewer's 526 real labels, predicting the held-out half:
 *
 *     global vote count        AUC 0.500
 *     the model, per title         0.639
 *
 * End to end it buys nothing. Blended at every weight, and placed both in the
 * score and in the gate's ordering:
 *
 *     weight        0      0.25    0.35     0.5       1
 *     harvest   243.1     240.7   241.8   237.6     229.7
 *     his labels 87.6      89.4    92.3    84.5      62.9
 *
 * The two rulers disagree in opposite directions and both movements sit inside
 * their own noise, except at full replacement where it is catastrophic.
 * Ordering the gate by reach instead of votes changed harvest by nothing at
 * all.
 *
 * The likely reason, and it is worth remembering: `recognizability` is not
 * only an exposure prior here. The gate ranks by vote count, the tier ledger
 * counts against it, the quality prior correlates with it, and every constant
 * around it was fitted with it in place. The AUC test isolated one of its jobs
 * and improved that one; the engine uses it for four.
 *
 * The data is bought and kept in `.cache/reach.json`, the loader is
 * best-effort, and `REACH=0.35 npm run replay` re-measures it in one command.
 * It is not shipped to the browser, because 55 KB for a term weighted zero is
 * 55 KB wasted.
 */
const REACH_WEIGHT =
  typeof process !== "undefined" && process.env?.REACH
    ? Number(process.env.REACH)
    : 0;
const REACH_GAMMA = 0.38;
const REACH_SCALE_A = 0.0;
const REACH_SCALE_B = 1.16;

export function recognizability(voteCount: number): number {
  const MAX_LOG = Math.log10(40000);
  return Math.max(0, Math.min(1, Math.log10(1 + voteCount) / MAX_LOG));
}
