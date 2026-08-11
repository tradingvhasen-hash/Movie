"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getLocalCatalog, getLocalItem, loadCatalog, vectorOf } from "@/lib/catalog";
import { calibrationDeck, recommend } from "@/lib/engine/recommend";
import { COLD_START_TARGET, isCalibrating } from "@/lib/engine/taste";
import { useDhawq } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { SwipeAction, Title } from "@/lib/types";

const REFILL_AT = 3;
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
        mode: isCalibrating(state.profile) ? "calibration" : "recommend",
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { items: { title: Title }[] };
    return data.items.map((i) => i.title);
  } catch {
    return null;
  }
}

/** local/demo mode: run the engine over the bundled catalog */
function computeLocalBatch(excludeExtra: string[]): Title[] {
  const pool = getLocalCatalog();
  const state = useDhawq.getState();
  const exclude = new Set<string>([...Object.keys(state.swipes), ...excludeExtra]);

  if (isCalibrating(state.profile)) {
    const fresh = calibrationDeck(pool, exclude, BATCH);
    if (fresh.length > 0) return fresh;
  }
  const likedItems = Object.values(state.swipes)
    .filter((s) => s.action === "liked")
    .map((s) => {
      const title = s.title ?? getLocalItem(s.titleId)?.title;
      return title ? { title, vector: vectorOf(title) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  return recommend(pool, state.profile, {
    excludeIds: exclude,
    count: BATCH,
    likedItems,
  }).map((r) => r.title);
}

/**
 * The swipe queue: calibration anchors while the taste fingerprint is cold,
 * then personalized recommendations from the engine.
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

  const calibrating = isCalibrating(profile);
  const ratedSwipes = profile.ratedSwipes;

  const appendFresh = useCallback((fresh: Title[]) => {
    if (fresh.length === 0) return;
    setQueue((q) => [...q, ...fresh.filter((f) => !q.some((x) => x.id === f.id))]);
  }, []);

  const refill = useCallback(() => {
    const queuedIds = queueRef.current.map((t) => t.id);
    if (isSupabaseConfigured()) {
      void fetchRemoteBatch(BATCH).then((remote) => {
        if (remote && remote.length > 0) {
          appendFresh(remote.filter((t) => !queuedIds.includes(t.id)));
        } else {
          // cloud not seeded yet → bundled catalog
          appendFresh(computeLocalBatch(queuedIds));
        }
      });
      return;
    }
    appendFresh(computeLocalBatch(queuedIds));
  }, [appendFresh]);

  // wait for the catalog fetch and the persisted store before the first fill
  useEffect(() => {
    let cancelled = false;
    void loadCatalog().then(() => {
      if (cancelled) return;
      setHydrated(true);
      refill();
    });
    return () => {
      cancelled = true;
    };
  }, [refill]);

  const swipeTop = useCallback(
    (action: SwipeAction) => {
      const top = queueRef.current[0];
      if (!top) return;
      doSwipe(top, action);
      setQueue((q) => q.slice(1));
      if (queueRef.current.length - 1 <= REFILL_AT) {
        // let state settle, then refill with the updated profile
        setTimeout(refill, 50);
      }
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

  return {
    queue,
    hydrated,
    swipeTop,
    undo,
    canUndo,
    calibrating,
    calibrationProgress,
    swipeCount: Object.keys(swipes).length,
    refill,
  };
}
