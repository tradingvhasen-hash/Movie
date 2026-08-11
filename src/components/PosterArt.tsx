"use client";

import { useLocale } from "next-intl";
import { genreEmoji } from "@/lib/genres";
import type { Title } from "@/lib/types";

/**
 * Poster renderer: real TMDB poster when available, otherwise deterministic
 * generated cinematic art (gradient + genre glyph + typography) so the app
 * looks great before the TMDB seed runs.
 */
const PALETTES: [string, string, string][] = [
  ["#2b1055", "#7597de", "#0b0b13"],
  ["#42275a", "#734b6d", "#0b0b13"],
  ["#141e30", "#243b55", "#0b0b13"],
  ["#3a1c71", "#d76d77", "#1a0b13"],
  ["#0f2027", "#2c5364", "#0b0b13"],
  ["#232526", "#414345", "#0b0b13"],
  ["#1a2a6c", "#b21f1f", "#1a0b0b"],
  ["#355c7d", "#6c5b7b", "#150b13"],
  ["#4b134f", "#c94b4b", "#130b0b"],
  ["#134e5e", "#71b280", "#0b130e"],
];

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
  const [c1, c2, c3] = PALETTES[h % PALETTES.length];
  const angle = 120 + (h % 120);
  const emoji = genreEmoji(title.genres[0] ?? "");

  return (
    <div
      className={`relative flex h-full w-full flex-col items-center justify-center overflow-hidden ${className}`}
      style={{
        background: `radial-gradient(120% 90% at ${20 + (h % 60)}% 0%, ${c2}55, transparent 55%), linear-gradient(${angle}deg, ${c1}, ${c3})`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0 46px, rgba(255,255,255,0.05) 46px 48px)",
        }}
      />
      <span className="animate-float-slow text-7xl drop-shadow-2xl" aria-hidden>
        {emoji}
      </span>
      <div className="mt-6 px-6 text-center">
        <div className="text-2xl font-bold leading-snug text-white/95 drop-shadow-md">
          {title.title[locale]}
        </div>
        <div className="mt-2 text-sm font-medium tracking-widest text-white/50">
          {title.year}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />
    </div>
  );
}
