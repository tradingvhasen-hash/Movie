"use client";

/**
 * THE WHOLE SCREEN ANSWERS THE GESTURE.
 *
 * The user, after three attempts at this: "swiping still feels cheap… I don't
 * feel anything." Every previous version put the feedback *on the card* — a
 * stamp in the corner, a burst after the fact — and a stamp in a corner is a
 * label, not a sensation. What he asked for, in his words, was the screen
 * turning red, glowing, light, neon, and the effects flowing into each other
 * as the thumb moves.
 *
 * Three ideas, and they are the ones every platform uses for a gesture that is
 * supposed to feel like something:
 *
 *   1. IT IS CONTINUOUS, NOT TRIGGERED. Everything here is a pure function of
 *      the card's position. There is no state, no threshold event, no timer:
 *      move the thumb a millimetre and the light moves a millimetre. That is
 *      the entire difference between an interface that responds and one that
 *      announces. It also means the transition between two directions is free
 *      — drag right and the blue rises as the red falls, because both are
 *      reading the same number.
 *
 *   2. IT IS LIGHT, NOT OBJECTS. A wash from the edge, a rim of glow, a
 *      vignette closing in. Light has no edges to look cheap; a graphic always
 *      can.
 *
 *   3. IT COMMITS VISIBLY. Past the point where the card will actually go, the
 *      glow steps up and the mark reaches full size. Feeling the moment the
 *      verdict locks in — before letting go — is what makes the gesture
 *      confident rather than hopeful.
 *
 * ── WHY IT IS MOUNTED TWICE ─────────────────────────────────────────────
 *
 * The first version of this was a single layer painted behind the card stack,
 * and in a browser at 390px it was almost invisible: the card is 80% of the
 * width and sits exactly where the light was brightest, so the effect only
 * showed in the strips of background either side of it — and dragging right
 * moves the card right, covering the very edge the glow was coming from.
 *
 * So it is two layers around the card rather than one behind it:
 *
 *   BACK   the wash and the vignette, under the stack, colouring the room the
 *          card is in
 *   FRONT  the rim of light at the screen edge and the verdict mark, over the
 *          stack, in `plus-lighter` so they read as light falling *on* the
 *          card rather than as a panel covering it
 *
 * `plus-lighter` is the piece doing the work. A normal-blended overlay on a
 * poster is a sticker; an additive one is illumination, and illumination is
 * what a screen can actually do that paper cannot.
 */
import { motion, useTransform, type MotionValue } from "framer-motion";
import { ArrowUpIcon, EyeIcon, HeartIcon, ThumbsDownIcon } from "./ui/Icons";
import { SWIPE_UP_THRESHOLD, SWIPE_X_THRESHOLD } from "./SwipeCard";
import type { SwipeAction } from "@/lib/types";

const GLYPH = {
  liked: HeartIcon,
  disliked: ThumbsDownIcon,
  not_seen: ArrowUpIcon,
  seen: EyeIcon,
} as const;

const UP_TINT = "var(--color-skip)";

export default function ScreenFeedback({
  x,
  y,
  upAction,
  layer,
  enabled = true,
}: {
  x: MotionValue<number>;
  y: MotionValue<number>;
  upAction: SwipeAction;
  layer: "back" | "front";
  enabled?: boolean;
}) {
  /**
   * Three progresses, each 0 → 1 → past 1.
   *
   * They are deliberately *not* clamped at 1: dragging beyond the commit point
   * keeps feeding the bloom, so a hard throw looks harder than a nudge. The
   * consumers clamp where clamping matters.
   */
  const right = useTransform(x, [10, SWIPE_X_THRESHOLD], [0, 1], { clamp: false });
  const left = useTransform(x, [-10, -SWIPE_X_THRESHOLD], [0, 1], { clamp: false });
  /* the upward wash yields to a sideways one, so a diagonal drag reads as the
     direction it is actually going rather than as both at once */
  const up = useTransform(() => {
    const dy = Math.max(0, (-y.get() - 16) / (SWIPE_UP_THRESHOLD - 16));
    const sideways = Math.min(1, Math.abs(x.get()) / SWIPE_X_THRESHOLD);
    return dy * (1 - sideways);
  });

  if (!enabled) return null;

  if (layer === "back") {
    return (
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <Wash progress={right} tint="var(--color-accent)" origin="88% 46%" />
        <Wash progress={left} tint="var(--color-danger)" origin="12% 46%" />
        <Wash progress={up} tint={UP_TINT} origin="50% 8%" />
      </div>
    );
  }

  return (
    <>
      {/* light, added to whatever is under it */}
      <div
        className="pointer-events-none fixed inset-0 z-[45] overflow-hidden"
        style={{ mixBlendMode: "plus-lighter" }}
        aria-hidden
      >
        <Rim progress={right} tint="var(--color-accent)" side="right" />
        <Rim progress={left} tint="var(--color-danger)" side="left" />
        <Rim progress={up} tint={UP_TINT} side="top" />

        <Flood progress={right} tint="var(--color-accent)" />
        <Flood progress={left} tint="var(--color-danger)" />
        <Flood progress={up} tint={UP_TINT} />
      </div>

      {/*
        The mark is NOT additive.

        It was, in the first version, and on a bright poster an additive glyph
        washed out into a pale smear — the one element that has to be legible
        on all fifteen thousand posters in the catalog was the one element
        whose legibility depended on the poster. Solid colour with a glow
        around it reads on black and on white alike, which is why every neon
        sign ever built is drawn exactly this way.
      */}
      <div className="pointer-events-none fixed inset-0 z-[46] overflow-hidden" aria-hidden>
        <Mark progress={right} tint="var(--color-accent)" side="right" action="liked" />
        <Mark progress={left} tint="var(--color-danger)" side="left" action="disliked" />
        <Mark progress={up} tint={UP_TINT} side="top" action={upAction} />
      </div>
    </>
  );
}

/**
 * The verdict's colour over the entire screen, card included.
 *
 * Low alpha and additive, so it lifts everything a shade toward the colour
 * rather than covering anything — the literal "the screen turns red" the user
 * described. It starts late, at 60% of the way to the commit point, because
 * the whole screen changing colour is a statement and a statement made at the
 * first millimetre of a drag is noise.
 */
function Flood({ progress, tint }: { progress: MotionValue<number>; tint: string }) {
  const opacity = useTransform(progress, [0.6, 1, 1.4], [0, 0.16, 0.24], { clamp: true });
  return (
    <motion.div className="absolute inset-0" style={{ opacity, background: tint }} />
  );
}

/**
 * The room the card is in: a bloom from the edge it is heading for, and a
 * vignette closing in from everywhere else so the eye is pulled that way.
 */
function Wash({
  progress,
  tint,
  origin,
}: {
  progress: MotionValue<number>;
  tint: string;
  origin: string;
}) {
  const opacity = useTransform(progress, [0, 1, 1.6], [0, 0.85, 1], { clamp: true });
  const vignette = useTransform(progress, [0, 1], [0, 0.5], { clamp: true });
  const scale = useTransform(progress, [0, 1.6], [1.3, 1], { clamp: true });

  return (
    <>
      <motion.div
        className="absolute inset-0"
        style={{
          opacity,
          scale,
          background: `radial-gradient(110% 92% at ${origin}, ${tint} 0%, color-mix(in srgb, ${tint} 52%, transparent) 40%, transparent 78%)`,
        }}
      />
      <motion.div
        className="absolute inset-0"
        style={{
          opacity: vignette,
          background:
            "radial-gradient(115% 88% at 50% 50%, transparent 32%, rgb(var(--rgb-scrim) / 0.9) 100%)",
        }}
      />
    </>
  );
}

/**
 * A rim of light along the edge the card is going to.
 *
 * This is the part that survives the card covering the screen: it hugs the
 * viewport, not the card, so it is visible however far the poster has been
 * dragged over it — and being additive, it brightens whatever it lands on
 * instead of hiding it.
 */
function Rim({
  progress,
  tint,
  side,
}: {
  progress: MotionValue<number>;
  tint: string;
  side: "left" | "right" | "top";
}) {
  const opacity = useTransform(progress, [0, 1, 1.5], [0, 0.8, 1], { clamp: true });
  const size = useTransform(progress, [0, 1.5], [22, 96], { clamp: true });
  const dim = useTransform(size, (s) => `${s}px`);

  const geometry =
    side === "top"
      ? { top: 0, left: 0, right: 0, height: dim }
      : side === "left"
        ? { top: 0, bottom: 0, left: 0, width: dim }
        : { top: 0, bottom: 0, right: 0, width: dim };

  const direction =
    side === "top" ? "to bottom" : side === "left" ? "to right" : "to left";

  return (
    <motion.div
      className="absolute"
      style={{
        ...geometry,
        opacity,
        background: `linear-gradient(${direction}, ${tint} 0%, color-mix(in srgb, ${tint} 40%, transparent) 45%, transparent 100%)`,
        filter: "blur(14px)",
      }}
    />
  );
}

/**
 * One mark, at the edge the card is going to.
 *
 * It is allowed to sit over the poster because it is additive: what a person
 * sees is the shape burned into the image in the verdict's own colour, which
 * is both unmistakable and impossible to confuse with a sticker. It reaches
 * full size exactly at the commit point — the moment worth feeling.
 */
function Mark({
  progress,
  tint,
  side,
  action,
}: {
  progress: MotionValue<number>;
  tint: string;
  side: "left" | "right" | "top";
  action: SwipeAction;
}) {
  const Icon = GLYPH[action];
  const opacity = useTransform(progress, [0.14, 0.7], [0, 1], { clamp: true });
  const scale = useTransform(progress, [0.14, 1, 1.3], [0.5, 1, 1.1], { clamp: true });
  const blur = useTransform(progress, [0.14, 0.78], [12, 0], { clamp: true });
  const filter = useTransform(
    blur,
    (b) =>
      `blur(${b}px) drop-shadow(0 0 30px ${tint}) drop-shadow(0 0 8px ${tint}) drop-shadow(0 2px 10px rgba(0,0,0,0.45))`
  );

  const place =
    side === "top"
      ? "inset-x-0 top-[13vh] justify-center"
      : side === "right"
        ? "inset-y-0 right-[7vw] items-center justify-end"
        : "inset-y-0 left-[7vw] items-center justify-start";

  return (
    <motion.div
      className={`absolute flex ${place}`}
      style={{ opacity, scale, filter, color: tint }}
    >
      <Icon size={96} filled strokeWidth={1.6} />
    </motion.div>
  );
}
