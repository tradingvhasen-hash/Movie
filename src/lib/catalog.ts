import { SAMPLE_TITLES } from "@/lib/data/sample-titles";
import { decodeCatalog, type EncodedCatalog } from "@/lib/data/catalog-codec";
import { buildRarityIndex } from "@/lib/engine/facets";
import { featurize } from "@/lib/engine/features";
import type { CandidateItem } from "@/lib/engine/recommend";
import type { Title } from "@/lib/types";

/**
 * Catalog access.
 *
 * The full TMDB catalog ships as a static asset (public/catalog.json) and is
 * fetched once, then kept in memory.
 *
 * Feature vectors are neither shipped nor precomputed. Ranking runs on the
 * facet tables, which read a title's metadata directly; vectors are only
 * needed by the final diversity pass, for a few dozen titles at a time. So
 * they are built on first use and cached — building all ~5,500 up front cost
 * a visible pause on load and ~8 MB of memory to serve ~60 of them.
 *
 * The small bundled sample set is the fallback before the fetch resolves (and
 * if it ever fails), so the app is never empty.
 */
let items: CandidateItem[] | null = null;
let byId = new Map<string, CandidateItem>();
let loadPromise: Promise<CandidateItem[]> | null = null;

function build(titles: Title[]): CandidateItem[] {
  const built: CandidateItem[] = titles.map((title) => ({ title }));
  items = built;
  byId = new Map(built.map((c) => [c.title.id, c]));
  // how rare each keyword, genre, actor and language is can only be known
  // from the whole catalog, and scoring needs it to tell an informative
  // value from a near-universal one
  buildRarityIndex(titles);
  return built;
}

/** sample set — available synchronously, used until the catalog arrives */
function fallback(): CandidateItem[] {
  if (!items) build(SAMPLE_TITLES);
  return items!;
}

function assetUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${base}${path}`;
}

/**
 * Plot summaries, fetched after the deck is already on screen.
 *
 * They are a third of the download and are read in one place: the panel behind
 * the info button. Blocking the first card on 1.13 MB of prose nobody has
 * asked to read yet is the wrong trade, so they arrive behind it and are
 * patched into the titles in place — every consumer holds the same objects by
 * reference, so a card that is already rendered simply has its description the
 * next time the panel opens.
 */
async function attachOverviews(titles: Title[]): Promise<void> {
  try {
    const res = await fetch(assetUrl("/overviews.json"), { cache: "force-cache" });
    if (!res.ok) return;
    const map = (await res.json()) as Record<string, [string, string]>;
    for (const t of titles) {
      const o = map[t.id];
      if (o) t.overview = { en: o[0], ar: o[1] || o[0] };
    }
  } catch {
    /* a card without its description is still a card */
  }
}

/** Best-effort: the prior improves if it arrives, and nothing breaks if not. */
async function attachReach(titles: Title[]): Promise<void> {
  try {
    const res = await fetch(assetUrl("/reach.json"), { cache: "force-cache" });
    if (!res.ok) return;
    const reach = (await res.json()) as Record<string, number>;
    for (const t of titles) {
      const r = reach[t.id];
      if (typeof r === "number") t.reach = r;
    }
  } catch {
    /* the vote count remains the prior */
  }
}

/** Fetches and installs the full catalog. Safe to call repeatedly. */
export function loadCatalog(): Promise<CandidateItem[]> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const res = await fetch(assetUrl("/catalog.json"), { cache: "force-cache" });
      if (!res.ok) throw new Error(`catalog ${res.status}`);
      const data = (await res.json()) as EncodedCatalog;
      if (!data?.t?.length) throw new Error("empty catalog");
      const titles = decodeCatalog(data);

      /**
       * Reach rides alongside rather than inside the catalog: 55 KB gzipped
       * against the catalog's 3.3 MB, and a separate file means a failure to
       * fetch it costs the prior and nothing else — the engine falls back to
       * the vote count exactly as before. Not worth a schema change.
       */
      await attachReach(titles);
      const ready = build(titles);
      // deliberately not awaited: the deck does not need prose to deal a card
      void attachOverviews(titles);
      return ready;
    } catch {
      return fallback();
    }
  })();
  return loadPromise;
}

export function getLocalCatalog(): CandidateItem[] {
  return items ?? fallback();
}

export function getLocalItem(id: string): CandidateItem | undefined {
  getLocalCatalog();
  return byId.get(id);
}

export function getLocalTitle(id: string): Title | undefined {
  return getLocalItem(id)?.title;
}

/**
 * Vectors are a pure function of a title's metadata (same math on client,
 * server and build script), so any Title snapshot can be vectorized on demand.
 * Built lazily and memoised, both here and on the catalog entry itself.
 */
const vectorCache = new Map<string, Float32Array>();

export function vectorOf(title: Title): Float32Array {
  let v = vectorCache.get(title.id);
  if (!v) {
    const item = getLocalItem(title.id);
    v = item?.vector ?? featurize(title);
    if (item) item.vector = v;
    vectorCache.set(title.id, v);
  }
  return v;
}
