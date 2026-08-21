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
 *   MARK       one glyph, revealed rather than thrown — no overshoot
 *   SHOCKWAVE  one ring leaves from where the card was thrown
 *
 * The ring is the piece doing the real work. A flash alone reads as a screen
 * event; a ring reads as *something having happened at a place*, and the place
 * is where the thumb was. That is the difference between the interface
 * flickering and the interface answering.
 *
 * It ends before the next card finishes settling, on purpose: overlap is what
 * makes an interface feel busy instead of fast.
 *
 * ── WHY THE FLASH AND THE MARK ARE ONE ELEMENT ──────────────────────────
 *
 * They were two, inside an `AnimatePresence` wrapper that faded on exit, next
 * to the ring: four full-screen composited layers, all created in the single
 * frame a finger lifts — the same frame in which the drag feedback's layers
 * are torn down and the card's 560ms flight is supposed to begin. The user
 * filmed the result and described it exactly: the cards do not fly, they
 * vanish.
 *
 * The flash and the mark fade on the same curve over the same duration, so
 * they can share one opacity and therefore one layer; the glyph keeps its own
 * scale as a transform-only child, which costs nothing. The wrapper animates
 * nothing at all now — the burst clears itself on a timer well after the
 * animation has already reached zero, so there was never anything for an exit
 * transition to hide.
 *
 * Two layers where there were four. Nothing about the effect is different.
 */
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { motion } from "framer-motion";
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

  if (!burst) return null;

  const Icon = GLYPH[burst.action];
  const tint = TINT[burst.action];
  const origin = ORIGIN[burst.action];

  return (
    <div key={burst.id} className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {/*
        The flash, with the mark inside it.

        The gradient carries the flash's own strength in its colour stops
        rather than in the layer's opacity, which is what frees the opacity to
        be shared with the glyph.
      */}
      <motion.div
        className="absolute inset-0 grid place-items-center will-change-[opacity,transform]"
        style={{
          color: tint,
          background:
            `radial-gradient(95% 80% at ${origin.x} ${origin.y}, ` +
            `color-mix(in srgb, ${tint} 42%, transparent) 0%, transparent 68%)`,
        }}
        initial={{ opacity: 1, scale: 0.94 }}
        animate={{ opacity: 0, scale: 1.04 }}
        transition={{ duration: DUR, ease: EASE_OUT }}
      >
        {/*
          The glyph, with its glow painted rather than filtered.

          It used to carry `filter: drop-shadow(0 0 30px …)` while its scale
          and opacity animated. A filter on a moving element is a
          re-rasterisation on every frame, and on a phone's compositor that is
          the difference between an effect and a stall. A radial gradient
          behind the glyph looks the same and is painted once.

          It animates `scale` and nothing else, so it composites as a child of
          the flash rather than as a layer of its own.
        */}
        <motion.span
          className="relative grid h-[190px] w-[190px] place-items-center will-change-transform"
          initial={{ scale: 0.84 }}
          animate={{ scale: 1.08 }}
          transition={{ duration: DUR, ease: EASE_OUT }}
        >
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle, color-mix(in srgb, ${tint} 60%, transparent) 0%, transparent 66%)`,
            }}
          />
          <span className="relative">
            <Icon size={104} filled strokeWidth={1.6} />
          </span>
        </motion.span>
      </motion.div>

      {/* the shockwave */}
      <motion.span
        className="absolute rounded-full will-change-[opacity,transform]"
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
    </div>
  );
});

export default SwipeBurst;
