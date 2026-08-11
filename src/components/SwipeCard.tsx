"use client";

import { useState } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import PosterArt from "./PosterArt";
import { ArrowUpIcon, HeartIcon, InfoIcon, StarIcon, ThumbsDownIcon } from "./ui/Icons";
import { genreLabel } from "@/lib/genres";
import type { SwipeAction, Title } from "@/lib/types";

export const SWIPE_X_THRESHOLD = 110;
export const SWIPE_UP_THRESHOLD = 130;

export interface SwipeCardProps {
  title: Title;
  /** 0 = top of stack */
  index: number;
  onSwipe: (action: SwipeAction) => void;
  /** externally-triggered exit (buttons/keyboard): action or null */
  forcedExit: SwipeAction | null;
}

export default function SwipeCard({ title, index, onSwipe, forcedExit }: SwipeCardProps) {
  const locale = useLocale() as "ar" | "en";
  const t = useTranslations();
  const [showDetails, setShowDetails] = useState(false);
  const [exiting, setExiting] = useState<SwipeAction | null>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-250, 250], [-14, 14]);
  const likeOpacity = useTransform(x, [30, SWIPE_X_THRESHOLD], [0, 1]);
  const nopeOpacity = useTransform(x, [-SWIPE_X_THRESHOLD, -30], [1, 0]);
  const skipOpacity = useTransform(y, [-SWIPE_UP_THRESHOLD, -40], [1, 0]);

  const isTop = index === 0;
  const activeExit = isTop ? (exiting ?? forcedExit) : null;

  function handleDragEnd(_: unknown, info: PanInfo) {
    const px = info.offset.x + info.velocity.x / 8;
    const py = info.offset.y + info.velocity.y / 8;
    if (py < -SWIPE_UP_THRESHOLD && Math.abs(py) > Math.abs(px)) {
      setExiting("not_seen");
    } else if (px > SWIPE_X_THRESHOLD) {
      setExiting("liked");
    } else if (px < -SWIPE_X_THRESHOLD) {
      setExiting("disliked");
    }
  }

  const exitTarget =
    activeExit === "liked"
      ? { x: 600, y: -40, rotate: 18, opacity: 0 }
      : activeExit === "disliked"
        ? { x: -600, y: -40, rotate: -18, opacity: 0 }
        : activeExit === "not_seen"
          ? { x: 0, y: -700, rotate: 0, opacity: 0 }
          : null;

  return (
    <motion.div
      className="absolute inset-0 touch-none select-none"
      style={{
        x,
        y,
        rotate,
        zIndex: 30 - index,
        pointerEvents: isTop ? "auto" : "none",
      }}
      initial={{ scale: 1 - index * 0.045, y: index * 14, opacity: index > 2 ? 0 : 1 }}
      animate={
        exitTarget ?? {
          x: 0,
          scale: 1 - index * 0.045,
          y: index * 14,
          opacity: index > 2 ? 0 : 1,
        }
      }
      transition={
        exitTarget
          ? { duration: 0.45, ease: [0.32, 0.72, 0, 1] }
          : { type: "spring", stiffness: 260, damping: 26 }
      }
      onAnimationComplete={() => {
        if (activeExit) onSwipe(activeExit);
      }}
      drag={isTop && !activeExit}
      dragElastic={0.9}
      onDragEnd={handleDragEnd}
      whileDrag={{ scale: 1.02 }}
    >
      <div className="soft-card relative h-full w-full overflow-hidden">
        <PosterArt title={title} />

        {/* bottom info gradient */}
        <div className="card-sheen absolute inset-0" />

        {/* direction stamps — icons instead of words */}
        <motion.div
          style={{ opacity: likeOpacity }}
          className="absolute start-5 top-6 rotate-[-8deg] rounded-2xl border-4 border-accent bg-white/85 p-3 text-accent backdrop-blur"
          aria-label={t("swipe.liked")}
        >
          <HeartIcon size={40} filled />
        </motion.div>
        <motion.div
          style={{ opacity: nopeOpacity }}
          className="absolute end-5 top-6 rotate-[8deg] rounded-2xl border-4 border-white/90 bg-black/30 p-3 text-white backdrop-blur"
          aria-label={t("swipe.disliked")}
        >
          <ThumbsDownIcon size={40} filled />
        </motion.div>
        <motion.div
          style={{ opacity: skipOpacity }}
          className="absolute inset-x-0 bottom-24 mx-auto w-fit rounded-2xl border-4 border-white/90 bg-black/30 p-3 text-white backdrop-blur"
          aria-label={t("swipe.notSeen")}
        >
          <ArrowUpIcon size={40} strokeWidth={2.6} />
        </motion.div>

        {/* info block */}
        <div className="absolute inset-x-0 bottom-0 p-5">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded-md bg-white/12 px-2 py-0.5 text-[11px] font-bold text-white/90 backdrop-blur">
                  {title.type === "movie" ? t("card.movie") : t("card.tv")}
                </span>
                <span className="rounded-md bg-white/12 px-2 py-0.5 text-[11px] font-semibold text-white/90 backdrop-blur">
                  {title.year}
                </span>
                <span className="flex items-center gap-1 rounded-md bg-white/12 px-2 py-0.5 text-[11px] font-semibold text-white/90 backdrop-blur">
                  <StarIcon size={11} filled className="text-accent" />
                  {title.rating.toFixed(1)}
                </span>
              </div>
              <h2 className="truncate text-2xl font-bold text-white drop-shadow">
                {title.title[locale]}
              </h2>
              <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5">
                {title.genres.slice(0, 3).map((g) => (
                  <span key={g} className="text-xs font-medium text-white/55">
                    {genreLabel(g, locale)}
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={() => setShowDetails((v) => !v)}
              aria-label={t("swipe.details")}
              className="shrink-0 rounded-full bg-white/12 p-2.5 text-white/90 backdrop-blur transition hover:bg-white/25"
            >
              <InfoIcon size={20} />
            </button>
          </div>

          {showDetails && (
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="mt-3 rounded-2xl bg-black/60 p-4 backdrop-blur-md"
            >
              <p className="text-sm leading-relaxed text-white/85">
                {title.overview[locale]}
              </p>
              {title.people.director && (
                <p className="mt-2 text-xs text-white/60">
                  <span className="font-semibold text-white/80">
                    {title.type === "movie" ? t("card.director") : t("card.creator")}:
                  </span>{" "}
                  {title.people.director}
                </p>
              )}
              {title.people.cast.length > 0 && (
                <p className="mt-1 text-xs text-white/60">
                  <span className="font-semibold text-white/80">{t("card.cast")}:</span>{" "}
                  {title.people.cast.slice(0, 3).join("، ")}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {title.keywords.slice(0, 5).map((k) => (
                  <span
                    key={k}
                    className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/60"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
