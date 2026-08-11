import type { Transition, Variants } from "framer-motion";

/**
 * One motion vocabulary for the whole app. Every state change — a list
 * filtering, a tile appearing or leaving, a panel opening, a card flying
 * away — pulls its timing from here, so nothing ever "just happens".
 */

/** iOS-style ease: fast out, long gentle settle */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
/** deep ease used for large travel (cards flying off screen) */
export const EASE_SWEEP = [0.32, 0.72, 0, 1] as const;

export const SPRING_SOFT: Transition = {
  type: "spring",
  stiffness: 210,
  damping: 26,
  mass: 0.9,
};

export const SPRING_SNAPPY: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 30,
  mass: 0.7,
};

/** for elements settling into a resting position (card stack, layout shifts) */
export const SPRING_SETTLE: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 30,
  mass: 1,
};

export const FADE_UP: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.25, ease: "easeIn" } },
};

/** grid/list items: rise in, shrink away */
export const TILE: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.94 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: EASE_OUT } },
  exit: {
    opacity: 0,
    scale: 0.86,
    y: -8,
    filter: "blur(4px)",
    transition: { duration: 0.32, ease: "easeIn" },
  },
};

/** container that staggers its children in */
export function staggerContainer(stagger = 0.05, delay = 0.04): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren: stagger, delayChildren: delay } },
    exit: { transition: { staggerChildren: 0.03, staggerDirection: -1 } },
  };
}

/** panels, sheets and overlays */
export const OVERLAY: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.28, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: 0.22, ease: "easeIn" } },
};

export const POP_IN: Variants = {
  hidden: { opacity: 0, scale: 0.5, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: SPRING_SNAPPY },
  exit: { opacity: 0, scale: 0.6, transition: { duration: 0.18, ease: "easeIn" } },
};

/** whole-section switches (empty state ↔ grid ↔ search results) */
export const SECTION: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.22, ease: "easeIn" } },
};

/** press feedback shared by every tappable control */
export const TAP = { scale: 0.94 };
export const HOVER_LIFT = { y: -3 };
