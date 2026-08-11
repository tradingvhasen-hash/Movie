"use client";

import { useLocale } from "next-intl";
import PosterArt from "./PosterArt";
import { StarIcon } from "./ui/Icons";
import type { Title } from "@/lib/types";

/** Apple-style tile: white card, generous radius, one soft shadow,
 *  gentle lift on hover, clean typography. */
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
  const locale = useLocale() as "ar" | "en";
  return (
    <div
      className={`group relative overflow-hidden rounded-[20px] bg-surface shadow-[0_4px_14px_rgba(29,41,61,0.07)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(29,41,61,0.13)] ${
        onClick ? "cursor-pointer" : ""
      }`}
      onClick={onClick}
    >
      <div className="aspect-[10/14] w-full overflow-hidden">
        <PosterArt title={title} sizes="200px" />
      </div>
      {badge && <div className="absolute end-2.5 top-2.5 z-10">{badge}</div>}
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
    </div>
  );
}
