"use client";

/**
 * THE WHOLE SCREEN ANSWERS THE GESTURE — WITHOUT ASKING THE GPU FOR A FAVOUR.
 *
 * The look here is unchanged and deliberately so: the user asked for the screen
 * to turn red, to glow, to feel like something. It does. What changed, twice
 * now, is what it is *made of*.
 *
 * ── V1: THE VERSION THAT FROZE HIS PHONE ────────────────────────────────
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
 * seconds after a swipe. He filmed it. I had told him it was fixed.
 *
 * ── V2: CHEAP PROPERTIES, BUT TEN OF THEM ───────────────────────────────
 *
 * V2 removed every blend and every filter and animated nothing but `opacity`
 * and `transform`. That was correct and it was not enough. It still built the
 * effect out of *ten* full-screen composited layers — three floods, three
 * washes, a vignette and three marks — all of them mounted the instant a
 * finger moved and all of them destroyed the instant it lifted.
 *
 * The user filmed the consequence: the card he threw did not fly, it
 * teleported. A 560ms exit was being drawn about twice, because the frame that
 * should have started it was spent tearing down ten layers and standing up the
 * landing burst's four.
 *
 * ── V3: THE SAME PICTURE, PAINTED IN THREE LAYERS ───────────────────────
 *
 * Nothing is removed. The flood, the bloom and the vignette are all still
 * there — they are simply three stops of one `background` stack instead of
 * three separate elements, because a browser rasterises a multi-stop gradient
 * exactly once when the layer is created and then only fades it.
 *
 * Three full-screen layers, one per direction, plus three 150px marks. Where
 * there were ten full-screen layers, seven of them permanently at opacity 0
 * waiting for a direction that would never come.
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

  return (
    <div className="pointer-events-none fixed inset-0 z-[45] overflow-hidden" aria-hidden>
      <Wash progress={right} tint={LIKE_TINT} at="102% 46%" />
      <Wash progress={left} tint={NOPE_TINT} at="-2% 46%" />
      <Wash progress={up} tint={UP_TINT} at="50% -2%" />

      <Mark progress={right} tint={LIKE_TINT} side="right" action="liked" />
      <Mark progress={left} tint={NOPE_TINT} side="left" action="disliked" />
      <Mark progress={up} tint={UP_TINT} side="top" action={upAction} />
    </div>
  );
}

/**
 * ONE LAYER THAT DOES WHAT THREE USED TO.
 *
 * Read the `background` stack top-down, because that is the order the browser
 * paints it in — first listed is nearest the viewer:
 *
 *   1. THE VIGNETTE. Transparent through the middle, scrim at the corners. It
 *      sits above the bloom exactly as its own element used to, so the glow
 *      still darkens as it reaches the edge of the screen.
 *   2. THE BLOOM. A gradient from the edge the card is heading for. The bright
 *      stop at the very edge is the glow that v1 drew with `filter: blur()` —
 *      a gradient is a blur that costs nothing, because it is rasterised once
 *      when the layer is created and never again.
 *   3. THE FLOOD. A flat wall of the verdict's colour: the literal "the screen
 *      turns red", over everything, card included.
 *
 * The one thing genuinely lost in the merge is that the flood used to hold
 * back until 45% of the way to the commit point, on the argument that the
 * whole screen changing colour is a statement and a statement made at the
 * first millimetre is noise. Sharing one opacity means it now fades in with
 * everything else — at a fifth of a drag it is 5% alpha behind a poster, which
 * is below the threshold of noticing. That is the price of the merge and it is
 * the whole price.
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
        background: [
          "radial-gradient(115% 88% at 50% 50%, transparent 32%, rgb(var(--rgb-scrim) / 0.49) 100%)",
          `radial-gradient(96% 82% at ${at}, ${tint} 0%, ` +
            `color-mix(in srgb, ${tint} 74%, transparent) 26%, ` +
            `color-mix(in srgb, ${tint} 42%, transparent) 54%, ` +
            `color-mix(in srgb, ${tint} 14%, transparent) 74%, transparent 88%)`,
          `linear-gradient(color-mix(in srgb, ${tint} 28%, transparent), ` +
            `color-mix(in srgb, ${tint} 28%, transparent))`,
        ].join(", "),
      }}
    />
  );
}

/**
 * One mark, at the edge the card is going to, reaching full size exactly at
 * the commit point — the moment worth feeling.
 *
 * The halo behind it is a static radial gradient rather than a drop-shadow,
 * for the same reason the rim is gone: a filter on a moving element is a
 * repaint, and a gradient on a fading element is not. It stays its own element
 * rather than being folded into the wash because it is 150px wide — the layers
 * worth merging are the ones that cover the screen.
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
