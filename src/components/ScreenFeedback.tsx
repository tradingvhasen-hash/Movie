"use client";

/**
 * THE WHOLE SCREEN ANSWERS THE GESTURE — FROM BEHIND THE CARD.
 *
 * ── V1: THE VERSION THAT FROZE HIS PHONE ────────────────────────────────
 *
 * Built out of the three most expensive things a phone browser can be asked to
 * composite: `mix-blend-mode: plus-lighter` on a fixed full-screen layer, which
 * forces everything beneath it to be flattened before the blend can happen;
 * `filter: blur(14px)` on three full-height rims whose width was animated, so
 * they re-rasterised every frame; and an animated `filter` on the mark itself.
 * On my machine none of it showed up — headless Chromium composites in software
 * and I was watching JavaScript. On the user's iPhone the screen froze for four
 * seconds after a swipe. He filmed it. I had told him it was fixed.
 *
 * ── V2: CHEAP PROPERTIES, BUT TEN OF THEM ───────────────────────────────
 *
 * Only `opacity` and `transform` animated, which was correct and insufficient:
 * the effect was still ten full-screen composited layers, all created the
 * instant a finger moved and destroyed the instant it lifted. The card he threw
 * did not fly, it teleported — the frame that should have started its exit was
 * spent tearing those layers down.
 *
 * ── V3: THREE LAYERS, SAME PICTURE ──────────────────────────────────────
 *
 * The flood, the bloom and the vignette became three stops of one `background`
 * stack instead of three elements. A browser rasterises a multi-stop gradient
 * once and then only fades it.
 *
 * ── V4: BEHIND THE CARD, WHICH IS WHERE IT BELONGED ──────────────────────
 *
 * The user, on the version that finally performed: "at the beginning it is
 * beautiful, maybe for the first ten seconds, then it starts hurting your eyes.
 * The glow is so powerful it covers the whole page. It is on top of the card
 * you are swiping, on top of the other cards, on top of the buttons — you swipe
 * a card and suddenly the whole page disappears into the colour."
 *
 * Two separate faults and he separated them correctly.
 *
 * IT WAS IN FRONT. `z-[45]` put it above the deck, the buttons and the heading,
 * so the answer to "which card am I throwing" was hidden by the feedback about
 * throwing it. It is `z-0` now: the deck, the buttons and the name all carry
 * `z-10`, so the colour blooms *behind* the card and the card stays legible
 * against it. That is also simply the better picture — light behind a subject
 * reads as depth; light over a subject reads as an overlay.
 *
 * IT WAS TOO STRONG. The flat flood dropped from 28% to 18% and the peak
 * opacity from 0.92 to 0.84. Both were tuned when the layer sat in front and
 * had to survive being looked through; behind the card it does not.
 *
 * AND THE MARK IS GONE FROM HERE. A 150px glyph floating over the poster was
 * the other half of what he disliked — "I don't like how it appears at the top
 * of the card, I don't like anything about it". Behind the card it would simply
 * be invisible, so it did not move: it was replaced. The verdict is now a small
 * stamp on the card's own corner, which is a thing the card carries rather than
 * a thing dropped on top of it. See `VerdictStamp` in SwipeCard.
 */
import { motion, useTransform, type MotionValue } from "framer-motion";
import { SWIPE_UP_THRESHOLD, SWIPE_X_THRESHOLD } from "./SwipeCard";
import type { SwipeAction } from "@/lib/types";

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
  /** kept in the signature: the deck decides what up means, not this layer */
  upAction?: SwipeAction;
}) {
  void upAction;
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
    <div
      /* a stable hook for the guards. They used to select on `z-[45]`, so
         moving the layer behind the deck made two of them report the app
         broken when only their selector was. A test that tracks a Tailwind
         class is a test that fails on a design change. */
      data-wash
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      <Wash progress={right} tint={LIKE_TINT} at="102% 46%" />
      <Wash progress={left} tint={NOPE_TINT} at="-2% 46%" />
      <Wash progress={up} tint={UP_TINT} at="50% -2%" />
    </div>
  );
}

/**
 * ONE LAYER THAT DOES WHAT THREE USED TO.
 *
 * Read the `background` stack top-down, because that is the order the browser
 * paints it in — first listed is nearest the viewer:
 *
 *   1. THE VIGNETTE. Transparent through the middle, scrim at the corners, so
 *      the glow still darkens as it reaches the edge of the screen.
 *   2. THE BLOOM. A gradient from the edge the card is heading for. The bright
 *      stop at the very edge is the glow that v1 drew with `filter: blur()` —
 *      a gradient is a blur that costs nothing, because it is rasterised once
 *      when the layer is created and never again.
 *   3. THE FLOOD. A flat wall of the verdict's colour: the literal "the screen
 *      turns red", now under the card rather than over it.
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
  const opacity = useTransform(progress, [0, 1, 1.6], [0, 0.84, 0.92], { clamp: true });
  const scale = useTransform(progress, [0, 1.6], [1.2, 1], { clamp: true });

  return (
    <motion.div
      className="absolute inset-0 will-change-[opacity,transform]"
      style={{
        opacity,
        scale,
        background: [
          "radial-gradient(115% 88% at 50% 50%, transparent 32%, rgb(var(--rgb-scrim) / 0.42) 100%)",
          `radial-gradient(96% 82% at ${at}, ${tint} 0%, ` +
            `color-mix(in srgb, ${tint} 70%, transparent) 26%, ` +
            `color-mix(in srgb, ${tint} 38%, transparent) 54%, ` +
            `color-mix(in srgb, ${tint} 12%, transparent) 74%, transparent 88%)`,
          `linear-gradient(color-mix(in srgb, ${tint} 18%, transparent), ` +
            `color-mix(in srgb, ${tint} 18%, transparent))`,
        ].join(", "),
      }}
    />
  );
}
