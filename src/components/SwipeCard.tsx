"use client";

import { useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";
import PosterArt from "./PosterArt";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  HeartIcon,
  StarIcon,
  ThumbsDownIcon,
} from "./ui/Icons";
import { genreLabel } from "@/lib/genres";
import { EASE_OUT, EASE_SWEEP, SLOW, SPRING_SETTLE, SPRING_SNAPPY } from "@/lib/motion";
import { locale, t } from "@/lib/i18n";
import type { SwipeAction, Title } from "@/lib/types";

export const SWIPE_X_THRESHOLD = 100;
export const SWIPE_UP_THRESHOLD = 120;

export interface SwipeCardProps {
  title: Title;
  /** 0 = top of stack */
  index: number;
  onSwipe: (action: SwipeAction) => void;
  /** externally-triggered exit (buttons/keyboard): action or null */
  forcedExit: SwipeAction | null;
}

export default function SwipeCard({ title, index, onSwipe, forcedExit }: SwipeCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [exiting, setExiting] = useState<SwipeAction | null>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  /* live drag feedback: tilt, stamp opacity, and a subtle scale/lift */
  const rotate = useTransform(x, [-260, 0, 260], [-16, 0, 16]);
  const likeOpacity = useTransform(x, [24, SWIPE_X_THRESHOLD], [0, 1]);
  const likeScale = useTransform(x, [24, SWIPE_X_THRESHOLD], [0.7, 1]);
  const nopeOpacity = useTransform(x, [-SWIPE_X_THRESHOLD, -24], [1, 0]);
  const nopeScale = useTransform(x, [-SWIPE_X_THRESHOLD, -24], [1, 0.7]);
  const skipOpacity = useTransform(y, [-SWIPE_UP_THRESHOLD, -36], [1, 0]);
  const skipScale = useTransform(y, [-SWIPE_UP_THRESHOLD, -36], [1, 0.7]);

  const isTop = index === 0;
  const activeExit = isTop ? (exiting ?? forcedExit) : null;

  /**
   * A gesture commits the moment the finger lifts, not when the animation
   * ends. The card is removed from the queue immediately and `AnimatePresence`
   * plays the fly-off over the top of a card React has already dropped.
   *
   * It used to commit from `onAnimationComplete`, 520ms later, and the deck
   * ignored every swipe in between — reproduced as one stuck card in two at a
   * swipe every 250ms. Half a second is not a long time to a machine and is a
   * very long time to a thumb.
   */
  function handleDragEnd(_: unknown, info: PanInfo) {
    const px = info.offset.x + info.velocity.x / 7;
    const py = info.offset.y + info.velocity.y / 7;
    const action: SwipeAction | null =
      py < -SWIPE_UP_THRESHOLD && Math.abs(py) > Math.abs(px)
        ? "not_seen"
        : px > SWIPE_X_THRESHOLD
          ? "liked"
          : px < -SWIPE_X_THRESHOLD
            ? "disliked"
            : null;
    if (!action) return;
    setExiting(action);
    onSwipe(action);
  }

  /* flies off along an arc, tilting and fading as it goes */
  const exitTarget =
    activeExit === "liked"
      ? { x: 640, y: -90, rotate: 24, opacity: 0, scale: 0.92 }
      : activeExit === "disliked"
        ? { x: -640, y: -90, rotate: -24, opacity: 0, scale: 0.92 }
        : activeExit === "not_seen"
          ? { x: 0, y: -780, rotate: 0, opacity: 0, scale: 0.9 }
          : null;

  /* resting pose in the stack — springs whenever the index changes */
  const restingPose = {
    x: 0,
    y: index * 12,
    scale: 1 - index * 0.05,
    opacity: index > 2 ? 0 : 1,
    filter: index === 0 ? "brightness(1)" : "brightness(0.93)",
  };

  return (
    <motion.div
      className="absolute inset-0 touch-none select-none will-change-transform"
      style={{ x, y, rotate, zIndex: 30 - index, pointerEvents: isTop ? "auto" : "none" }}
      /* a card joining the back of the stack grows in instead of popping */
      initial={{
        y: index * 12 + 26,
        scale: 1 - index * 0.05 - 0.06,
        opacity: 0,
        filter: "brightness(0.93)",
      }}
      animate={exitTarget ?? restingPose}
      transition={
        exitTarget
          ? { duration: 0.52, ease: EASE_SWEEP }
          : { ...SPRING_SETTLE, opacity: { duration: 0.35 }, filter: { duration: 0.35 } }
      }
      /**
       * Leaves instantly, because it is not the thing you watch leave. The
       * deck keeps an inert copy on screen for the fly-off; this one is gone
       * the moment the answer is recorded, which is what frees the deck to
       * take the next gesture.
       */
      exit={{ opacity: 0, transition: { duration: 0 } }}
      drag={isTop && !activeExit}
      dragElastic={0.55}
      dragTransition={{ bounceStiffness: 260, bounceDamping: 26 }}
      onDragEnd={handleDragEnd}
      whileDrag={{ scale: 1.03, cursor: "grabbing" }}
    >
      <div className="soft-card relative h-full w-full overflow-hidden">
        <PosterArt title={title} />

        {/* bottom info gradient */}
        <div className="card-sheen absolute inset-0" />

        {/* direction stamps — scale up as the gesture commits */}
        <motion.div
          style={{ opacity: likeOpacity, scale: likeScale }}
          className="absolute start-4 top-5 rotate-[-8deg] rounded-2xl border-[3px] border-accent bg-white/85 p-2.5 text-accent backdrop-blur"
          aria-label={t("swipe.liked")}
        >
          <HeartIcon size={34} filled />
        </motion.div>
        <motion.div
          style={{ opacity: nopeOpacity, scale: nopeScale }}
          className="absolute end-4 top-5 rotate-[8deg] rounded-2xl border-[3px] border-white/90 bg-black/30 p-2.5 text-white backdrop-blur"
          aria-label={t("swipe.disliked")}
        >
          <ThumbsDownIcon size={34} filled />
        </motion.div>
        <motion.div
          style={{ opacity: skipOpacity, scale: skipScale }}
          className="absolute inset-x-0 bottom-20 mx-auto w-fit rounded-2xl border-[3px] border-white/90 bg-black/30 p-2.5 text-white backdrop-blur"
          aria-label={t("swipe.notSeen")}
        >
          <ArrowUpIcon size={34} strokeWidth={2.6} />
        </motion.div>

        {/* info block */}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded-md bg-white/15 px-2 py-0.5 text-[10px] font-bold text-white/95 backdrop-blur">
                  {title.type === "movie" ? t("card.movie") : t("card.tv")}
                </span>
                <span className="rounded-md bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white/95 backdrop-blur">
                  {title.year}
                </span>
                <span className="flex items-center gap-1 rounded-md bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white/95 backdrop-blur">
                  <StarIcon size={10} filled className="text-accent" />
                  {title.rating.toFixed(1)}
                </span>
              </div>
              <h2 className="truncate text-xl font-bold text-white drop-shadow">
                {title.title[locale]}
              </h2>
              <div className="mt-0.5 flex flex-wrap gap-x-2.5">
                {title.genres.slice(0, 3).map((g) => (
                  <span key={g} className="text-[11px] font-medium text-white/60">
                    {genreLabel(g, locale)}
                  </span>
                ))}
              </div>
            </div>
            <motion.button
              onClick={() => setShowDetails((v) => !v)}
              /**
               * The card is a drag surface, and Framer starts a drag after a
               * few pixels of movement — which a thumb tap always produces. The
               * drag then swallows the click and the card does not flip. The
               * user noticed it before any instrument here did: "if you see a
               * card that doesn't flip, that is also part of the problem."
               *
               * Stopping the pointer here means the drag never begins for a
               * touch that started on this button, so the tap is a tap.
               */
              onPointerDownCapture={(e) => e.stopPropagation()}
              aria-label={t("swipe.details")}
              aria-expanded={showDetails}
              whileTap={{ scale: 0.94 }}
              transition={SPRING_SNAPPY}
              /**
               * A CHEVRON ON A REAL SURFACE, NOT AN ⓘ ON A GREY DISC.
               *
               * The old button was a translucent white circle holding an info
               * glyph, spun 180 degrees when opened. Three things were wrong.
               * An ⓘ promises a definition; this opens a panel, and a chevron
               * is the only glyph everyone already reads as "there is more,
               * downward". Spinning it 180 degrees is motion that describes
               * nothing — a chevron that *flips* says open and closed, a
               * chevron that rotates a full half-turn says neither. And
               * `bg-white/15` over an arbitrary poster is not a material: on a
               * pale poster it disappears, on a dark one it glares. A blurred
               * dark surface with a hairline reads identically over every
               * poster in the catalog, which is the whole job.
               */
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 bg-black/35 text-white backdrop-blur-md transition-colors hover:bg-black/50"
            >
              <motion.span
                animate={{ rotate: showDetails ? 180 : 0 }}
                transition={SPRING_SNAPPY}
                className="grid place-items-center"
              >
                <ChevronDownIcon size={18} strokeWidth={2.2} />
              </motion.span>
            </motion.button>
          </div>

          <AnimatePresence initial={false}>
            {showDetails && (
              <motion.div
                key="details"
                initial={{ opacity: 0, height: 0, y: 10 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, y: 6 }}
                transition={{ duration: SLOW, ease: EASE_OUT }}
                className="overflow-hidden"
              >
                {/*
                  `bg-black/60` is a box drawn on top of a photograph — you can
                  see both, and neither wins. What a modern platform does here
                  is a *material*: heavy blur, low opacity, a hairline of light
                  along the top edge where it catches the poster behind it, and
                  a shadow so it reads as lifted rather than painted on. The
                  poster stays legible through it, which is the point of
                  putting it over the poster at all.
                */}
                <div className="mt-3 rounded-2xl border border-white/12 bg-black/45 p-4 shadow-[0_8px_28px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                  {/* summaries load behind the deck, so a card opened in the
                      first second may not have one yet */}
                  <p className="text-[13px] leading-relaxed text-white/85">
                    {title.overview[locale] || (
                      <span className="text-white/50">…</span>
                    )}
                  </p>
                  {title.people.director && (
                    <p className="mt-2 text-[11px] text-white/60">
                      <span className="font-semibold text-white/80">
                        {title.type === "movie" ? t("card.director") : t("card.creator")}:
                      </span>{" "}
                      {title.people.director}
                    </p>
                  )}
                  {title.people.cast.length > 0 && (
                    <p className="mt-1 text-[11px] text-white/60">
                      <span className="font-semibold text-white/80">{t("card.cast")}:</span>{" "}
                      {title.people.cast.slice(0, 3).join(", ")}
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
