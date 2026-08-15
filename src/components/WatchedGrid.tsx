"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import PosterArt from "./PosterArt";
import { getLocalCatalog, loadCatalog } from "@/lib/catalog";
import { watchedGrid } from "@/lib/engine/recommend";
import { useDhawq } from "@/lib/store";
import { FADE_UP, staggerContainer } from "@/lib/motion";
import type { Title } from "@/lib/types";

/**
 * "WHICH OF THESE HAVE YOU SEEN?"
 *
 * The deck asks one question per gesture and needs a verdict back, so a card
 * for something you have never watched is a wasted swipe. That is arithmetic
 * nobody can rank their way out of: getting H titles into the site takes at
 * least H interactions, and measured against real viewing histories, two
 * thousand cards recovers 78% of a person's history across thirty-seven
 * minutes of uninterrupted swiping — with the last hundred cards yielding four
 * titles each.
 *
 * This screen asks thirty questions at once. Tapping a poster costs the same
 * as swiping a card; *not* tapping one costs a glance. On the same histories
 * with the time taken from real sessions (1.1s a swipe), that is 3,656 titles
 * an hour against the deck's 1,667 — seventeen minutes for two thousand titles
 * instead of thirty-seven.
 *
 * A tap means **watched**, and nothing else. Nobody rates thirty films by
 * tapping, so no opinion is inferred from one: the swipe action is `seen`,
 * which teaches the exposure model at full strength and the taste model
 * nothing at all. Whether you liked them is the deck's job, and it is a
 * separate question that deserves a separate answer.
 */
const PER_SCREEN = 30;

export default function WatchedGrid() {
  const swipe = useDhawq((s) => s.swipe);
  const profile = useDhawq((s) => s.profile);

  const [ready, setReady] = useState(false);
  const [batch, setBatch] = useState<Title[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [harvested, setHarvested] = useState(0);
  const [screens, setScreens] = useState(0);

  useEffect(() => {
    void loadCatalog().then(() => setReady(true));
  }, []);

  const nextScreen = useCallback(() => {
    const pool = getLocalCatalog();
    if (pool.length === 0) return;
    setBatch(
      watchedGrid(pool, useDhawq.getState().profile, {
        excludeIds: new Set(Object.keys(useDhawq.getState().swipes)),
        count: PER_SCREEN,
        seed: Date.now(),
      })
    );
    setPicked(new Set());
  }, []);

  useEffect(() => {
    if (ready && batch.length === 0) nextScreen();
  }, [ready, batch.length, nextScreen]);

  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /**
   * Commit the screen. Everything tapped is `seen`; everything left alone is
   * `not_seen`, which is a real answer and the whole reason this is fast —
   * twenty-three "no"s cost the person nothing to give.
   */
  const commit = () => {
    for (const title of batch) {
      swipe(title, picked.has(title.id) ? "seen" : "not_seen");
    }
    setHarvested((n) => n + picked.size);
    setScreens((n) => n + 1);
    nextScreen();
  };

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-ink-dim">
        loading the catalog…
      </div>
    );
  }

  return (
    <motion.div
      variants={staggerContainer(0.03)}
      initial="hidden"
      animate="show"
      className="px-4 pb-32 pt-6"
    >
      <motion.h1 variants={FADE_UP} className="text-2xl font-bold tracking-tight">
        Which of these have you seen?
      </motion.h1>
      <motion.p variants={FADE_UP} className="mt-1 text-sm text-ink-dim">
        Tap every one you have watched — liked or not. Leave the rest alone.
      </motion.p>

      <motion.div variants={FADE_UP} /**
         * Four across on a phone, not three.
         *
         * The first build used three and only ten of the thirty posters were
         * on screen at once, which quietly destroys the whole argument for
         * this page: its speed comes from the eye taking in many at a glance,
         * and a grid you have to scroll three times is a slower deck. Four
         * columns puts about twenty in view; a poster stays recognisable well
         * below that, because recognising a film you have seen needs far less
         * detail than reading one you have not.
         */
        className="mt-5 grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-8">
        {batch.map((title) => {
          const on = picked.has(title.id);
          return (
            <button
              key={title.id}
              type="button"
              onClick={() => toggle(title.id)}
              aria-pressed={on}
              className={`relative overflow-hidden rounded-xl border transition-all ${
                on
                  ? "border-accent ring-2 ring-accent/60"
                  : "border-line opacity-70 hover:opacity-100"
              }`}
            >
              <PosterArt title={title} sizes="120px" className="aspect-[2/3] w-full" />
              {on && (
                <span className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-accent text-xs font-bold text-white">
                  ✓
                </span>
              )}
              <span className="block truncate px-1 py-0.5 text-center text-[10px] leading-tight text-ink-dim">
                {title.title.en}
              </span>
            </button>
          );
        })}
      </motion.div>

      {/* the commit bar sits above the thumb, because this is a two-hand-free
          screen and the button is pressed once every fifteen seconds */}
      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <p className="text-xs tabular-nums text-ink-dim">
            {harvested > 0 ? (
              <>
                <span className="font-semibold text-ink">{harvested}</span> added
                {screens > 0 && <> · {screens} screens</>}
              </>
            ) : (
              <>{profile.seenCount} titles known so far</>
            )}
          </p>
          <button
            type="button"
            onClick={commit}
            className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-white transition-transform active:scale-95"
          >
            {picked.size > 0 ? `Add ${picked.size} · next` : "None of these · next"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
