"use client";

/**
 * WHAT A SWIPE LOOKS LIKE WHEN IT LANDS.
 *
 * The user called this "cheap", separately from the design, the arrival and
 * the exit — all four. He was right about all four, and the cause is one
 * decision: this threw **nine icons in a fan** for **0.9 seconds**.
 *
 * Nine objects flying outwards is the confetti vocabulary of a mobile game
 * reward. It says "you scored"; the card is not a score, it is an answer. And
 * 0.9s is long enough that the burst is still on screen while the next card is
 * settling, so two things move at once and neither reads as deliberate.
 *
 * WHAT REPLACED IT, AND WHY.
 *
 * The premium version of this gesture — the Apple Pay checkmark, the iOS
 * message effect, the Android ripple — is always the same three ideas:
 *
 *   1. ONE mark, not many. Multiplicity reads as decoration; singularity reads
 *      as acknowledgement.
 *   2. LIGHT rather than objects. A wash of colour expanding and fading is
 *      weightless and cannot look like clip-art; nine small icons always can.
 *   3. It LEAVES before the next thing arrives. Overlap is what makes an
 *      interface feel busy rather than fast.
 *
 * So: a soft radial wash of the action's colour blooms from the direction the
 * card went, one glyph rises through it at a size you cannot mistake for an
 * icon in a toolbar, and the whole thing is finished in 380ms — the `SLOW`
 * token, and the longest anything in this app is allowed to take.
 *
 * The glyph scales 0.72 → 1 with no overshoot. A bounce is the single clearest
 * tell of a cheap animation: real objects with real mass do not overshoot when
 * they are being *revealed*, only when they are being *thrown*. The card is
 * thrown, so the card gets a spring; the mark is revealed, so it does not.
 */
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpIcon, EyeIcon, HeartIcon, ThumbsDownIcon } from "./ui/Icons";
import { EASE_OUT, SLOW } from "@/lib/motion";
import type { SwipeAction } from "@/lib/types";

/** where the wash blooms from, matching the direction the card left */
const ORIGIN: Record<SwipeAction, string> = {
  liked: "75% 50%",
  disliked: "25% 50%",
  not_seen: "50% 22%",
  seen: "50% 50%",
};

const TINT: Record<SwipeAction, string> = {
  liked: "var(--color-accent)",
  disliked: "var(--color-danger)",
  not_seen: "var(--color-ink-dim)",
  seen: "var(--color-accent-soft)",
};

function Glyph({ action }: { action: SwipeAction }) {
  const size = 68;
  if (action === "liked") return <HeartIcon size={size} filled />;
  if (action === "disliked") return <ThumbsDownIcon size={size} filled />;
  if (action === "seen") return <EyeIcon size={size} strokeWidth={1.6} />;
  return <ArrowUpIcon size={size} strokeWidth={1.8} />;
}

export default function SwipeBurst({
  burst,
}: {
  burst: { id: number; action: SwipeAction } | null;
}) {
  return (
    <AnimatePresence>
      {burst && (
        <motion.div
          key={burst.id}
          className="pointer-events-none absolute inset-0 z-40 overflow-hidden rounded-[var(--radius-card)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.16, ease: EASE_OUT } }}
        >
          {/* the light: a wash from the edge the card left through */}
          <motion.div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(120% 90% at ${ORIGIN[burst.action]}, ${
                TINT[burst.action]
              } 0%, transparent 62%)`,
            }}
            initial={{ opacity: 0, scale: 1.18 }}
            animate={{ opacity: [0, 0.28, 0], scale: 1 }}
            transition={{ duration: SLOW, ease: EASE_OUT, times: [0, 0.32, 1] }}
          />

          {/* the mark: one, centred, revealed rather than thrown */}
          <motion.div
            className="absolute inset-0 grid place-items-center"
            style={{ color: TINT[burst.action] }}
            initial={{ opacity: 0, scale: 0.72, filter: "blur(6px)" }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0.72, 1, 1.04],
              filter: ["blur(6px)", "blur(0px)", "blur(2px)"],
            }}
            transition={{ duration: SLOW, ease: EASE_OUT, times: [0, 0.34, 1] }}
          >
            <Glyph action={burst.action} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
