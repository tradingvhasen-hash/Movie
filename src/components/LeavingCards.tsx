"use client";

/**
 * THE CARD THAT HAS ALREADY BEEN ANSWERED, STILL FLYING.
 *
 * A swipe commits the instant the finger lifts. The real card is dropped from
 * the queue immediately — that is what lets the next card take a gesture right
 * away, and fixing it was what stopped every second fast swipe from doing
 * nothing. This keeps a picture of the answered card on screen for the half
 * second the fly-off takes.
 *
 * A PICTURE, NOT ANOTHER CARD. It used to mount a whole `PosterArt` — a React
 * subtree and a fresh `<img>` — at the exact instant the finger lifts, which
 * is the one moment in the interaction that cannot afford any work. Measured
 * by removing it entirely, it cost 9 of the 24 frames lost in the half-second
 * after a swipe. A `background-image` on one div reuses the bytes the browser
 * already has.
 *
 * AND IT OWNS ITS OWN STATE, which is why this is a file rather than four
 * lines in the deck. The deck used to hold this list, so every fly-off caused
 * two renders of the deck — one to add the copy, one 560ms later to remove it
 * — and a render of the deck is a render of three cards plus framer-motion's
 * pass over all of them. The deck now renders once per swipe: the once it
 * genuinely needs, to advance the queue. Everything about this on screen is
 * unchanged.
 */
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { motion } from "framer-motion";
import { EASE_SWEEP } from "@/lib/motion";
import type { SwipeAction, Title } from "@/lib/types";

const FLIGHT_MS = 560;

export interface LeavingHandle {
  fire: (title: Title, action: SwipeAction) => void;
}

type Flying = { title: Title; action: SwipeAction; at: number };

/* starts roughly where the thumb let go, so the hand-off from the real card to
   this copy is not visible */
const FROM: Record<string, { x: number; y: number; rotate: number }> = {
  liked: { x: 130, y: -10, rotate: 8 },
  disliked: { x: -130, y: -10, rotate: -8 },
  other: { x: 0, y: -120, rotate: 0 },
};

const TO: Record<string, { x: number; y: number; rotate: number; scale: number }> = {
  liked: { x: 640, y: -90, rotate: 24, scale: 0.92 },
  disliked: { x: -640, y: -90, rotate: -24, scale: 0.92 },
  other: { x: 0, y: -780, rotate: 0, scale: 0.9 },
};

const LeavingCards = forwardRef<LeavingHandle>(function LeavingCards(_props, ref) {
  const [flying, setFlying] = useState<Flying[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useImperativeHandle(ref, () => ({
    fire(title: Title, action: SwipeAction) {
      const at = Date.now();
      setFlying((l) => [...l, { title, action, at }]);
      timers.current.push(
        setTimeout(() => setFlying((l) => l.filter((c) => c.at !== at)), FLIGHT_MS)
      );
    },
  }));

  return (
    <>
      {flying.map(({ title, action, at }) => {
        const key = action === "liked" || action === "disliked" ? action : "other";
        return (
          <motion.div
            key={`leaving-${at}`}
            className="pointer-events-none absolute inset-0 z-40 will-change-transform"
            initial={{ ...FROM[key], opacity: 1, scale: 1 }}
            animate={{ ...TO[key], opacity: 0 }}
            transition={{ duration: 0.52, ease: EASE_SWEEP }}
          >
            <div
              className="soft-card relative h-full w-full overflow-hidden bg-surface-2 bg-cover bg-center"
              style={
                title.posterPath
                  ? {
                      backgroundImage: `url(https://image.tmdb.org/t/p/w500${title.posterPath})`,
                    }
                  : undefined
              }
              aria-hidden
            >
              <div className="card-sheen absolute inset-0" />
            </div>
          </motion.div>
        );
      })}
    </>
  );
});

export default LeavingCards;
