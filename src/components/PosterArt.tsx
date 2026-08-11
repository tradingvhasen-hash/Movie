"use client";

import { useState } from "react";
import { ClapperIcon, TvIcon } from "./ui/Icons";
import { locale } from "@/lib/i18n";
import type { Title } from "@/lib/types";

/**
 * Poster renderer. Generated art is always the base layer and the real TMDB
 * poster cross-fades in on top once decoded — so a slow or failed image
 * degrades to artwork instead of leaving a blank card.
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
  const [shown, setShown] = useState(false);

  const h = hashCode(title.id);
  const angle = 150 + (h % 60);
  // three close variations of the sky-blue family: lively but coherent
  const tones = [
    ["#3b82c4", "#1e4f7e"],
    ["#38a4d8", "#1d6493"],
    ["#4c8fd6", "#27538e"],
  ][h % 3];
  const TypeIcon = title.type === "movie" ? ClapperIcon : TvIcon;

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`}>
      {/* base layer: generated art, always present */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        style={{
          background: `radial-gradient(120% 80% at ${20 + (h % 60)}% 0%, rgba(255,255,255,0.22), transparent 55%), linear-gradient(${angle}deg, ${tones[0]} 0%, ${tones[1]} 100%)`,
        }}
      >
        <TypeIcon size={50} strokeWidth={1.4} className="text-white/40" />
        <div className="mt-5 px-6 text-center">
          <div className="text-2xl font-bold leading-snug text-white drop-shadow-md">
            {title.title[locale]}
          </div>
          <div className="mt-2 text-sm font-medium tracking-[0.25em] text-white/70">
            {title.year}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/30 to-transparent" />
      </div>

      {/* real poster fades in over the art once it decodes */}
      {title.posterPath && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://image.tmdb.org/t/p/w500${title.posterPath}`}
          alt={title.title[locale]}
          sizes={sizes}
          loading="lazy"
          decoding="async"
          onLoad={() => setShown(true)}
          onError={() => setShown(false)}
          style={{
            opacity: shown ? 1 : 0,
            transform: shown ? "scale(1)" : "scale(1.03)",
            transition:
              "opacity 0.55s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1)",
          }}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      )}
    </div>
  );
}
