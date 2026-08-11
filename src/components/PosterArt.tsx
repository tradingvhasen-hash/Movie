"use client";

import { useLocale } from "next-intl";
import { ClapperIcon, TvIcon } from "./ui/Icons";
import type { Title } from "@/lib/types";

/**
 * Poster renderer: real TMDB poster when available, otherwise generated
 * monochrome graphite art (subtle gold sheen varies by title hash) —
 * one coherent palette, no color noise.
 */
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export default function PosterArt({
  title,
  className = "",
  sizes = "400px",
}: {
  title: Title;
  className?: string;
  sizes?: string;
}) {
  const locale = useLocale() as "ar" | "en";

  if (title.posterPath) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`https://image.tmdb.org/t/p/w500${title.posterPath}`}
        alt={title.title[locale]}
        sizes={sizes}
        className={`h-full w-full object-cover ${className}`}
        draggable={false}
      />
    );
  }

  const h = hashCode(title.id);
  const angle = 150 + (h % 60);
  const glowX = 15 + (h % 70);
  const glowStrength = 0.05 + (h % 5) * 0.012;
  const TypeIcon = title.type === "movie" ? ClapperIcon : TvIcon;

  return (
    <div
      className={`relative flex h-full w-full flex-col items-center justify-center overflow-hidden ${className}`}
      style={{
        background: `radial-gradient(130% 90% at ${glowX}% 0%, rgba(255, 200, 80, ${glowStrength}), transparent 55%), linear-gradient(${angle}deg, #2a2f39 0%, #1a1d23 55%, #101216 100%)`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0 46px, rgba(255,255,255,0.045) 46px 48px)",
        }}
      />
      <TypeIcon size={54} strokeWidth={1.4} className="text-white/25" />
      <div className="mt-6 px-6 text-center">
        <div className="text-2xl font-bold leading-snug text-white/95 drop-shadow-md">
          {title.title[locale]}
        </div>
        <div className="mt-2 text-sm font-medium tracking-[0.25em] text-accent/60">
          {title.year}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />
    </div>
  );
}
