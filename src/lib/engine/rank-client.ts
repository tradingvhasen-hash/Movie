"use client";

/**
 * Talking to the ranking worker, with the main thread as the safety net.
 *
 * One worker for the whole app, created on first use and kept: starting one
 * costs a catalog fetch and a parse, and three screens want the same answer
 * from the same data. Requests are matched by an incrementing id, so a screen
 * that asks twice in quick succession — Discover while a swipe is still
 * settling, say — gets both answers to the right callers and can ignore the
 * stale one.
 *
 * THE FALLBACK IS NOT DECORATION. If `Worker` is missing, blocked by a policy,
 * or throws on construction, every call runs the identical `recommend()` on
 * the main thread and the app behaves exactly as it did before this file
 * existed — slowly, but correctly. A performance optimisation that can break
 * the product when it fails is not an optimisation.
 */
import { getLocalCatalog, getLocalItem, vectorOf } from "@/lib/catalog";
import { recommend } from "./recommend";
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
  homeLanguages?: string[];
  withReasons?: boolean;
}

export interface RankResult {
  titles: Title[];
  match: number[];
  reasons: string[][];
  becauseOf: (string | null)[];
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

/** warm the worker (and its catalog) before anybody is waiting on an answer */
export function warmRanker() {
  getWorker();
}

function runHere(q: RankQuery): RankResult {
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
    homeLanguages: q.homeLanguages,
    mode: q.mode,
  });
  return {
    titles: recs.map((r) => r.title),
    match: recs.map((r) => r.match),
    reasons: recs.map((r) => r.reasons.map((x) => x.label)),
    becauseOf: recs.map((r) => r.becauseOf ?? null),
  };
}

export function rank(q: RankQuery): Promise<RankResult> {
  const w = getWorker();
  if (!w) return Promise.resolve(runHere(q));

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
    homeLanguages: q.homeLanguages,
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
