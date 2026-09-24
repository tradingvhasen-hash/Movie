"use client";

/**
 * Browser-worker ranking is the production path.
 *
 * The server-first experiment kept the entire 48k-title catalog plus ranking
 * indexes resident inside a 512 MB Render instance. Real traffic repeatedly
 * crashed the Node process ("Aborted (core dumped)"), so ranking belongs back
 * in the browser worker where it was already measured and stable.
 *
 * The worker receives the same versioned catalog and runs the same
 * recommendation engine. The main-thread path remains a correctness fallback
 * only when Worker is unavailable.
 */

import {
  getEncodedCatalog,
  getLocalCatalog,
  getLocalItem,
  loadCatalog,
  vectorOf,
} from "@/lib/catalog";
import type { RankReply, RankRequest } from "./rank-worker";
import type { TasteProfile } from "./taste";
import type { Title } from "@/lib/types";

export interface RankQuery {
  mode: "swipe" | "discover";
  profile: TasteProfile;
  excludeIds: Set<string> | string[];
  count: number;
  seed: number;
  likedIds: string[];
  dislikedIds: string[];
  /** titles answered 👁 — they join the likes as co-watch seeds */
  seenIds?: string[];
  homeLanguages?: string[];
  /** how deep into the catalog the viewer has asked the deck to reach */
  reach?: "narrow" | "medium" | "wide";
  withReasons?: boolean;
}

export interface RankResult {
  titles: Title[];
  match: number[];
  reasons: string[][];
  becauseOf: (string | null)[];
}

export interface GridRankQuery {
  profile: TasteProfile;
  excludeIds: Set<string> | string[];
  count: number;
  seed: number;
  watchedIds: string[];
  reach?: "narrow" | "medium" | "wide";
}

export async function rankWatchedGrid(q: GridRankQuery): Promise<Title[]> {
  await loadCatalog();
  const { watchedGrid } = await import("./recommend");
  const watched = q.watchedIds
    .map((id) => getLocalItem(id)?.title)
    .filter((title): title is Title => Boolean(title));
  return watchedGrid(getLocalCatalog(), q.profile, {
    excludeIds: q.excludeIds instanceof Set ? q.excludeIds : new Set(q.excludeIds),
    count: q.count,
    seed: q.seed,
    watched,
    reach: q.reach,
  });
}

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, (reply: RankReply) => void>();

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    workerBroken = true;
    return null;
  }
  try {
    worker = new Worker(new URL("./rank-worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e: MessageEvent<RankReply>) => {
      const resolve = pending.get(e.data.id);
      if (resolve) {
        pending.delete(e.data.id);
        resolve(e.data);
      }
    };
    worker.onerror = () => {
      // whatever is in flight will time out into the fallback below
      workerBroken = true;
      worker?.terminate();
      worker = null;
      for (const [id, resolve] of pending) resolve({ id, ids: [], error: "worker" });
      pending.clear();
    };
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

/** prepare the fallback worker; it does not load the catalog until needed */
export function warmRanker() {
  getWorker();
}

/**
 * THE SAFETY NET IS NOT LOADED UNTIL IT IS NEEDED.
 *
 * `recommend.ts` is 2,154 lines and this file used to import it at the top —
 * so the entire ranking engine was registered and evaluated on the main
 * thread, on the first screen, as part of the 434ms the module runtime spends
 * starting the app. For a code path that runs only if the browser has no
 * `Worker`, or the worker throws, or a profile will not structured-clone.
 *
 * A dynamic import moves it off the opening entirely and changes nothing about
 * the guarantee: `rank()` already returns a promise, so awaiting the module is
 * invisible to every caller, and the fallback still produces the identical
 * answer from the identical code. The worker, which is where this actually
 * runs, imports it directly on its own thread as it always did.
 */
async function runHere(q: RankQuery): Promise<RankResult> {
  const { recommend } = await import("./recommend");
  const titlesFor = (ids: string[]) => {
    const out: Title[] = [];
    for (const id of ids) {
      const item = getLocalItem(id);
      if (item) out.push(item.title);
    }
    return out;
  };
  const recs = recommend(getLocalCatalog(), q.profile, {
    excludeIds: q.excludeIds instanceof Set ? q.excludeIds : new Set(q.excludeIds),
    count: q.count,
    seed: q.seed,
    vectorFor: vectorOf,
    likedTitles: titlesFor(q.likedIds),
    dislikedTitles: titlesFor(q.dislikedIds),
    seenTitles: titlesFor(q.seenIds ?? []),
    homeLanguages: q.homeLanguages,
    mode: q.mode,
    reach: q.reach,
  });
  return {
    titles: recs.map((r) => r.title),
    match: recs.map((r) => r.match),
    reasons: recs.map((r) => r.reasons.map((x) => x.label)),
    becauseOf: recs.map((r) => r.becauseOf ?? null),
  };
}

/**
 * Offline/failure path: hand the worker the one browser catalog copy once,
 * avoiding a second fetch between the main thread and worker.
 */
let handoff: Promise<void> | null = null;
function sendCatalog(w: Worker): Promise<void> {
  handoff ??= loadCatalog()
    .then(() => {
      const data = getEncodedCatalog();
      if (data) w.postMessage({ kind: "catalog", data });
    })
    .catch(() => {
      /* the worker falls back to fetching its own copy */
    });
  return handoff;
}

export async function rank(q: RankQuery): Promise<RankResult> {
  const w = getWorker();
  if (!w) {
    await loadCatalog();
    return runHere(q);
  }

  await sendCatalog(w);
  return rankViaWorker(w, q);
}

function rankViaWorker(w: Worker, q: RankQuery): Promise<RankResult> {

  const id = nextId++;
  const req: RankRequest = {
    id,
    mode: q.mode,
    profile: q.profile,
    excludeIds: [...q.excludeIds],
    count: q.count,
    seed: q.seed,
    likedIds: q.likedIds,
    dislikedIds: q.dislikedIds,
    seenIds: q.seenIds,
    homeLanguages: q.homeLanguages,
    reach: q.reach,
    withReasons: q.withReasons,
  };

  return new Promise<RankResult>((resolve) => {
    /**
     * A worker that never answers must not leave a screen empty forever.
     *
     * Ten seconds is far longer than the work takes even on a slow phone, so
     * this only fires when something is genuinely wrong — and when it does,
     * the answer still arrives, computed here.
     */
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      resolve(runHere(q));
    }, 10000);

    pending.set(id, (reply) => {
      clearTimeout(timer);
      if (reply.error) {
        resolve(runHere(q));
        return;
      }
      const titles: Title[] = [];
      const match: number[] = [];
      const reasons: string[][] = [];
      const becauseOf: (string | null)[] = [];
      reply.ids.forEach((tid, i) => {
        const item = getLocalItem(tid);
        if (!item) return;
        titles.push(item.title);
        match.push(reply.match?.[i] ?? 0);
        reasons.push(reply.reasons?.[i] ?? []);
        becauseOf.push(reply.becauseOf?.[i] ?? null);
      });
      resolve({ titles, match, reasons, becauseOf });
    });

    try {
      w.postMessage(req);
    } catch {
      // a profile that cannot be structured-cloned: run it here instead
      clearTimeout(timer);
      pending.delete(id);
      resolve(runHere(q));
    }
  });
}
