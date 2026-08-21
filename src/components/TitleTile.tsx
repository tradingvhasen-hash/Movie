"use client";

import { AnimatePresence, motion } from "framer-motion";
import PosterArt from "./PosterArt";
import { StarIcon } from "./ui/Icons";
import { POP_IN, QUICK, SPRING_SOFT, TILE } from "@/lib/motion";
import { locale } from "@/lib/i18n";
import type { Title } from "@/lib/types";

/**
 * Apple-style tile. Motion is part of the component: it rises in, lifts
 * on hover, compresses on press and shrinks away when removed (needs an
 * AnimatePresence ancestor for the exit to play).
 */
/**
 * NO `layout` PROP, AND THAT IS THE WHOLE PERFORMANCE STORY OF THIS FILE.
 *
 * `layout` asks framer-motion to animate this element between positions when
 * the grid reflows. To do that it must *measure* — and measurement is a forced
 * synchronous layout, on every tile, on every render of the list. Profiled
 * with a 900-title library on a phone-speed CPU, framer's projection system
 * was 18% of all time on the library screen (`measureScroll` alone 799ms), and
 * most of the 34% spent in paint was the reflows it forced.
 *
 * What it bought: when a tile is deleted, the ones after it slide up instead
 * of snapping. That is a fraction of a second on the rarest action in the app,
 * and it was costing every scroll, every keystroke and every arrival on the
 * screen.
 *
 * Everything else stays. Tiles still rise in, still compress under a press,
 * still lift on hover and still shrink away when removed — those are ordinary
 * transforms and opacity, which the compositor does for free.
 */
export default function TitleTile({
  title,
  badge,
  footer,
  overlay,
  onClick,
}: {
  title: Title;
  badge?: React.ReactNode;
  footer?: React.ReactNode;
  /** rendered above the whole tile (e.g. tap actions panel) */
  overlay?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <motion.div
      variants={TILE}
      initial="hidden"
      animate="show"
      exit="exit"
      whileHover={{ y: -5, transition: SPRING_SOFT }}
      whileTap={onClick ? { scale: 0.955, y: 2, transition: { duration: QUICK } } : undefined}
      onClick={onClick}
      className={`group relative overflow-hidden rounded-[20px] bg-surface shadow-[0_4px_14px_rgb(var(--rgb-shadow)/0.07)] transition-shadow duration-300 hover:shadow-[0_14px_30px_rgb(var(--rgb-shadow)/0.14)] active:shadow-[0_1px_5px_rgb(var(--rgb-shadow)/0.1)] ${
        onClick ? "cursor-pointer" : ""
      }`}
    >
      <div className="aspect-[10/14] w-full overflow-hidden">
        <motion.div
          className="h-full w-full"
          whileHover={{ scale: 1.05, transition: { duration: 0.6, ease: "easeOut" } }}
        >
          <PosterArt title={title} sizes="200px" />
        </motion.div>
      </div>

      <AnimatePresence>
        {badge && (
          <motion.div
            key="badge"
            variants={POP_IN}
            initial="hidden"
            animate="show"
            exit="exit"
            className="absolute end-2.5 top-2.5 z-10"
          >
            {badge}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-3 pb-3 pt-2.5">
        <div className="truncate text-[13.5px] font-semibold tracking-tight">
          {title.title[locale]}
        </div>
        <div className="mt-1 flex items-center gap-1 text-xs text-ink-faint">
          {title.year}
          <span className="mx-0.5 text-line">|</span>
          <StarIcon size={11} filled className="text-accent" />
          {title.rating.toFixed(1)}
        </div>
        {footer}
      </div>
      {overlay}
    </motion.div>
  );
}
