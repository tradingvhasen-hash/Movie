"use client";

/**
 * SHOW THE GESTURE INSTEAD OF DESCRIBING IT.
 *
 * What stood here was a wall: a heading, a paragraph, and three checkbox rows
 * spelling out "swipe right: watched and loved it", "swipe left: watched,
 * didn't like it", "swipe up: haven't seen it". Nobody reads three sentences
 * to learn a gesture they already know from every other card interface on
 * their phone — and if they did read them, they would still not know what the
 * gesture *feels* like, which is the only thing worth teaching.
 *
 * So the first card demonstrates itself. It leans right and a heart appears,
 * returns, leans left and a thumb-down appears, returns, then lifts up with a
 * cross and leaves — handing the stage to the first real film.
 *
 * IT LEANS, IT DOES NOT FLY. The card must never leave the screen sideways
 * during the demo, because a card that vanishes teaches "this is what happens
 * when I swipe" only after the fact. A card that travels a third of the way
 * and springs back teaches the *relationship* between the movement and the
 * verdict while both are still visible. Only the last movement completes, so
 * the demo ends the way a real swipe does.
 *
 * WHEN IT APPEARS, exactly as specified:
 *
 *   · the first time someone opens the site and has not swiped a card
 *   · after a page refresh, if they still have not swiped a card
 *   · NOT when they wander to Discover and come back
 *
 * The third condition is what `shownThisLoad` is for. A module-level flag
 * lives as long as the JavaScript bundle does: it survives navigating between
 * pages, and it dies on refresh — which is precisely the rule asked for, with
 * no storage, no timestamps and nothing to get out of sync.
 */
import { useEffect, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import Wordmark from "./ui/Wordmark";
import { ArrowUpIcon, HeartIcon, ThumbsDownIcon } from "./ui/Icons";
import { EASE_OUT, SPRING_SETTLE } from "@/lib/motion";

let shownThisLoad = false;

/** has the demo already run since this page was loaded? */
export function demoAlreadyShown(): boolean {
  return shownThisLoad;
}

type Beat = { x: number; y: number; rotate: number; badge: Badge | null };
type Badge = "liked" | "disliked" | "not_seen";

/**
 * The script. Distances are a fraction of the card, not pixels, so the demo
 * reads identically on a small phone and a tablet.
 */
const BEATS: { beat: Beat; hold: number }[] = [
  { beat: { x: 0, y: 0, rotate: 0, badge: null }, hold: 520 },
  { beat: { x: 96, y: -6, rotate: 7, badge: "liked" }, hold: 620 },
  { beat: { x: 0, y: 0, rotate: 0, badge: null }, hold: 260 },
  { beat: { x: -96, y: -6, rotate: -7, badge: "disliked" }, hold: 620 },
  { beat: { x: 0, y: 0, rotate: 0, badge: null }, hold: 260 },
  { beat: { x: 0, y: -120, rotate: 0, badge: "not_seen" }, hold: 560 },
];

const BADGE = {
  liked: { Icon: HeartIcon, tint: "var(--color-accent)", filled: true },
  disliked: { Icon: ThumbsDownIcon, tint: "var(--color-danger)", filled: true },
  not_seen: { Icon: ArrowUpIcon, tint: "var(--color-ink-dim)", filled: false },
} as const;

export default function WelcomeDemo({ onDone }: { onDone: () => void }) {
  const controls = useAnimationControls();
  const [badge, setBadge] = useState<Badge | null>(null);
  const [leaving, setLeaving] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    shownThisLoad = true;
    cancelled.current = false;

    const wait = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));

    (async () => {
      // the card arrives before the script starts: the beats below own x, y and
      // rotate only, so without this it would run the whole demo at opacity 0
      await controls.start({
        opacity: 1,
        y: 0,
        transition: { duration: 0.32, ease: EASE_OUT },
      });
      for (const { beat, hold } of BEATS) {
        if (cancelled.current) return;
        setBadge(beat.badge);
        await controls.start({
          x: beat.x,
          y: beat.y,
          rotate: beat.rotate,
          transition: SPRING_SETTLE,
        });
        await wait(hold);
      }
      if (cancelled.current) return;
      // only the last movement completes: the card goes, as a real one would
      setLeaving(true);
      await controls.start({
        y: -820,
        opacity: 0,
        transition: { duration: 0.42, ease: EASE_OUT },
      });
      if (!cancelled.current) onDone();
    })();

    return () => {
      cancelled.current = true;
    };
  }, [controls, onDone]);

  const active = badge ? BADGE[badge] : null;

  return (
    <div
      className="swipe-stage mx-auto flex w-full max-w-md flex-col items-center overflow-hidden px-4 pt-4"
      style={{ height: "calc(100dvh - 74px - env(safe-area-inset-bottom))" }}
    >
      <div className="relative min-h-0 w-full flex-1">
        <div className="relative mx-auto h-full w-fit">
          <div className="relative h-full max-w-[80vw]" style={{ aspectRatio: "10 / 14.6" }}>
            <motion.div
              className="soft-card relative flex h-full w-full flex-col items-center justify-center overflow-hidden"
              animate={controls}
              initial={{ x: 0, y: 24, rotate: 0, opacity: 0 }}
            >
              <Wordmark size={40} arabic />

              {/* the verdict tint, washing in from the side the card leaned */}
              <motion.div
                className="pointer-events-none absolute inset-0"
                animate={{
                  opacity: active ? 0.16 : 0,
                  background: active
                    ? `radial-gradient(120% 90% at ${
                        badge === "liked" ? "80%" : badge === "disliked" ? "20%" : "50%"
                      } ${badge === "not_seen" ? "18%" : "50%"}, ${active.tint} 0%, transparent 64%)`
                    : "none",
                }}
                transition={{ duration: 0.22, ease: EASE_OUT }}
              />

              <motion.div
                className="absolute grid place-items-center"
                style={{ color: active?.tint }}
                animate={{
                  opacity: active ? 1 : 0,
                  scale: active ? 1 : 0.72,
                  filter: active ? "blur(0px)" : "blur(6px)",
                }}
                transition={{ duration: 0.22, ease: EASE_OUT }}
              >
                {active && <active.Icon size={76} filled={active.filled} strokeWidth={1.7} />}
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* the same button row the deck has, so the demo is teaching the real
          controls rather than a diagram of them */}
      <div className="flex shrink-0 items-center justify-center gap-4 py-3" aria-hidden>
        {[
          { on: badge === "disliked", size: 56 },
          { on: false, size: 44 },
          { on: badge === "not_seen", size: 44 },
          { on: false, size: 44 },
          { on: badge === "liked", size: 56 },
        ].map((b, i) => (
          <motion.div
            key={i}
            className="rounded-full"
            style={{ width: b.size, height: b.size }}
            animate={{
              backgroundColor: b.on ? "var(--color-accent)" : "var(--color-surface-2)",
              scale: b.on ? 1.08 : 1,
              opacity: leaving ? 0 : 1,
            }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
          />
        ))}
      </div>
    </div>
  );
}
