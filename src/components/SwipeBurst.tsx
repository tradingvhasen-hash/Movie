"use client";

/**
 * WHAT A SWIPE LOOKS LIKE THE INSTANT IT LANDS.
 *
 * Two rewrites ago this threw nine icons in a fan for 0.9 seconds — the
 * confetti vocabulary of a mobile game reward, on a screen where the person is
 * giving an answer rather than scoring a point. One rewrite ago it was a
 * tasteful little bloom *inside the card frame*, and the user's report on that
 * was the one that matters: he did not see it at all. A 260px-wide effect that
 * plays where the card just left is an effect nobody is looking at.
 *
 * So it is full-screen, it is over in 300ms, and it is built out of the same
 * light as the drag feedback rather than a second vocabulary:
 *
 *   FLASH      the whole screen takes the verdict's colour and lets it go
 *   SHOCKWAVE  one ring leaves from where the card was thrown
 *   MARK       one glyph, revealed rather than thrown — no overshoot
 *
 * The ring is the piece doing the real work. A flash alone reads as a screen
 * event; a ring reads as *something having happened at a place*, and the place
 * is where the thumb was. That is the difference between the interface
 * flickering and the interface answering.
 *
 * It ends before the next card finishes settling, on purpose: overlap is what
 * makes an interface feel busy instead of fast.
 */
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpIcon, EyeIcon, HeartIcon, ThumbsDownIcon } from "./ui/Icons";
import { EASE_OUT } from "@/lib/motion";
import type { SwipeAction } from "@/lib/types";

/** where the ring leaves from, matching the direction the card went */
const ORIGIN: Record<SwipeAction, { x: string; y: string }> = {
  liked: { x: "82%", y: "48%" },
  disliked: { x: "18%", y: "48%" },
  not_seen: { x: "50%", y: "22%" },
  seen: { x: "50%", y: "50%" },
};

const TINT: Record<SwipeAction, string> = {
  liked: "var(--color-accent)",
  disliked: "var(--color-danger)",
  not_seen: "var(--color-skip)",
  seen: "var(--color-ink-strong)",
};

const GLYPH = {
  liked: HeartIcon,
  disliked: ThumbsDownIcon,
  not_seen: ArrowUpIcon,
  seen: EyeIcon,
} as const;

const DUR = 0.3;

export interface BurstHandle {
  fire: (action: SwipeAction) => void;
}

/**
 * IT OWNS ITS OWN LIFE, AND THAT IS A PERFORMANCE DECISION.
 *
 * The burst used to be a piece of the deck's state: the deck set it on a
 * swipe and cleared it on a timer. Two extra renders of the deck per swipe —
 * and a render of the deck is a render of three cards, which framer-motion
 * follows with a projection pass that measures the tree. Profiled on a
 * phone-speed CPU, that measuring was the largest single named cost of a
 * swipe.
 *
 * Nothing above it needs to know this effect exists, so nothing above it is
 * told. The deck calls `fire()` on a ref; the burst starts, plays and clears
 * itself, and the deck renders exactly once per swipe — the once it genuinely
 * has to, to advance the queue.
 */
const SwipeBurst = forwardRef<BurstHandle>(function SwipeBurst(_props, ref) {
  const [burst, setBurst] = useState<{ id: number; action: SwipeAction } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useImperativeHandle(ref, () => ({
    fire(action: SwipeAction) {
      const id = Date.now();
      setBurst({ id, action });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(
        () => setBurst((b) => (b && b.id === id ? null : b)),
        (DUR + 0.16) * 1000
      );
    },
  }));

  const action = burst?.action;
  const Icon = action ? GLYPH[action] : null;
  const tint = action ? TINT[action] : "";
  const origin = action ? ORIGIN[action] : ORIGIN.seen;

  return (
    <AnimatePresence>
      {burst && Icon && (
        <motion.div
          key={burst.id}
          className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_OUT } }}
          aria-hidden
        >
          {/* the flash */}
          <motion.div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(95% 80% at ${origin.x} ${origin.y}, ${tint} 0%, transparent 68%)`,
            }}
            initial={{ opacity: 0.42 }}
            animate={{ opacity: 0 }}
            transition={{ duration: DUR, ease: EASE_OUT }}
          />

          {/* the shockwave */}
          <motion.span
            className="absolute rounded-full"
            style={{
              left: origin.x,
              top: origin.y,
              width: 44,
              height: 44,
              marginLeft: -22,
              marginTop: -22,
              border: `2.5px solid ${tint}`,
            }}
            initial={{ scale: 0.3, opacity: 0.9 }}
            animate={{ scale: 13, opacity: 0 }}
            transition={{ duration: DUR + 0.08, ease: EASE_OUT }}
          />

          {/* the mark */}
          <motion.div
            className="absolute inset-0 grid place-items-center"
            style={{ color: tint, filter: `drop-shadow(0 0 30px ${tint})` }}
            initial={{ opacity: 0, scale: 0.78 }}
            animate={{ opacity: [0.95, 0], scale: [1, 1.1] }}
            transition={{ duration: DUR, ease: EASE_OUT }}
          >
            <Icon size={104} filled strokeWidth={1.6} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

export default SwipeBurst;
