"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import PosterArt from "./PosterArt";
import { getLocalCatalog, loadCatalog } from "@/lib/catalog";
import { resolveSeeds } from "@/lib/data/taste-seeds";
import { EASE_OUT, FADE_UP, QUICK, SPRING_SNAPPY, staggerContainer } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { useDhawq } from "@/lib/store";
import type { Title } from "@/lib/types";

/** how many titles the grid offers */
const CHOICES = 48;
/** how many picks before the button unlocks */
const MIN_PICKS = 3;

/**
 * ASK BEFORE GUESSING — and the measurement that decided it.
 *
 * Against the benchmark's reference list, for a viewer whose taste is buddy-cop
 * comedies:
 *
 *     40 swipes, never asked          0/12 good recommendations
 *     5 up-front picks, 0 swipes      7/12
 *
 * Forty swipes of inference lost to one question. The opening deck is
 * necessarily the most famous titles in the catalog, and famous titles are
 * famous because they appeal to almost everyone — so a new viewer likes nearly
 * all of them and teaches us almost nothing. Naming five films you love is a
 * far sharper signal than rating forty you half-like.
 *
 * ── THE REDESIGN, AND WHAT WAS WRONG BEFORE ──────────────────────────────
 *
 * The user rejected this screen in its entirety: the tiles, the bar across the
 * bottom holding "Skip" and "Pick 3 more", the dead strip between that bar and
 * the tab bar, the way a press felt, the blue line, the heart in the corner.
 * Four separate faults, one cause — the screen was assembled out of components
 * built for other screens.
 *
 *   THE TILES were `TitleTile`, which is a *library* tile: poster, title, year,
 *   star rating. None of that is the question being asked. You do not need to
 *   be told the year of a film to know whether you loved it, and forty-eight
 *   captions turn a wall of posters into a spreadsheet. Posters only.
 *
 *   THE SELECTION MARK was a heart on a disc in the corner, over a flood of
 *   blue that hid the poster it was confirming. The state is now carried by the
 *   tile itself — chosen tiles stay bright and take a ring, everything else
 *   steps back — which is how a person naturally reads a group of things they
 *   have set aside, and it needs no badge at all.
 *
 *   THE BOTTOM BAR was a full-width rectangle whose height was mostly padding,
 *   sitting on top of the tab bar and leaving a dead strip. It is now a pill
 *   that is not there until there is something to say, floating clear of the
 *   tabs. "Skip" moves to the header, where a secondary action belongs and
 *   where it stops competing with the primary one for the same corner.
 *
 *   THE PROGRESS ("Pick 3 more", which also mis-stated the rule — three *or
 *   more*) is three dots that fill as you choose. A count that draws itself is
 *   read at a glance and cannot be phrased wrongly.
 */
export default function TastePicker({ onDone }: { onDone: () => void }) {
  const swipe = useDhawq((s) => s.swipe);
  const learnPasses = useDhawq((s) => s.learnPasses);
  const haptics = useDhawq((s) => s.settings.haptics);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadCatalog().then(() => setReady(true));
  }, []);

  const choices = useMemo(() => {
    void ready;
    const pool = getLocalCatalog().map((c) => c.title);

    /**
     * The grid is a named list, not a derived one — see taste-seeds.ts for why
     * two attempts at deriving it both produced the same wall of modern
     * blockbusters.
     */
    const out = resolveSeeds(pool, CHOICES);

    // only reachable if the catalog fetch failed and we are on the bundled
    // sample set: fill the remainder with whatever is best known
    if (out.length < CHOICES) {
      const used = new Set(out.map((t) => t.id));
      for (const t of [...pool].sort((a, b) => b.voteCount - a.voteCount)) {
        if (out.length >= CHOICES) break;
        if (!used.has(t.id)) {
          used.add(t.id);
          out.push(t);
        }
      }
    }
    return out;
  }, [ready]);

  const toggle = (id: string) => {
    haptic("tick", haptics);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirm = () => {
    for (const t of choices) if (picked.has(t.id)) swipe(t, "liked");
    // the tiles they looked at and left alone are evidence as well — see
    // learnPasses. Without them the grid teaches likes and nothing else.
    learnPasses(choices.filter((t) => !picked.has(t.id)));
    onDone();
  };

  const enough = picked.size >= MIN_PICKS;
  const anyPicked = picked.size > 0;

  return (
    <motion.div
      variants={staggerContainer(0.05, 0.05)}
      initial="hidden"
      animate="show"
      exit="exit"
      className="mx-auto flex max-w-md flex-col px-5 pb-40 pt-8"
    >
      <motion.div variants={FADE_UP} className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.03em]">
            What have you
            <br />
            loved?
          </h1>
          {/* three or more, drawn rather than written */}
          <div className="mt-3.5 flex items-center gap-1.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="block h-1.5 rounded-full"
                animate={{
                  width: picked.size > i ? 26 : 14,
                  backgroundColor:
                    picked.size > i ? "var(--color-accent)" : "var(--color-line)",
                }}
                transition={SPRING_SNAPPY}
              />
            ))}
            <AnimatePresence>
              {picked.size > MIN_PICKS && (
                <motion.span
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="ms-1 text-xs font-bold tabular-nums text-accent"
                >
                  {picked.size}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>

        <button
          type="button"
          onClick={onDone}
          className="-me-2 shrink-0 rounded-full px-3 py-2 text-sm font-semibold text-ink-faint transition-colors hover:text-ink-dim active:scale-95"
        >
          Skip
        </button>
      </motion.div>

      <motion.div variants={staggerContainer(0.015)} className="mt-7 grid grid-cols-3 gap-2.5">
        {choices.map((t) => (
          <PickTile
            key={t.id}
            title={t}
            selected={picked.has(t.id)}
            dimmed={anyPicked && !picked.has(t.id)}
            onToggle={() => toggle(t.id)}
          />
        ))}
      </motion.div>

      {/*
        A PILL THAT IS NOT THERE UNTIL THERE IS SOMETHING TO SAY.

        The bar this replaces was present from the first frame, disabled and
        greyed, announcing how far the person still had to go. A control that
        exists only to be unavailable is a control arguing with the user. This
        arrives — springs up, from below the fold — at the moment it becomes
        true, which is also the moment it becomes useful.
      */}
      <AnimatePresence>
        {enough && (
          <motion.div
            initial={{ y: 90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 90, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-30 flex justify-center px-5"
          >
            <motion.button
              type="button"
              onClick={confirm}
              whileTap={{ scale: 0.95 }}
              transition={SPRING_SNAPPY}
              className="rounded-full bg-accent px-8 py-4 text-base font-bold text-[color:var(--color-on-accent)] shadow-[0_10px_34px_rgb(var(--rgb-accent)/0.45)]"
            >
              Start with {picked.size}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * A poster and nothing else.
 *
 * Chosen: full brightness, an accent ring, and a lift with the accent's own
 * light under it. Not chosen, once anything has been: a step back in
 * brightness and saturation. The set you have picked reads as a group from
 * across the room, which is exactly how somebody checks whether they are done.
 */
function PickTile({
  title,
  selected,
  dimmed,
  onToggle,
}: {
  title: Title;
  selected: boolean;
  dimmed: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.button
      type="button"
      variants={FADE_UP}
      onClick={onToggle}
      aria-pressed={selected}
      aria-label={title.title.en}
      whileTap={{ scale: 0.93 }}
      /**
       * The tiles that are not chosen step back.
       *
       * This used to fade AND desaturate: `filter: saturate(0.55)`, animated.
       * `dimmed` is `anyPicked && !picked.has(id)`, so the very first tap on
       * the very first screen of the app started a filter animation on every
       * other poster in the grid simultaneously — twenty-odd images
       * re-rasterised per frame for 200ms, as the opening impression.
       *
       * It is the same construct that froze the deck on the user's phone. The
       * fade does nearly all of the visual work on its own; the rest is a
       * surface-coloured sheet, which composites.
       */
      animate={{
        opacity: dimmed ? 0.62 : 1,
        scale: selected ? 1 : 0.985,
      }}
      transition={{ ...SPRING_SNAPPY, opacity: { duration: QUICK, ease: EASE_OUT } }}
      className="relative block w-full min-w-0 overflow-hidden rounded-2xl bg-surface-2"
      style={{
        boxShadow: selected
          ? "0 0 0 3px var(--color-accent), 0 10px 26px rgb(var(--rgb-accent) / 0.35)"
          : "0 2px 10px rgb(var(--rgb-shadow) / 0.07)",
      }}
    >
      <PosterArt title={title} sizes="140px" className="aspect-[2/3] w-full" />
      <motion.span
        className="pointer-events-none absolute inset-0 bg-surface"
        animate={{ opacity: dimmed ? 0.34 : 0 }}
        transition={{ duration: QUICK, ease: EASE_OUT }}
        aria-hidden
      />
    </motion.button>
  );
}
