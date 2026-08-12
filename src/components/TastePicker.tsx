"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import TitleTile from "./TitleTile";
import { GlowButton } from "./ui";
import { HeartIcon } from "./ui/Icons";
import { getLocalCatalog } from "@/lib/catalog";
import { FADE_UP, SPRING_SNAPPY, staggerContainer } from "@/lib/motion";
import { useDhawq } from "@/lib/store";
import type { Title } from "@/lib/types";

/** how many titles the grid offers */
const CHOICES = 36;
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
 * The grid is drawn from across the catalog's genres rather than straight down
 * the popularity list, so every taste has something to recognise.
 */
export default function TastePicker({ onDone }: { onDone: () => void }) {
  const swipe = useDhawq((s) => s.swipe);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const choices = useMemo(() => {
    const pool = getLocalCatalog()
      .map((c) => c.title)
      .sort((a, b) => b.voteCount - a.voteCount);

    // round-robin across genres so the grid is not twelve superhero films
    const byGenre = new Map<string, Title[]>();
    for (const t of pool.slice(0, 900)) {
      const g = t.genres[0]?.toLowerCase() ?? "other";
      if (!byGenre.has(g)) byGenre.set(g, []);
      byGenre.get(g)!.push(t);
    }
    const lanes = [...byGenre.values()];
    const out: Title[] = [];
    for (let round = 0; out.length < CHOICES; round++) {
      let added = false;
      for (const lane of lanes) {
        if (out.length >= CHOICES) break;
        if (lane[round]) {
          out.push(lane[round]);
          added = true;
        }
      }
      if (!added) break;
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
      <motion.p variants={FADE_UP} className="mt-2 leading-relaxed text-ink-dim">
        Three or more. This tells us more in one tap than forty swipes can.
      </motion.p>

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
                <AnimatePresence>
                  {on && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="pointer-events-none absolute inset-0 flex items-center justify-center bg-accent/45 backdrop-blur-[1px]"
                    >
                      <motion.span
                        initial={{ scale: 0.4 }}
                        animate={{ scale: 1 }}
                        transition={SPRING_SNAPPY}
                        className="rounded-full bg-white/95 p-2 text-accent shadow-lg"
                      >
                        <HeartIcon size={20} filled />
                      </motion.span>
                    </motion.div>
                  )}
                </AnimatePresence>
              }
            />
          );
        })}
      </motion.div>

      {/* the action bar floats so the grid can be scrolled behind it */}
      <div className="fixed inset-x-0 bottom-[74px] z-20 bg-gradient-to-t from-bg via-bg to-transparent px-5 pb-4 pt-8">
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
