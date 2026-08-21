"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
  type PanInfo,
} from "framer-motion";
import PosterArt from "./PosterArt";
import { StarIcon } from "./ui/Icons";
import { genreLabel } from "@/lib/genres";
import { SPRING_SETTLE } from "@/lib/motion";
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
   * A finger is on the card and moving it.
   *
   * The deck mounts the whole-screen feedback on this and nothing else. It
   * used to infer "is the card off centre" from the position itself, which was
   * true during a drag *and* during the exit animation of a card answered with
   * a button — so a tap lit the entire drag apparatus.
   */
  onDragActive?: (active: boolean) => void;
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
  onDragActive,
  x: sharedX,
  y: sharedY,
}: SwipeCardProps) {
  const [flipped, setFlipped] = useState(false);
  /**
   * THE BACK OF THE CARD DOES NOT EXIST UNTIL SOMEBODY ASKS FOR IT.
   *
   * This is the single most expensive line in the redesign, and it was costing
   * on every card whether or not anyone ever turned one over. Three cards are
   * mounted at all times; each back face carried a full-bleed poster, a second
   * poster thumbnail and a `backdrop-filter` over both. So the deck was paying
   * for six posters and three backdrop filters — and a backdrop filter inside
   * an element that is being transformed every frame has to re-sample
   * everything behind it *every frame*, which is what turned a 60fps drag into
   * the slideshow the user filmed.
   *
   * Nothing about the design changes. The back is built the first time a card
   * is turned over and kept from then on, so the flip is instant on every
   * subsequent tap; the two cards behind the top one simply never build one.
   */
  const [everFlipped, setEverFlipped] = useState(false);
  const [exiting, setExiting] = useState<SwipeAction | null>(null);

  /**
   * EVERY CARD OWNS ITS POSITION FOR ITS WHOLE LIFE. THIS IS NOT A DETAIL.
   *
   * It used to read `const x = sharedX ?? ownX` — the deck's shared motion
   * value for the top card, a private one for the two behind it. Which means
   * that the instant a card was promoted from second to first, the motion
   * value bound to `style.x` **changed identity underneath a live component**.
   *
   * framer-motion sets up its drag gesture against the value it was given at
   * mount. After the swap, a finger dragged the card and the element moved —
   * so it looked fine — but the gesture and the element were no longer talking
   * about the same object: `onDragEnd` never resolved against the rendered
   * position, nothing committed, and the card stayed where the finger left it.
   *
   * That is precisely what the user filmed: the first swipe works, and from
   * the second card onward the deck accepts the drag and does nothing with it.
   * He dragged that Reservoir Dogs card for thirteen seconds. Every drag test
   * I had written dragged exactly one card, so every one of them passed.
   *
   * So: the position is created here, once, and never replaced. The deck still
   * needs to read the top card's position for the whole-screen feedback, and
   * it gets it by mirroring — a copy, never a substitution.
   */
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotate = useTransform(x, [-260, 0, 260], [-16, 0, 16]);

  const isTop = index === 0;
  const activeExit = isTop ? (exiting ?? forcedExit) : null;

  useMotionValueEvent(x, "change", (v) => {
    if (isTop) sharedX?.set(v);
  });
  useMotionValueEvent(y, "change", (v) => {
    if (isTop) sharedY?.set(v);
  });

  /* a card arriving at the front starts face-up and un-dragged */
  useEffect(() => {
    if (isTop) {
      setFlipped(false);
      x.set(0);
      y.set(0);
      sharedX?.set(0);
      sharedY?.set(0);
    }
    // the motion values are stable for the life of this component
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
    if (moved <= TAP_SLOP && Date.now() - p.at < 600) {
      setEverFlipped(true);
      setFlipped((v) => !v);
    }
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
    onDragActive?.(false);
    if (!action) return;
    setExiting(action);
    onSwipe(action);
  }

  /**
   * A CARD THAT HAS BEEN ANSWERED NEVER TOUCHES THE SHARED POSITION AGAIN.
   *
   * There used to be an `exitTarget` here that animated this card's `x` out to
   * 640 as it left. That `x` is the deck's shared motion value — the one the
   * whole-screen drag feedback reads — so the moment anybody *tapped* a verdict
   * button, the exit animation drove the drag apparatus: the screen washed with
   * colour and a giant mark appeared for a gesture that had never happened.
   * The user filmed it, along with the four-second freeze that followed as the
   * phone tried to composite it all.
   *
   * The animation was pointless as well as harmful: this card is removed from
   * the tree in the same frame (`exit` below has a zero duration) and the
   * fly-off the viewer actually watches is `LeavingCards`, an inert copy. So
   * an answered card now simply stops, and the position resets to centre for
   * whichever card is next.
   */
  useEffect(() => {
    if (!activeExit) return;
    x.set(0);
    y.set(0);
    sharedX?.set(0);
    sharedY?.set(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeExit]);

  /**
   * Resting pose in the stack — springs whenever the index changes.
   *
   * NO `filter` HERE, and that absence is worth a paragraph. The cards behind
   * the top one used to be dimmed with `filter: brightness(0.93)`, animated as
   * a card was promoted to the front. A filter is not a compositor property:
   * animating one re-rasterises the whole element — a full-size poster — on
   * every frame, twice over, for the half second after every single swipe.
   * Profiled on a phone-speed CPU it was a large share of the 44% of the time
   * this screen spent in paint rather than in script.
   *
   * The dimming is now a black overlay whose *opacity* animates, which the
   * compositor does on the GPU for free. Identical on screen, and it is the
   * difference between a swipe costing a repaint of the deck and costing
   * nothing at all.
   */
  const restingPose = {
    x: 0,
    y: index * 12,
    scale: 1 - index * 0.05,
    opacity: index > 2 ? 0 : 1,
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
      }}
      animate={restingPose}
      transition={{ ...SPRING_SETTLE, opacity: { duration: 0.35 } }}
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
      onDragStart={() => onDragActive?.(true)}
      onDragEnd={handleDragEnd}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      whileDrag={{ cursor: "grabbing" }}
    >
      {/* what `filter: brightness()` used to do, on the compositor instead */}
      <motion.div
        className="pointer-events-none absolute inset-0 z-10 rounded-[var(--radius-card)] bg-black"
        initial={{ opacity: index === 0 ? 0 : 0.07 }}
        animate={{ opacity: index === 0 ? 0 : 0.07 }}
        transition={{ duration: 0.35 }}
        aria-hidden
      />
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
            {/*
              THESE THREE BADGES USED TO BE FROSTED GLASS.

              `backdrop-blur` on an element inside a card that is transformed
              every frame is the worst shape of this feature: the browser must
              re-sample the pixels behind a moving element on every frame, and
              there were three of them per card across three mounted cards.
              They sit on the dark end of a poster gradient, so a flat scrim
              reads the same and costs nothing.
            */}
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-black/35 px-2 py-0.5 text-[10px] font-bold text-white/95">
                {title.type === "movie" ? t("card.movie") : t("card.tv")}
              </span>
              <span className="rounded-md bg-black/35 px-2 py-0.5 text-[10px] font-semibold text-white/95">
                {title.year}
              </span>
              <span className="flex items-center gap-1 rounded-md bg-black/35 px-2 py-0.5 text-[10px] font-semibold text-white/95">
                <StarIcon size={10} filled className="text-accent" />
                {title.rating.toFixed(1)}
              </span>
            </div>
            <h2 className="text-xl font-bold leading-tight text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.55)]">
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
              className="absolute end-3.5 top-3.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/40"
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
          className="soft-card absolute inset-0 flex flex-col overflow-hidden bg-surface"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          {everFlipped && (
          <>
          {/*
            THE SAME LOOK, WITHOUT A BACKDROP FILTER.

            `backdrop-filter` blurs whatever is painted behind an element, which
            means the browser re-samples the backdrop on every frame the element
            moves — and this element moves with the card. Blurring the *image
            itself* is a filter on a static subtree: the browser rasterises it
            once and reuses the texture. Visually identical, and it is the
            difference between a frame budget and no frame budget.

            A background-image rather than <PosterArt> because this layer is
            decoration: it needs no fallback artwork, no cross-fade and no React
            subtree, and the URL is already in the browser's cache from the
            front of the same card.
          */}
          <div
            className="absolute inset-0 scale-125"
            style={{
              backgroundImage: title.posterPath
                ? `url(https://image.tmdb.org/t/p/w500${title.posterPath})`
                : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(22px)",
            }}
            aria-hidden
          />
          <div
            className="absolute inset-0"
            style={{ background: "rgb(var(--rgb-scrim) / 0.74)" }}
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
                      className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold capitalize"
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
          </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
