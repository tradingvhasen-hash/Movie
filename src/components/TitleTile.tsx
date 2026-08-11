"use client";

import { useLocale } from "next-intl";
import PosterArt from "./PosterArt";
import { StarIcon } from "./ui/Icons";
import type { Title } from "@/lib/types";

export default function TitleTile({
  title,
  badge,
  footer,
  onClick,
}: {
  title: Title;
  badge?: React.ReactNode;
  footer?: React.ReactNode;
  onClick?: () => void;
}) {
  const locale = useLocale() as "ar" | "en";
  return (
    <div
      className={`neu-card-sm group relative transition ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <div className="aspect-[10/14] w-full overflow-hidden rounded-t-[18px]">
        <PosterArt title={title} sizes="200px" />
      </div>
      {badge && <div className="absolute end-2 top-2 z-10">{badge}</div>}
      <div className="p-2.5">
        <div className="truncate text-sm font-semibold">{title.title[locale]}</div>
        <div className="mt-0.5 flex items-center gap-1 text-xs text-ink-faint">
          {title.year}
          <span className="mx-0.5">·</span>
          <StarIcon size={11} filled className="text-accent/80" />
          {title.rating.toFixed(1)}
        </div>
        {footer}
      </div>
    </div>
  );
}
