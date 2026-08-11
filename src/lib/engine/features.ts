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
