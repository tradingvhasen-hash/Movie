"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
  type PanInfo,
} from "framer-motion";
import PosterArt from "./PosterArt";
import { StarIcon } from "./ui/Icons";
import { genreLabel } from "@/lib/genres";
import { EASE_SWEEP, SPRING_SETTLE } from "@/lib/motion";
import { locale, t } from "@/lib/i18n";
import type { SwipeAction, Title } from "@/lib/types";

export const SWIPE_X_THRESHOLD = 100;
export const SWIPE_UP_THRESHOLD = 120;

/**
 * A tap is a press that went nowhere.
 *
 * 14px rather than the 4–5px a mouse needs: a thumb on glass rolls while it
 * presses, and a threshold tuned on a trackpad turns half of a real person's
 * taps into one-pixel drags that do nothing. It is still an order of magnitude
 * under the 100px a swipe has to travel to commit, so nothing that was meant
 * as a gesture can be mistaken for a tap.
 */
const TAP_SLOP = 14;

export interface SwipeCardProps {
  title: Title;
  /** 0 = top of stack */
  index: number;
  onSwipe: (action: SwipeAction) => void;
  /** externally-triggered exit (buttons/keyboard): action or null */
  forcedExit: SwipeAction | null;
  /** what an upward swipe records — a user setting */
  upAction: SwipeAction;
  /**
   * The top card's position, owned by the deck.
   *
   * It lives up there rather than here because the *screen* reacts to this
   * drag, not just the card. See ScreenFeedback.
   */
  x?: MotionValue<number>;
  y?: MotionValue<number>;
}

export default function SwipeCard({
  title,
  index,
  onSwipe,
  forcedExit,
  upAction,
  x: sharedX,
  y: sharedY,
}: SwipeCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [exiting, setExiting] = useState<SwipeAction | null>(null);

  const ownX = useMotionValue(0);
  const ownY = useMotionValue(0);
  const x = sharedX ?? ownX;
  const y = sharedY ?? ownY;

  const rotate = useTransform(x, [-260, 0, 260], [-16, 0, 16]);

  const isTop = index === 0;
  const activeExit = isTop ? (exiting ?? forcedExit) : null;

  /* a card arriving at the front starts face-up and un-dragged */
  useEffect(() => {
    if (isTop) {
      setFlipped(false);
      x.set(0);
      y.set(0);
    }
    // the motion values are stable for the life of the deck
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTop, title.id]);

  /**
   * TAP TO TURN THE CARD OVER.
   *
   * There used to be a chevron in the corner that slid a translucent panel up
   * over the bottom of the poster. The user's verdict, twice: "still bad… all
   * you are doing is changing an icon."
   *
   * He was right, and the reason is that a panel over a poster is the *same*
   * object trying to be two things at once — you can see the film and the text
   * simultaneously, and neither wins. The thing this product is built out of
   * is a card. Cards have backs. So the whole card turns over: poster on the
   * front, everything the poster cannot say on the back, on a real surface
   * with room to breathe. Nothing overlaps anything.
   *
   * And it costs no control at all. The affordance is the card itself — tap
   * it — which is why the corner button is gone rather than redrawn.
   */
  const press = useRef<{ px: number; py: number; at: number } | null>(null);

  function handlePointerDown(e: React.PointerEvent) {
    press.current = { px: e.clientX, py: e.clientY, at: Date.now() };
  }

  function handlePointerUp(e: React.PointerEvent) {
    const p = press.current;
    press.current = null;
    if (!p || !isTop || activeExit) return;
    const moved = Math.hypot(e.clientX - p.px, e.clientY - p.py);
    if (moved <= TAP_SLOP && Date.now() - p.at < 600) setFlipped((v) => !v);
  }

  /**
   * A gesture commits the moment the finger lifts, not when the animation
   * ends. The card is removed from the queue immediately and the deck plays
   * the fly-off over the top of a card React has already dropped.
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
        ? upAction
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
        : activeExit
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
      style={{
        x,
        y,
        rotate,
        zIndex: 30 - index,
        pointerEvents: isTop ? "auto" : "none",
        perspective: 1400,
      }}
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
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      whileDrag={{ cursor: "grabbing" }}
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 30, mass: 0.9 }}
      >
        {/* ── front: the poster, and only what a poster cannot say ── */}
        <div
          className="soft-card absolute inset-0 overflow-hidden"
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
        >
          <PosterArt title={title} />
          <div className="card-sheen absolute inset-0" />

          <div className="absolute inset-x-0 bottom-0 p-4">
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
            <h2 className="text-xl font-bold leading-tight text-white drop-shadow">
              {title.title[locale]}
            </h2>
            <div className="mt-1 flex flex-wrap gap-x-2.5">
              {title.genres.slice(0, 3).map((g) => (
                <span key={g} className="text-[11px] font-medium text-white/60">
                  {genreLabel(g, locale)}
                </span>
              ))}
            </div>
          </div>

          {/*
            The only hint that there is a back, and it is a hint rather than a
            control: two stacked lines in the corner, the universal "there is
            more written here". It never needs to be pressed — the whole card
            is the target — so it is 22px of ink instead of a 36px button.
          */}
          {isTop && (
            <motion.span
              className="absolute end-3.5 top-3.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/30 backdrop-blur-md"
              animate={{ opacity: [0.45, 0.9, 0.45] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
              aria-hidden
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round">
                <path d="M5 8.5h14M5 13h10M5 17.5h6" />
              </svg>
            </motion.span>
          )}
        </div>

        {/* ── back: everything the poster cannot say ──
            The poster does not disappear when the card turns; it goes out of
            focus behind the text. A back face made of flat surface colour was
            the first version and it was disorienting — you could no longer
            tell *which* film you had turned over without reading the title,
            and the card lost every bit of the colour that made it recognisable
            a second earlier. The blurred artwork keeps the identity, fills the
            space a short synopsis leaves empty, and is the same trick a phone
            uses behind an album on a now-playing screen. */}
        <div
          className="soft-card absolute inset-0 flex flex-col overflow-hidden"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <div className="absolute inset-0 scale-125" aria-hidden>
            <PosterArt title={title} sizes="380px" />
          </div>
          <div
            className="absolute inset-0 backdrop-blur-2xl"
            style={{ background: "rgb(var(--rgb-scrim) / 0.72)" }}
            aria-hidden
          />

          <div className="relative flex h-full flex-col p-5 text-white">
            <div className="flex shrink-0 gap-3.5">
              <div className="h-[92px] w-[62px] shrink-0 overflow-hidden rounded-xl shadow-[0_6px_18px_rgb(0_0_0/0.4)]">
                <PosterArt title={title} sizes="120px" className="h-full w-full" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-[19px] font-bold leading-tight tracking-tight">
                  {title.title[locale]}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] font-semibold text-white/60">
                  <span>{title.year}</span>
                  <span>·</span>
                  <span>{title.type === "movie" ? t("card.movie") : t("card.tv")}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <StarIcon size={11} filled className="text-accent-soft" />
                    {title.rating.toFixed(1)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {title.genres.slice(0, 3).map((g) => (
                    <span
                      key={g}
                      className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold capitalize backdrop-blur-sm"
                    >
                      {genreLabel(g, locale)}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* the one scrolling surface inside the stage — see globals.css */}
            <div className="card-back-scroll mt-5 min-h-0 flex-1 overflow-y-auto">
              <p className="text-[14px] leading-relaxed text-white/85">
                {title.overview[locale] || "…"}
              </p>
            </div>

            <div className="mt-4 shrink-0 space-y-1 border-t border-white/15 pt-3 text-[11.5px] text-white/60">
              {title.people.director && (
                <p>
                  <span className="font-semibold text-white/85">
                    {title.type === "movie" ? t("card.director") : t("card.creator")}
                  </span>{" "}
                  {title.people.director}
                </p>
              )}
              {title.people.cast.length > 0 && (
                <p>
                  <span className="font-semibold text-white/85">{t("card.cast")}</span>{" "}
                  {title.people.cast.slice(0, 3).join(", ")}
                </p>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
