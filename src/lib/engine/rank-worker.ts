/// <reference lib="webworker" />

/**
 * THE RANKER, ON ITS OWN THREAD.
 *
 * The user's report was that the site froze on every swipe and ran "like one
 * frame per second". Measured on a phone-speed CPU, the single worst offender
 * was this:
 *
 *     opening Discover        1,261 ms of frozen main thread
 *     one deck rebuild          428 ms
 *
 * During those the page is not slow — it is *dead*. No swipe lands, no tap
 * registers, no animation advances, and the browser may show the "page is not
 * responding" prompt. Everything I could do to the rendering (and I did a lot
 * of it) is beside the point while a single function owns the only thread for
 * more than a second.
 *
 * The user's own instinct was right: "maybe instead of loading everything in
 * the browser, we load it in a page or a database." A worker is the browser's
 * version of that answer, and it is the correct one here — the work is pure
 * computation over a static catalog, with no DOM and no shared state, which is
 * exactly what a worker is for.
 *
 * WHAT LIVES HERE. Its own copy of the catalog, fetched from the same cached
 * static file (so it costs bandwidth once, not twice) and its own memo caches
 * — which is a bonus rather than a cost, since the ranker's per-candidate
 * caches now warm on a thread nobody is waiting on. Measured heap: about 20 MB
 * for the catalog, on a budget of hundreds.
 *
 * WHAT CROSSES THE WIRE. Ids and numbers, never titles. The main thread
 * already holds every title and can resolve an id in constant time, so a
 * request is a profile plus a few hundred ids and a reply is a few dozen ids —
 * kilobytes, structured-cloned in well under a millisecond.
 *
 * IT IS NEVER REQUIRED. `rank-client.ts` falls back to running the identical
 * function on the main thread if a worker cannot be created. A browser without
 * workers gets the old behaviour rather than no behaviour.
 */
import { getLocalItem, loadCatalog, setLeanMode, vectorOf } from "@/lib/catalog";
import { recommend } from "./recommend";
import type { TasteProfile } from "./taste";
import type { Title } from "@/lib/types";

export interface RankRequest {
  id: number;
  mode: "swipe" | "discover";
  profile: TasteProfile;
  excludeIds: string[];
  count: number;
  seed: number;
  likedIds: string[];
  dislikedIds: string[];
  homeLanguages?: string[];
  /** discover wants the numbers it displays; the deck only needs an order */
  withReasons?: boolean;
}

export interface RankReply {
  id: number;
  ids: string[];
  /** parallel to `ids`, only when asked for */
  match?: number[];
  reasons?: string[][];
  becauseOf?: (string | null)[];
  error?: string;
}

/** the worker never renders prose or search text; it only ranks */
setLeanMode();

let ready: Promise<unknown> | null = null;

function titlesFor(ids: string[]): Title[] {
  const out: Title[] = [];
  for (const id of ids) {
    const item = getLocalItem(id);
    if (item) out.push(item.title);
  }
  return out;
}

self.onmessage = async (event: MessageEvent<RankRequest>) => {
  const req = event.data;
  try {
    ready ??= loadCatalog();
    const pool = await ready;

    const recs = recommend(pool as Parameters<typeof recommend>[0], req.profile, {
      excludeIds: new Set(req.excludeIds),
      count: req.count,
      seed: req.seed,
      vectorFor: vectorOf,
      likedTitles: titlesFor(req.likedIds),
      dislikedTitles: titlesFor(req.dislikedIds),
      homeLanguages: req.homeLanguages,
      mode: req.mode,
    });

    const reply: RankReply = { id: req.id, ids: recs.map((r) => r.title.id) };
    if (req.withReasons) {
      reply.match = recs.map((r) => r.match);
      reply.reasons = recs.map((r) => r.reasons.map((x) => x.label));
      reply.becauseOf = recs.map((r) => r.becauseOf ?? null);
    }
    (self as unknown as Worker).postMessage(reply);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id: req.id,
      ids: [],
      error: String(err),
    } satisfies RankReply);
  }
};
