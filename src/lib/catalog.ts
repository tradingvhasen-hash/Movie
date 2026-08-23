import { SAMPLE_TITLES } from "@/lib/data/sample-titles";
import { decodeCatalog, decodeRange, type EncodedCatalog } from "@/lib/data/catalog-codec";
import { buildRarityIndex, buildRarityIndexIdle } from "@/lib/engine/facets";
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
/**
 * Lean mode: everything a *ranker* needs and nothing a screen needs.
 *
 * The worker copy of the catalog is used only for scoring, so it skips the
 * 1.28 MB of plot summaries and the search index — neither is ever read on
 * that thread, and fetching them would double a download for nothing. The
 * summaries still come over the wire once, on the main thread, for the card
 * back that displays them.
 */
let lean = false;
export function setLeanMode() {
  lean = true;
}

let items: CandidateItem[] | null = null;
let byId = new Map<string, CandidateItem>();
let loadPromise: Promise<CandidateItem[]> | null = null;

function build(titles: Title[]): CandidateItem[] {
  const built: CandidateItem[] = titles.map((title) => ({ title }));
  items = built;
  byId = new Map(built.map((c) => [c.title.id, c]));

  /**
   * How rare each keyword, genre, actor and language is can only be known from
   * the whole catalog, and scoring needs it to tell an informative value from
   * a near-universal one.
   *
   * WHERE it is built matters as much as that it is. On the worker — lean
   * mode — it is built in one block, because that thread exists to rank and
   * has nothing else to do. On the main thread it is built in idle slices:
   * measured at 206ms here, it is ~1,234ms on the user's phone, and it used to
   * run synchronously the instant the catalog arrived, which is the instant
   * the welcome animation is playing. That single call was the stall he filmed
   * and described as one frame per second. See `buildRarityIndexIdle`.
   */
  if (lean || typeof window === "undefined") buildRarityIndex(titles);
  else buildRarityIndexIdle(titles);
  return built;
}

/** sample set — available synchronously, used until the catalog arrives */
function fallback(): CandidateItem[] {
  if (!items) build(SAMPLE_TITLES);
  return items!;
}

/**
 * Run something once the main thread has nothing better to do.
 *
 * The generous timeout is the point: this is for work that must happen, just
 * not during the opening seconds. If the browser never goes idle — a slow
 * phone under load, which is exactly the case being defended against — the
 * timeout fires it anyway, four seconds in, by which time the demo is over.
 */
function whenIdle(fn: () => void): void {
  if (typeof requestIdleCallback === "function") requestIdleCallback(() => fn(), { timeout: 4000 });
  else setTimeout(fn, 1200);
}

/**
 * Decode the catalog across several turns of the event loop.
 *
 * On the worker this is pointless — nothing else is running there — so only
 * the main thread pays for the bookkeeping. 2,000 rows is roughly 80ms on a
 * phone-speed CPU, small enough that an animation frame lands between slices.
 */
async function decodeSpread(data: EncodedCatalog): Promise<Title[]> {
  const n = data.t.length;
  const out: Title[] = [];
  for (let i = 0; i < n; i += 2000) {
    out.push(...decodeRange(data, i, Math.min(n, i + 2000)));
    if (i + 2000 < n) await new Promise<void>((r) => whenIdle(r));
  }
  return out;
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

/**
 * THE DEEP HALF OF THE CATALOG, FETCHED AFTER THE OPENING IS OVER.
 *
 * `catalog.json` holds the most-recognised titles and is the same size it has
 * always been, so the first card arrives exactly as fast as before. Everything
 * deeper lives in `catalog-tail.json` and lands here — measured at 437 bytes a
 * title, a 50,000-title catalog in one file would be 20.9 MB raw and ~9.9 MB
 * gzipped, against 2.74 MB for the catalog that shipped before. Quadrupling
 * the opening download would undo every loading fix made this week.
 *
 * Three things have to be redone once the tail is in, and all three are the
 * reason this waits for idle rather than racing the first card:
 *
 *   - the id map, or nothing new is findable
 *   - the rarity index, which is derived from the whole corpus
 *   - the search index, which was warmed over the core alone
 *
 * A failure here is silent by design. The core is a complete, working catalog;
 * a viewer whose tail request fails gets the product as it shipped last week
 * rather than an error.
 */
let tailLoaded = false;
async function attachTail(): Promise<void> {
  if (tailLoaded) return;
  tailLoaded = true;
  try {
    const res = await fetch(assetUrl("/catalog-tail.json"), { cache: "force-cache" });
    if (!res.ok) return;
    const data = (await res.json()) as EncodedCatalog;
    if (!data?.t?.length) return;
    const extra = await decodeSpread(data);
    if (extra.length === 0) return;

    const merged = [...(items ?? []).map((c) => c.title), ...extra];
    build(merged);
    /**
     * The worker takes the tail too, and skips only what a ranker never reads.
     *
     * Lean mode exists to keep plot summaries and the search index off the
     * worker thread. It must NOT keep the tail off: the worker is the thing
     * that ranks, so a worker holding only the core would make every new title
     * invisible to the deck and the whole expansion pointless.
     */
    if (!lean) {
      void attachOverviews(extra);
      void import("./search").then((m) => m.warmSearchIndex());
    }
  } catch {
    /* the core catalog is complete on its own */
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
      const titles = lean || typeof window === "undefined"
        ? decodeCatalog(data)
        : await decodeSpread(data);

      /**
       * The reach fetch used to be here, and it was a 404 on every page load.
       *
       * `reach` is bought audience-size data. It was measured against the
       * engine and changed harvest by nothing at all, so `REACH_WEIGHT` in
       * `features.ts` is 0 and the file is deliberately not shipped to the
       * browser — 55 KB for a term weighted zero. But the loader stayed, and
       * `await`ed, so every single visit made a request that could only fail
       * and *waited for the failure* before installing the catalog. A round
       * trip on the critical path of the opening, for a number multiplied by
       * zero.
       *
       * The experiments read `.cache/reach.json` from disk and are unaffected;
       * `REACH=0.35 npm run replay` still re-measures it in one command. If it
       * ever earns a non-zero weight, it gets shipped and loaded then.
       */
      const ready = build(titles);
      /**
       * The worker takes the tail straight away; the main thread waits.
       *
       * Nothing else runs on the worker, so there is no animation to protect
       * and no reason to defer — and until it lands, every title past the core
       * is invisible to ranking. On the main thread the same fetch waits for
       * idle, behind the first card.
       */
      if (lean) void attachTail();
      if (!lean) {
        /**
         * Everything below is wanted eventually and needed by nobody now, so
         * it waits for a moment when the main thread is free.
         *
         * "Not awaited" was not enough. `attachOverviews` fetches 3.3 MB and
         * calls `res.json()` on it — a single un-interruptible parse on the
         * main thread — and it used to start the instant the catalog landed,
         * which is while the welcome animation is playing and the ranking
         * worker is coming up. Prose for a panel nobody has opened does not
         * get to compete with the first thing the user ever sees.
         */
        whenIdle(() => {
          void attachTail();
          void attachOverviews(titles);
          /**
           * Prepare the search text while nothing else is happening.
           *
           * Dynamic so this module keeps no import cycle with `search.ts`,
           * which reads the catalog. See `warmSearchIndex` for why it exists
           * at all: it is the difference between a keystroke costing 2ms and
           * 457ms.
           */
          void import("./search").then((m) => m.warmSearchIndex());
        });
      }
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
