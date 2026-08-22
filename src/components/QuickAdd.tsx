"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import PosterArt from "./PosterArt";
import { getLocalCatalog, getLocalTitle, loadCatalog } from "@/lib/catalog";
import { watchedGrid } from "@/lib/engine/recommend";
import { useDhawq } from "@/lib/store";
import type { Title } from "@/lib/types";

/**
 * FORTY AT A TIME, BECAUSE ONE AT A TIME IS THE THING THAT COLLAPSES.
 *
 * The deck asks about one film and gets a full verdict. Measured on 60 real
 * histories over 1,200 titles it recovers 411 of 533 — but the rate falls the
 * whole way, 71 per hundred cards at the start and 12 by the end, and four
 * separate attempts to fix that inside the ranking all failed. The last one
 * proved the ranking is not even blind: at card 900 the exposure model
 * separates watched from unwatched at AUC 0.825 and still deals 12 per hundred.
 *
 * So the problem is not which title is asked about next. It is that asking
 * costs a whole card. The same 60 histories, same engine, same gate, asked as
 * screens of forty posters instead:
 *
 *     deck        22.0 minutes   1,121 titles harvested per hour
 *     grid of 24   8.3 minutes   1,648
 *     grid of 40   7.8 minutes   1,750      +56%
 *
 * A grid collects no opinion, which is a real loss — it cannot tell a film
 * someone loved from one they merely finished. That is why this does not
 * replace the deck. It is the harvesting half: get the library in, then let
 * the deck spend its cards on titles the site already knows were watched,
 * which is the one thing it is unambiguously good at.
 *
 * `watchedGrid` has been sitting in the engine, complete and correct and
 * called from nowhere, for as long as the collapse has been the top problem.
 */
const PER_SCREEN = 40;

export default function QuickAdd() {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState(0);
  const [picked, setPicked] = useState<Record<string, true>>({});
  const [added, setAdded] = useState(0);
  const swipes = useDhawq((s) => s.swipes);

  useEffect(() => {
    void loadCatalog().then(() => setReady(true));
  }, []);

  /**
   * The screen is rebuilt only when the screen number changes, never on every
   * tap. `watchedGrid` runs the whole gate, and re-running it inside a render
   * that fires on each poster would rebuild forty tiles under the finger.
   */
  const titles = useMemo<Title[]>(() => {
    if (!ready) return [];
    const state = useDhawq.getState();
    const exclude = new Set(Object.keys(state.swipes));
    /**
     * Everything they have confirmed watching, whatever they felt about it.
     * This is what opens the frontier — a co-watch neighbour of a confirmed
     * title is watched 48.7% of the time against a 3.5% base rate.
     */
    const watched: Title[] = [];
    for (const sw of Object.values(state.swipes)) {
      if (sw.action === "not_seen") continue;
      const t = getLocalTitle(sw.titleId) ?? sw.title;
      if (t) watched.push(t);
    }
    return watchedGrid(getLocalCatalog(), state.profile, {
      excludeIds: exclude,
      count: PER_SCREEN,
      seed: 1 + screen * 7919,
      watched,
    });
    // profile and swipes are deliberately not dependencies: a fresh grid is
    // wanted per screen, not per answer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, screen]);

  const toggle = useCallback((id: string) => {
    setPicked((p) => {
      const next = { ...p };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  }, []);

  /**
   * Untapped means "not seen", and that is the whole economy of this screen.
   *
   * A grid where both answers cost a tap is a grid nobody finishes: forty
   * posters would be forty decisions. The base rate is about 5%, so the
   * overwhelming majority of correct answers are "no" — making those free is
   * what turns forty questions into two or three taps. It is the same trade
   * `/calibrate` is built on, and it is why a screen here is worth about
   * twelve seconds against forty-four for the same titles in the deck.
   */
  const commit = () => {
    const swipe = useDhawq.getState().swipe;
    let n = 0;
    for (const t of titles) {
      if (picked[t.id]) {
        swipe(t, "seen");
        n++;
      } else {
        swipe(t, "not_seen");
      }
    }
    setAdded((a) => a + n);
    setPicked({});
    setScreen((s) => s + 1);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  const chosen = Object.keys(picked).length;
  const library = useMemo(
    () => Object.values(swipes).filter((s) => s.action !== "not_seen").length,
    [swipes]
  );

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-ink-dim">
        loading…
      </div>
    );
  }

  return (
    <div className="px-4 pb-32 pt-5">
      <h1 className="text-2xl font-bold tracking-tight text-ink-strong">Add fast</h1>
      <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-dim">
        Tap everything you have watched. Anything you leave alone counts as not
        watched, so a screen usually costs two or three taps.
      </p>

      <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {titles.map((t) => {
          const on = t.id in picked;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t.id)}
              aria-pressed={on}
              /* a flex item's automatic minimum size is its content, so
                 without min-w-0 a long title decides the column width until
                 the poster loads — see CalibrationGrid, same bug */
              className="flex w-full min-w-0 flex-col gap-1 text-left"
            >
              <div
                className={`relative aspect-[2/3] w-full overflow-hidden rounded-xl border transition-all ${
                  on ? "border-accent ring-2 ring-accent/60" : "border-line opacity-60"
                }`}
              >
                <PosterArt title={t} sizes="140px" className="aspect-[2/3] w-full" />
                {on && (
                  <span className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-accent text-xs font-bold text-[color:var(--color-on-accent)]">
                    ✓
                  </span>
                )}
              </div>
              <div className="w-full truncate text-center text-[10px] leading-tight text-ink-dim">
                {t.title.en} · {t.year}
              </div>
            </button>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <p className="text-xs tabular-nums text-ink-dim">
            <span className="font-semibold text-ink-strong">{library}</span> in your
            library
            {added > 0 && <> · {added} added here</>}
          </p>
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={commit}
            className="rounded-full bg-accent px-6 py-3 text-sm font-bold text-[color:var(--color-on-accent)]"
          >
            {chosen > 0 ? `Add ${chosen} · next` : "None of these"}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
