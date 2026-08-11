"use client";

import { useLocale } from "next-intl";
import PosterArt from "./PosterArt";
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
      className={`group relative overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-white/25 ${
        onClick ? "cursor-pointer" : ""
      }`}
      onClick={onClick}
    >
      <div className="aspect-[10/14] w-full overflow-hidden">
        <PosterArt title={title} sizes="200px" />
      </div>
      {badge && <div className="absolute end-2 top-2">{badge}</div>}
      <div className="p-2.5">
        <div className="truncate text-sm font-semibold">{title.title[locale]}</div>
        <div className="mt-0.5 text-xs text-ink-faint">
          {title.year} · ⭐ {title.rating.toFixed(1)}
        </div>
        {footer}
      </div>
    </div>
  );
}
