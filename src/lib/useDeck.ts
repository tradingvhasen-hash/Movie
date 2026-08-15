"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getLocalCatalog, getLocalItem, loadCatalog, vectorOf } from "@/lib/catalog";
import { recommend } from "@/lib/engine/recommend";
import { COLD_START_TARGET, isCalibrating } from "@/lib/engine/taste";
import { useDhawq } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { SwipeAction, Title } from "@/lib/types";

/** cards rendered as a stack; more than three are never visible */
const QUEUE_AHEAD = 6;
/**
 * How many cards a rebuild produces, and how deep a reserve is kept.
 *
 * A rebuild is one indivisible block of main-thread work — it cannot be
 * interrupted, so its *cost* is fixed and the only thing under our control is
 * how often it happens. Deeper reserve, fewer rebuilds.
 */
const BATCH = 26;
const RESERVE = 24;
/**
 * Rebuild only when the queue has run down this far.
 *
 * It used to rebuild after **every** swipe, on the reasoning that a batch
 * computed ten swipes ago is what makes a deck feel like it is not listening.
 * That reasoning was sound and the cost was 12ms, on a catalog of 5,555 titles
 * and a desktop.
 *
 * The catalog is now 12,826 and the device is a phone. Measured with the CPU
 * throttled the way a mid-range handset actually behaves, one rebuild blocks
 * the main thread for:
 *
 *     1x (this machine)     49 ms
 *     4x slower            247 ms
 *     6x slower            428 ms
 *
 * The page is *frozen* for that entire time — no swipe registers, no tap, no
 * flip, no animation. Running it after every swipe means a viewer swiping at
 * one card a second spends a third of their session touching a dead screen,
 * which is exactly what the user filmed: cards stuck for seconds while he
 * swiped at them, and cards that would not flip when tapped.
 *
 * So the reserve is deep and the refill is lazy: 24 cards held, rebuilt when 8
 * remain, which is one rebuild per sixteen swipes instead of one per swipe.
 * The freeze still costs what it costs — it just stops landing on every
 * gesture, and a single hiccup every sixteen cards is a different product from
 * one after every card.
 *
 * The price is staleness: a card can now be up to sixteen swipes old, and the
 * original comment above was right that this is what makes a deck feel deaf.
 * It is the better trade by a wide margin — a viewer cannot notice ordering
 * that is slightly behind, and cannot fail to notice a screen that ignores
 * them. The real answer is to get this work off the main thread entirely, and
 * that is a bigger change than a broken app should wait for.
 */
const REFILL_AT = 8;

/**
 * Set once the cloud endpoint has failed, and never retried.
 *
 * It answers 503 whenever the Supabase catalog is not seeded, and the client
 * cannot tell that from a network blip — so it asked again on every rebuild,
 * paying a full round trip to learn the same thing. One failure is enough:
 * the bundled catalog is larger than the seeded one anyway.
 */
let remoteOffline = false;

/** cloud mode: fetch the next batch from the seeded TMDB catalog */
async function fetchRemoteBatch(count: number): Promise<Title[] | null> {
  if (remoteOffline) return null;
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
    if (!res.ok) {
      remoteOffline = true;
      return null;
    }
    const data = (await res.json()) as { items: { title: Title }[] };
    return data.items.map((i) => i.title);
  } catch {
    remoteOffline = true;
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

/**
 * Titles that must never be dealt again, because the viewer has already told
 * us what they think of them.
 *
 * A grid tap (`seen`) is deliberately *not* in here: it says "I watched it"
 * and nothing more, so the deck still owes that title a verdict.
 */
function answeredIds(): Set<string> {
  const out = new Set<string>();
  for (const [id, sw] of Object.entries(useDhawq.getState().swipes)) {
    if (sw.action !== "seen") out.add(id);
  }
  return out;
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
    /**
     * The head is read *here*, at install time, and never captured earlier.
     *
     * This is the bug the user filmed and I twice failed to find: cards that
     * came back after being swiped away, and two posters drawn on top of each
     * other. When Supabase is configured — which it is on the live site — a
     * rebuild is not synchronous. It posts to `/api/recommend` and installs
     * whatever comes back, which on mobile data is a few hundred milliseconds
     * later. The old code captured the top card *before* that round trip and
     * put it back at the front of the queue afterwards, by which time the
     * viewer had usually answered it and moved on two cards.
     *
     * So the deck re-dealt a card the viewer had just judged, `AnimatePresence`
     * saw a key it was still animating out, and both copies were drawn at once.
     * Every symptom in the recording follows from those two lines.
     *
     * Measured on a production build, throttled to a phone and 400ms of
     * latency: 8 of 40 swiped titles came back. Nine of 167 samples showed an
     * already-answered card on top.
     */
    const install = (fresh: Title[]) => {
      const done = answeredIds();
      const next = queueRef.current.filter((t) => !done.has(t.id)).slice(0, 1);
      const taken = new Set(next.map((t) => t.id));
      for (const t of fresh) {
        if (done.has(t.id) || taken.has(t.id)) continue;
        taken.add(t.id);
        next.push(t);
        if (next.length >= RESERVE) break;
      }
      setQueue(next);
      queueRef.current = next;
    };

    if (isSupabaseConfigured()) {
      void fetchRemoteBatch(BATCH).then((remote) => {
        install(remote && remote.length > 0 ? remote : computeLocalBatch());
      });
      return;
    }
    install(computeLocalBatch());
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

  /**
   * Answers the card that is on top *now* and returns it, so the caller never
   * has to work out which card it just answered. The deck used to read
   * `queue[0]` from its own render closure for the fly-off copy while this
   * read `queueRef`, and two swipes inside one React batch made the two
   * disagree — the animation showed one film leaving while a different one
   * was recorded.
   */
  const swipeTop = useCallback(
    (action: SwipeAction): Title | null => {
      const top = queueRef.current[0];
      if (!top) return null;
      doSwipe(top, action);
      // advance immediately — the next card is already queued, so the
      // re-rank behind it is invisible
      const rest = queueRef.current.slice(1);
      setQueue(rest);
      queueRef.current = rest;
      // only when we are running out, because a rebuild freezes the phone
      if (rest.length <= REFILL_AT) refill();
      return top;
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
