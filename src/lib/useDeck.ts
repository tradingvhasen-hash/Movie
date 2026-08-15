"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getLocalCatalog, getLocalItem, loadCatalog, vectorOf } from "@/lib/catalog";
import { recommend } from "@/lib/engine/recommend";
import { COLD_START_TARGET, isCalibrating } from "@/lib/engine/taste";
import { useDhawq } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { SwipeAction, Title } from "@/lib/types";

/** cards kept queued ahead of the user */
const QUEUE_AHEAD = 6;
const BATCH = 10;

/** cloud mode: fetch the next batch from the seeded TMDB catalog */
async function fetchRemoteBatch(count: number): Promise<Title[] | null> {
  const state = useDhawq.getState();
  const exclude = Object.keys(state.swipes);
  const likedIds = Object.values(state.swipes)
    .filter((s) => s.action === "liked")
    .map((s) => s.titleId);
  try {
    const res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: state.profile,
        exclude,
        likedIds,
        count,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { items: { title: Title }[] };
    return data.items.map((i) => i.title);
  } catch {
    return null;
  }
}

/** local mode: run the engine over the bundled catalog */
/**
 * Titles the grid harvested but nobody has an opinion on yet.
 *
 * The grid answers "have you watched it" and deliberately stops there — thirty
 * taps cannot carry thirty verdicts. So a viewer who marks five hundred titles
 * has a library the site knows they watched and knows nothing about, and until
 * now the deck could never ask, because it excludes everything already swiped.
 * The two surfaces were harvesting into a bucket with no tap on it.
 *
 * These come first, and they are the best cards the deck will ever have: the
 * viewer has already told us they saw them, so the hit rate is 100% and every
 * answer is pure taste evidence. It is also the cheapest verdict available —
 * no recognition guessing, no gate, no wasted swipe.
 */
function pendingVerdicts(exclude: Set<string>): Title[] {
  const state = useDhawq.getState();
  const out: Title[] = [];
  for (const sw of Object.values(state.swipes)) {
    if (sw.action !== "seen" || exclude.has(sw.titleId)) continue;
    const title = sw.title ?? getLocalItem(sw.titleId)?.title;
    if (title) out.push(title);
  }
  // newest first: what you tapped a minute ago is easier to have an opinion on
  return out.reverse();
}

function computeLocalBatch(excludeExtra: string[] = []): Title[] {
  const pool = getLocalCatalog();
  const state = useDhawq.getState();
  const exclude = new Set<string>([...Object.keys(state.swipes), ...excludeExtra]);

  const likedTitles = Object.values(state.swipes)
    .filter((s) => s.action === "liked")
    .map((s) => s.title ?? getLocalItem(s.titleId)?.title)
    .filter((t): t is Title => Boolean(t));

  const pending = pendingVerdicts(new Set(excludeExtra)).slice(0, BATCH);
  if (pending.length >= BATCH) return pending;

  const rest = recommend(pool, state.profile, {
    excludeIds: exclude,
    count: BATCH - pending.length,
    seed: state.seed,
    vectorFor: vectorOf,
    likedTitles,
  }).map((r) => r.title);
  return [...pending, ...rest];
}

/** run work when the browser is idle, with a short deadline as a fallback */
function whenIdle(fn: () => void): () => void {
  if (typeof window === "undefined") {
    fn();
    return () => {};
  }
  const ric = window.requestIdleCallback;
  if (typeof ric === "function") {
    const id = ric(() => fn(), { timeout: 120 });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 32);
  return () => window.clearTimeout(id);
}

/**
 * The swipe queue.
 *
 * The queue is rebuilt from the current fingerprint after every swipe — a
 * batch computed ten swipes ago is exactly what makes the deck feel like it
 * isn't listening. That rebuild used to run synchronously inside the swipe
 * handler; it now runs on an idle callback and consecutive swipes collapse
 * into a single rebuild, so flicking through cards never waits on it.
 */
export function useDeck() {
  const swipes = useDhawq((s) => s.swipes);
  const profile = useDhawq((s) => s.profile);
  const doSwipe = useDhawq((s) => s.swipe);
  const doUndo = useDhawq((s) => s.undo);

  const [queue, setQueue] = useState<Title[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const queueRef = useRef<Title[]>([]);
  queueRef.current = queue;
  const cancelPending = useRef<(() => void) | null>(null);

  const calibrating = isCalibrating(profile);
  const ratedSwipes = profile.ratedSwipes;

  /**
   * Rebuild the upcoming cards from the current fingerprint. The card on
   * screen is preserved so it never swaps out from under the user's finger.
   */
  const rebuild = useCallback(() => {
    const keepTop = queueRef.current.slice(0, 1);
    const keepIds = keepTop.map((t) => t.id);

    const install = (fresh: Title[]) => {
      const next = [...keepTop, ...fresh.filter((f) => !keepIds.includes(f.id))];
      setQueue(next.slice(0, QUEUE_AHEAD + 1));
    };

    if (isSupabaseConfigured()) {
      void fetchRemoteBatch(BATCH).then((remote) => {
        install(remote && remote.length > 0 ? remote : computeLocalBatch(keepIds));
      });
      return;
    }
    install(computeLocalBatch(keepIds));
  }, []);

  /** coalescing wrapper: many swipes in a row cost one rebuild */
  const refill = useCallback(() => {
    cancelPending.current?.();
    cancelPending.current = whenIdle(() => {
      cancelPending.current = null;
      rebuild();
    });
  }, [rebuild]);

  // wait for the catalog fetch and the persisted store before the first fill
  useEffect(() => {
    let cancelled = false;
    void loadCatalog().then(() => {
      if (cancelled) return;
      setHydrated(true);
      rebuild();
    });
    return () => {
      cancelled = true;
      cancelPending.current?.();
    };
  }, [rebuild]);

  const swipeTop = useCallback(
    (action: SwipeAction) => {
      const top = queueRef.current[0];
      if (!top) return;
      doSwipe(top, action);
      // advance immediately — the next card is already queued, so the
      // re-rank behind it is invisible
      const rest = queueRef.current.slice(1);
      setQueue(rest);
      queueRef.current = rest;
      refill();
    },
    [doSwipe, refill]
  );

  const undo = useCallback(() => {
    const state = useDhawq.getState();
    const lastId = state.swipeOrder[state.swipeOrder.length - 1];
    const snapshot = lastId ? state.swipes[lastId]?.title : undefined;
    const restoredId = doUndo();
    if (!restoredId) return;
    const title = snapshot ?? getLocalItem(restoredId)?.title;
    if (title) setQueue((q) => [title, ...q.filter((t) => t.id !== restoredId)]);
  }, [doUndo]);

  const canUndo = useDhawq((s) => s.swipeOrder.length > 0);

  const calibrationProgress = useMemo(
    () => ({
      current: Math.min(ratedSwipes, COLD_START_TARGET),
      total: COLD_START_TARGET,
      done: !calibrating,
    }),
    [ratedSwipes, calibrating]
  );

  const undoWithRerank = useCallback(() => {
    undo();
    refill();
  }, [undo, refill]);

  return {
    queue,
    hydrated,
    swipeTop,
    undo: undoWithRerank,
    canUndo,
    calibrating,
    calibrationProgress,
    swipeCount: Object.keys(swipes).length,
    refill: rebuild,
  };
}
