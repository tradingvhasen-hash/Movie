"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getLocalItem } from "@/lib/catalog";
import { rank, warmRanker } from "@/lib/engine/rank-client";
import { STARTER_PACK } from "@/lib/data/starter-pack";
import { COLD_START_TARGET, isCalibrating } from "@/lib/engine/taste";
import { useDhawq } from "@/lib/store";
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

/** Local ranking is authoritative. The old /api/recommend path is intentionally
 * not called: its Supabase catalog is not seeded and it added a cold network
 * dependency without producing recommendations. */

/** local mode: run the engine over the bundled catalog */
/**
 * Titles that must never be dealt again, because the viewer has already
 * answered them. **Every** swipe counts, 👁 included.
 *
 * This used to hold `seen` back and re-deal it, on the theory that a grid
 * somewhere answered "have you watched it" without carrying a verdict, leaving
 * the deck owing that title a question. A `pendingVerdicts()` helper put every
 * such title at the *front* of each rebuild.
 *
 * That grid does not exist. `CalibrationGrid` downloads a file and never
 * touches the store; `TastePicker` writes `liked` plus `learnPasses`, which is
 * not a swipe at all. The only writers of `seen` are the deck's own 👁 button,
 * the Library log row and the Discover sheet — and all three are a person
 * deliberately saying "I watched this and felt nothing about it". That is a
 * verdict. It is the whole point of the button.
 *
 * So the helper had no legitimate source and exactly one real one: it fed the
 * deck's own answers straight back into the deck. The user reported it as
 * pressing 👁 on a few films and then being shown all of them again, every
 * time, forever — which is precisely what up to `BATCH` re-injected titles at
 * the head of every rebuild looks like from the outside.
 *
 * A title leaves the deck for good when it is answered. It returns only
 * through `undo`, or by being deleted from the library (`removeSwipe`).
 */
function answeredIds(): Set<string> {
  return new Set(Object.keys(useDhawq.getState().swipes));
}

/**
 * The next batch, ranked off the main thread.
 *
 * This used to run `recommend()` inline, and the comment below the `REFILL_AT`
 * constant records what that cost: 428ms of a completely frozen page on a
 * mid-range phone, and the honest admission that "the real answer is to get
 * this work off the main thread entirely, and that is a bigger change than a
 * broken app should wait for."
 *
 * The app was broken, and this is that change. The rebuild now happens on a
 * worker thread, so the freeze is not shortened — it is *gone*. Cards remain
 * swipeable, taps land and animations keep running for the whole time the
 * ranking takes, because none of it happens where the interface lives.
 *
 * That also retires the reason the reserve was made so deep. It is left deep
 * anyway: a request that costs nothing visible is still a request, and sixteen
 * cards of reserve means the worker is idle when the viewer is fast.
 */
async function computeLocalBatch(): Promise<Title[]> {
  const state = useDhawq.getState();
  const exclude = new Set<string>(Object.keys(state.swipes));

  const likedIds = Object.values(state.swipes)
    .filter((s) => s.action === "liked")
    .map((s) => s.titleId);
  const dislikedIds = Object.values(state.swipes)
    .filter((s) => s.action === "disliked")
    .map((s) => s.titleId);
  /**
   * The 👁 answers.
   *
   * The co-watch graph records who *watched* two titles, not who enjoyed them,
   * so a neutral answer seeds it exactly as well as a heart does. Before this
   * they seeded nothing: one real session marked 61 titles that way and every
   * one was invisible to the graph.
   */
  const seenIds = Object.values(state.swipes)
    .filter((s) => s.action === "seen")
    .map((s) => s.titleId);

  const { titles } = await rank({
    mode: "swipe",
    profile: state.profile,
    excludeIds: exclude,
    count: BATCH,
    seed: state.seed,
    likedIds,
    dislikedIds,
    seenIds,
    homeLanguages: homeLanguages(state.settings.locale),
    /**
     * The reach dial, read fresh on every batch.
     *
     * It has to travel with the request rather than being set once: the
     * ranking runs on a worker that cannot see the store, and the whole point
     * of making this a setting is that changing it takes effect on the next
     * card rather than on the next visit.
     */
    reach: state.settings.reach,
  });

  // Measurement/sentinel cards are deliberately not injected into the live
  // product. The previous implementation trained and synced their answers as
  // ordinary recommendation evidence, invalidating the independent sample it
  // claimed to collect. Research sampling belongs on a separate immutable
  // event path, not inside the user library/taste model.

  return titles;
}

/**
 * The languages this person reads, as primary subtags.
 *
 * Free, present before the first card, and the only signal available at zero
 * evidence about which of the catalog's 34 languages is worth opening.
 */
function homeLanguages(preference: "auto" | "ar" | "en"): string[] {
  const out: string[] = [];
  if (preference === "ar" || preference === "en") out.push(preference);
  if (typeof navigator === "undefined") return out;
  const raw = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of raw ?? []) {
    const base = String(tag).toLowerCase().split("-")[0];
    if (base && !out.includes(base)) out.push(base);
  }
  return out.slice(0, 3);
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
  /** true once an authoritative full-catalog ranking has come back */
  const [filled, setFilled] = useState(false);
  const hydratedRef = useRef(false);
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
      /**
       * A completed rank request may mark the deck filled. The server ranks
       * the full catalog; the worker fallback loads the same catalog before it
       * answers, so either successful path is authoritative.
       */
      if (hydratedRef.current) setFilled(true);
    };

    /**
     * THE LOCAL ANSWER FIRST, ALWAYS. The cloud one is an upgrade, not a gate.
     *
     * This used to `await` the round trip to `/api/recommend` before installing
     * anything, so on the deployed site — where Supabase *is* configured — the
     * very first deck waited on a network request to a server that answers
     * `200 {items: []}` because its catalog was never seeded. On a cold
     * instance that is seconds of skeleton before the first card, every visit,
     * to learn nothing. It is a large part of what the user described as the
     * whole site being slow.
     *
     * Ranking locally costs nothing visible now that it happens on a worker,
     * so it simply runs, and a cloud batch installs over the top of it if one
     * ever actually arrives.
     */
    /**
     * A REAL CARD BEFORE ANYTHING IS RANKED OR FETCHED.
     *
     * Everything below this is asynchronous: `computeLocalBatch` goes through
     * the worker, and the worker is handed the catalog and *awaited* before the
     * first ranking — deliberately, because the version that did not await it
     * lost the race and fetched its own copy, doubling a 13.8 MB download and
     * breaking a real phone. So the first ranked batch cannot exist before
     * `catalog.json` has arrived and been decoded. On a slow connection that is
     * a long time to look at nothing.
     *
     * `STARTER_PACK` is 24 real titles with real posters, already in the
     * JavaScript bundle. They are dealt in the order the generator chose —
     * films and series interleaved, capped per language and per genre — with no
     * ranking at all, because ranking 24 titles nobody has taught anything
     * about would only reorder them by fame, which is the order they are
     * already in.
     *
     * It does not mark the deck `filled`: that flag means "a ranking against
     * the real catalog came back", and claiming it here would resurrect the
     * "Reset all cards" message appearing three seconds into a loading visit.
     * These cards are something to answer, not a statement that the deck is
     * complete.
     *
     * Answers given to them are ordinary answers — real catalog ids, real
     * verdicts — so nothing is thrown away when the full catalog takes over.
     */
    {
      const done = answeredIds();
      const opening = STARTER_PACK.filter((t) => !done.has(t.id));
      if (opening.length > 0 && queueRef.current.length === 0) {
        setQueue(opening);
        queueRef.current = opening;
      }
    }

    void computeLocalBatch().then(install);
  }, []);

  /** coalescing wrapper: many swipes in a row cost one rebuild */
  const refill = useCallback(() => {
    cancelPending.current?.();
    cancelPending.current = whenIdle(() => {
      cancelPending.current = null;
      rebuild();
    });
  }, [rebuild]);

  // The deck no longer waits for or preloads the 48k browser catalog.
  // Starter cards are available immediately; ranking prefers the server's full
  // catalog and only downloads catalog.json if that path fails/offline.
  useEffect(() => {
    warmRanker();
    hydratedRef.current = true;
    setHydrated(true);
    rebuild();
    return () => {
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
    filled,
    swipeTop,
    undo: undoWithRerank,
    canUndo,
    calibrating,
    calibrationProgress,
    swipeCount: Object.keys(swipes).length,
    refill: rebuild,
  };
}
