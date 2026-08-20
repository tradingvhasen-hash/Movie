"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import TitleTile from "./TitleTile";
import { GlowButton } from "./ui";
import { HeartIcon } from "./ui/Icons";
import { getLocalCatalog } from "@/lib/catalog";
import { resolveSeeds } from "@/lib/data/taste-seeds";
import { EASE_OUT, FADE_UP, QUICK, staggerContainer } from "@/lib/motion";
import { useDhawq } from "@/lib/store";

/** how many titles the grid offers */
const CHOICES = 50;
/** how many picks before the button unlocks */
const MIN_PICKS = 3;

/**
 * Ask before guessing.
 *
 * Measured against the benchmark's Rush Hour reference list, for a viewer
 * whose taste is buddy-cop comedies:
 *
 *     40 swipes, never asked          0/12 good recommendations
 *     5 up-front picks, 0 swipes      7/12
 *
 * Forty swipes of inference lost to one question. The reason is that the
 * opening deck is necessarily the most famous titles in the catalog, and
 * famous titles are famous because they appeal to almost everyone — so a new
 * viewer likes nearly all of them and teaches us almost nothing. Naming five
 * films you love is a far sharper signal than rating forty you half-like, and
 * it is the standard remedy for cold start in the literature.
 *
 * The fifty tiles are a hand-named list — each audience's own canon, classics
 * included — because every attempt to derive them from the catalog's own
 * numbers produced the same wall of modern blockbusters. See taste-seeds.ts.
 */
export default function TastePicker({ onDone }: { onDone: () => void }) {
  const swipe = useDhawq((s) => s.swipe);
  const learnPasses = useDhawq((s) => s.learnPasses);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const choices = useMemo(() => {
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
  }, []);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirm = () => {
    for (const t of choices) if (picked.has(t.id)) swipe(t, "liked");
    // the tiles they looked at and left alone are evidence as well — see
    // learnPasses. Without them the grid teaches likes and nothing else.
    learnPasses(choices.filter((t) => !picked.has(t.id)));
    onDone();
  };

  const enough = picked.size >= MIN_PICKS;

  return (
    <motion.div
      variants={staggerContainer(0.05, 0.05)}
      initial="hidden"
      animate="show"
      exit="exit"
      className="mx-auto flex max-w-md flex-col px-5 pb-32 pt-8"
    >
      <motion.h1 variants={FADE_UP} className="text-3xl font-bold tracking-tight">
        Pick a few you love
      </motion.h1>
      {/*
        The line that stood here — "Three or more. This tells us more in one tap
        than forty swipes can." — was deleted on the user's exact objection, and
        he is right for a reason worth keeping: the heading already says *what*
        to do and the button already says *how many*. A third sentence
        explaining why the instruction is a good instruction is the writer
        arguing with the reader. Anything a control already states does not need
        a sentence next to it saying the same thing more slowly.
      */}

      <motion.div
        variants={staggerContainer(0.02)}
        className="mt-6 grid grid-cols-3 gap-3"
      >
        {choices.map((t) => {
          const on = picked.has(t.id);
          return (
            <TitleTile
              key={t.id}
              title={t}
              onClick={() => toggle(t.id)}
              overlay={
                /**
                 * SELECTED, NOT CELEBRATED.
                 *
                 * What was here scaled a white circle from 0.4 to 1 on a snappy
                 * spring behind a 45% flood of accent blue. Three separate
                 * things made it read as cheap, and they are the same three
                 * that made the swipe burst read as cheap:
                 *
                 *   · it overshoots. A mark being *revealed* has no momentum to
                 *     carry it past its size; only a thrown object does.
                 *   · it starts at 0.4, so most of the animation is the eye
                 *     tracking growth rather than registering a state.
                 *   · the flood hides the poster it is confirming, which
                 *     removes the one thing the person is looking at.
                 *
                 * A selection should read instantly and get out of the way. So
                 * the poster stays visible under a light scrim, the tile takes
                 * a ring in the accent — the ring is the state, and rings are
                 * how every native platform says "chosen" — and the mark fades
                 * up from 0.86 with no bounce at all.
                 */
                <AnimatePresence>
                  {on && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: QUICK, ease: EASE_OUT }}
                      className="pointer-events-none absolute inset-0 rounded-[inherit] bg-accent/18 ring-2 ring-inset ring-accent"
                    >
                      <motion.span
                        initial={{ scale: 0.86, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.92, opacity: 0 }}
                        transition={{ duration: QUICK, ease: EASE_OUT }}
                        className="absolute end-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-accent text-[color:var(--color-on-accent)] shadow-sm"
                      >
                        <HeartIcon size={15} filled />
                      </motion.span>
                    </motion.div>
                  )}
                </AnimatePresence>
              }
            />
          );
        })}
      </motion.div>

      {/*
        FLUSH AGAINST THE NAVIGATION, NOT HOVERING A CENTIMETRE ABOVE IT.
 
        `bottom-[74px]` put this bar exactly the height of the tab bar off the
        floor, and the gap between the two — a strip of page showing through —
        is what the user saw: two bars that clearly belong together, held apart
        by nothing. Two stacked surfaces read as one object only when they
        touch.
 
        So it sits at `bottom-0` with the tab bar's height as bottom padding,
        which puts its content immediately above the tabs with no seam, and it
        carries the same blurred material as the tab bar instead of a gradient
        fading into the page. A gradient was doing the job of a boundary, and a
        boundary drawn in fog is the reason the whole area felt unresolved.
      */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/85 px-5 pb-[calc(74px+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <GlowButton
            onClick={confirm}
            disabled={!enough}
            className={`flex-1 text-lg ${enough ? "" : "pointer-events-none opacity-45"}`}
          >
            {enough ? `Start with ${picked.size}` : `Pick ${MIN_PICKS - picked.size} more`}
          </GlowButton>
          <button
            onClick={onDone}
            className="shrink-0 px-3 py-2 text-sm font-medium text-ink-faint transition-colors hover:text-ink-dim"
          >
            Skip
          </button>
        </div>
      </div>
    </motion.div>
  );
}
