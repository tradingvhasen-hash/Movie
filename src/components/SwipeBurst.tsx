"use client";

/**
 * Small celebration effect after every swipe, matching the choice:
 * liked → blue hearts burst up; disliked → gray thumbs drop;
 * not seen → bubbles float upward. Pure framer-motion, ~1s, non-blocking.
 */
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpIcon, HeartIcon, ThumbsDownIcon } from "./ui/Icons";
import type { SwipeAction } from "@/lib/types";

const PARTICLES = 9;

function particleTargets(action: SwipeAction, i: number) {
  const spread = (i / (PARTICLES - 1) - 0.5) * 2; // -1..1
  const jitter = ((i * 7919) % 100) / 100; // deterministic pseudo-random
  switch (action) {
    case "liked":
      return {
        x: spread * 140 + jitter * 20,
        y: -120 - jitter * 120,
        rotate: spread * 40,
      };
    case "disliked":
      return {
        x: spread * 110,
        y: 130 + jitter * 90,
        rotate: spread * 60,
      };
    case "not_seen":
      return {
        x: spread * 90,
        y: -160 - jitter * 100,
        rotate: 0,
      };
  }
}

export default function SwipeBurst({ burst }: { burst: { id: number; action: SwipeAction } | null }) {
  return (
    <AnimatePresence>
      {burst && (
        <motion.div
          key={burst.id}
          className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center overflow-visible"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {Array.from({ length: PARTICLES }).map((_, i) => {
            const target = particleTargets(burst.action, i);
            const size = 14 + ((i * 31) % 14);
            return (
              <motion.span
                key={i}
                className={`absolute ${
                  burst.action === "liked"
                    ? "text-accent"
                    : burst.action === "disliked"
                      ? "text-ink-faint"
                      : "text-accent-soft"
                }`}
                initial={{ x: 0, y: 20, scale: 0.4, opacity: 0 }}
                animate={{
                  x: target.x,
                  y: target.y,
                  rotate: target.rotate,
                  scale: [0.4, 1.15, 0.9],
                  opacity: [0, 1, 0],
                }}
                transition={{ duration: 0.9, delay: i * 0.02, ease: "easeOut" }}
              >
                {burst.action === "liked" ? (
                  <HeartIcon size={size} filled />
                ) : burst.action === "disliked" ? (
                  <ThumbsDownIcon size={size} filled />
                ) : (
                  <ArrowUpIcon size={size} strokeWidth={2.6} />
                )}
              </motion.span>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
