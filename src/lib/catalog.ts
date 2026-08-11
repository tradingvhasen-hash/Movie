import { SAMPLE_TITLES } from "@/lib/data/sample-titles";
import { featurize } from "@/lib/engine/features";
import type { CandidateItem } from "@/lib/engine/recommend";
import type { Title } from "@/lib/types";

/**
 * Catalog access. In local/demo mode this is the bundled sample set with
 * vectors computed on first use. Once Supabase is seeded, the swipe deck and
 * discover pages transparently pull the full TMDB catalog instead (see
 * lib/supabase/catalog-remote.ts).
 */
let cached: CandidateItem[] | null = null;
let byId: Map<string, CandidateItem> | null = null;

export function getLocalCatalog(): CandidateItem[] {
  if (!cached) {
    cached = SAMPLE_TITLES.map((title) => ({ title, vector: featurize(title) }));
    byId = new Map(cached.map((c) => [c.title.id, c]));
  }
  return cached;
}

export function getLocalItem(id: string): CandidateItem | undefined {
  getLocalCatalog();
  return byId!.get(id);
}

export function getLocalTitle(id: string): Title | undefined {
  return getLocalItem(id)?.title;
}

/**
 * Vectors are a pure function of a title's metadata (same math on client,
 * server and seed script), so any Title snapshot can be vectorized on demand.
 */
const vectorCache = new Map<string, Float32Array>();

export function vectorOf(title: Title): Float32Array {
  let v = vectorCache.get(title.id);
  if (!v) {
    v = getLocalItem(title.id)?.vector ?? featurize(title);
    vectorCache.set(title.id, v);
  }
  return v;
}
