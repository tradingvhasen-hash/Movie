"use client";

/**
 * THE WHOLE SCREEN ANSWERS THE GESTURE — WITHOUT ASKING THE GPU FOR A FAVOUR.
 *
 * The look here is unchanged and deliberately so: the user asked for the screen
 * to turn red, to glow, to feel like something. It does. What changed is what
 * it is *made of*.
 *
 * ── WHAT THE FIRST VERSION DID, AND WHAT IT COST ────────────────────────
 *
 * It was built out of the three most expensive things a phone browser can be
 * asked to composite:
 *
 *   `mix-blend-mode: plus-lighter` on a fixed, full-screen layer. Blending
 *   forces everything painted beneath it to be flattened into one buffer
 *   before the blend can happen — so a single blended overlay drags the entire
 *   page, posters included, off the fast path on every frame.
 *
 *   `filter: blur(14px)` on three full-height rims, whose width was animated.
 *   A blur is a re-rasterisation; animating the geometry of a blurred element
 *   re-rasterises it every frame.
 *
 *   An animated `filter` on the mark itself — blur plus two drop-shadows,
 *   interpolated from a motion value, sixty times a second.
 *
 * On the machine I measured with, none of that showed up: headless Chromium
 * composites in software and I was watching JavaScript long-tasks, which were
 * clean. On the user's iPhone the result was a screen frozen for four to five
 * seconds after a swipe, with the wash and a half-blurred mark stuck exactly
 * where the compositor gave up. He filmed it. I had told him it was fixed.
 *
 * ── WHAT THIS VERSION IS MADE OF ────────────────────────────────────────
 *
 * Only two properties are ever animated: `opacity` and `transform`. Both are
 * handled by the compositor without repainting anything, on every browser and
 * every phone. There is no blend mode, no filter, and nothing whose *geometry*
 * changes.
 *
 * The glow that the blurred rim used to draw is now painted into the gradient
 * itself — a gradient is a blur that costs nothing, because it is rasterised
 * once when the layer is created and never again. The halo around the mark is
 * the same trick: a radial gradient behind it rather than a drop-shadow on it.
 *
 * Seven static layers, each fading. Where there were fifteen, blended, blurred
 * and re-rasterising.
 *
 * ── AND IT ONLY EXISTS WHILE A FINGER IS ON THE GLASS ───────────────────
 *
 * The deck mounts this while a drag is in progress and not otherwise. It used
 * to appear on button presses too, because the exiting card animated the same
 * motion values this reads — so tapping "loved" lit the whole drag apparatus
 * for a gesture that never happened. That is fixed at the source: a card
 * leaving no longer touches the shared position at all.
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
const LIKE_TINT = "var(--color-accent)";
const NOPE_TINT = "var(--color-danger)";

export default function ScreenFeedback({
  x,
  y,
  upAction,
}: {
  x: MotionValue<number>;
  y: MotionValue<number>;
  upAction: SwipeAction;
}) {
  /**
   * Three progresses, each 0 → 1 → past 1.
   *
   * Deliberately not clamped at 1: dragging beyond the commit point keeps
   * feeding the bloom, so a hard throw looks harder than a nudge.
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

  /** the vignette is one layer for all three directions, not three */
  const focus = useTransform(() => Math.min(1, Math.max(right.get(), left.get(), up.get())));
  const vignette = useTransform(focus, [0, 1], [0, 0.5], { clamp: true });

  return (
    <div className="pointer-events-none fixed inset-0 z-[45] overflow-hidden" aria-hidden>
      {/*
        The flood is what makes it read as "the screen turned red" rather than
        "there is a glow at the edge". It used to be additive — `plus-lighter`,
        which brightens whatever is beneath it — and additive is prettier over a
        poster. It is also the single most expensive compositing mode a phone
        can be asked for. A flat colour at ordinary opacity tints instead of
        brightening, which at these levels is a difference the eye has to be
        told about, and it costs one composited layer with nothing to blend.
      */}
      <Flood progress={right} tint={LIKE_TINT} />
      <Flood progress={left} tint={NOPE_TINT} />
      <Flood progress={up} tint={UP_TINT} />

      <Wash progress={right} tint={LIKE_TINT} at="102% 46%" />
      <Wash progress={left} tint={NOPE_TINT} at="-2% 46%" />
      <Wash progress={up} tint={UP_TINT} at="50% -2%" />

      <motion.div
        className="absolute inset-0 will-change-[opacity]"
        style={{
          opacity: vignette,
          background:
            "radial-gradient(115% 88% at 50% 50%, transparent 32%, rgb(var(--rgb-scrim) / 0.9) 100%)",
        }}
      />

      <Mark progress={right} tint={LIKE_TINT} side="right" action="liked" />
      <Mark progress={left} tint={NOPE_TINT} side="left" action="disliked" />
      <Mark progress={up} tint={UP_TINT} side="top" action={upAction} />
    </div>
  );
}

/**
 * The light: a bloom from the edge the card is heading for.
 *
 * The bright stop at the very edge is what the blurred rim layer used to draw
 * separately — a gradient can be its own glow, and unlike a filter it is
 * painted once into the layer and then only faded.
 */
function Wash({
  progress,
  tint,
  at,
}: {
  progress: MotionValue<number>;
  tint: string;
  at: string;
}) {
  const opacity = useTransform(progress, [0, 1, 1.6], [0, 0.92, 1], { clamp: true });
  const scale = useTransform(progress, [0, 1.6], [1.2, 1], { clamp: true });

  return (
    <motion.div
      className="absolute inset-0 will-change-[opacity,transform]"
      style={{
        opacity,
        scale,
        background:
          `radial-gradient(96% 82% at ${at}, ${tint} 0%, ` +
          `color-mix(in srgb, ${tint} 74%, transparent) 26%, ` +
          `color-mix(in srgb, ${tint} 42%, transparent) 54%, ` +
          `color-mix(in srgb, ${tint} 14%, transparent) 74%, transparent 88%)`,
      }}
    />
  );
}

/**
 * The verdict's colour over everything, card included — the literal "the
 * screen turns red". It starts at 45% of the way to the commit point, because
 * the whole screen changing colour is a statement and a statement made at the
 * first millimetre of a drag is noise.
 */
function Flood({ progress, tint }: { progress: MotionValue<number>; tint: string }) {
  const opacity = useTransform(progress, [0.45, 1, 1.4], [0, 0.26, 0.34], { clamp: true });
  return (
    <motion.div
      className="absolute inset-0 will-change-[opacity]"
      style={{ opacity, background: tint }}
    />
  );
}

/**
 * One mark, at the edge the card is going to, reaching full size exactly at
 * the commit point — the moment worth feeling.
 *
 * The halo behind it is a static radial gradient rather than a drop-shadow,
 * for the same reason the rim is gone: a filter on a moving element is a
 * repaint, and a gradient on a fading element is not.
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

  const place =
    side === "top"
      ? "inset-x-0 top-[10vh] justify-center"
      : side === "right"
        ? "inset-y-0 right-[4vw] items-center justify-end"
        : "inset-y-0 left-[4vw] items-center justify-start";

  return (
    <motion.div
      className={`absolute flex will-change-[opacity,transform] ${place}`}
      style={{ opacity, scale, color: tint }}
    >
      <span className="relative grid h-[150px] w-[150px] place-items-center">
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle, color-mix(in srgb, ${tint} 55%, transparent) 0%, transparent 68%)`,
          }}
        />
        <span className="relative">
          <Icon size={96} filled strokeWidth={1.6} />
        </span>
      </span>
    </motion.div>
  );
}
