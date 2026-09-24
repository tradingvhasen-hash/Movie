"use client";

import { useEffect, useMemo, useState } from "react";
import PosterArt from "./PosterArt";
import { getLocalTitle, loadCatalog } from "@/lib/catalog";
import { useLocale } from "@/lib/i18n";
import type { Title } from "@/lib/types";

/**
 * Public profile likes are stored as title ids. The browser catalog is the
 * authoritative title catalog; swipes intentionally no longer have a foreign
 * key to the small Supabase titles table.
 */
export default function PublicProfileGrid({ titleIds }: { titleIds: string[] }) {
  const [ready, setReady] = useState(false);
  const locale = useLocale();

  useEffect(() => {
    let alive = true;
    void loadCatalog().then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const titles = useMemo(
    () =>
      ready
        ? titleIds
            .map((id) => getLocalTitle(id))
            .filter((t): t is Title => Boolean(t))
        : [],
    [ready, titleIds]
  );

  if (!ready) {
    return (
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: Math.min(titleIds.length, 12) }).map((_, i) => (
          <div key={i} className="aspect-[10/14] animate-pulse rounded-[18px] bg-surface-2" />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {titles.map((title, i) => (
        <div
          key={title.id}
          className="soft-card-sm rise-in overflow-hidden"
          style={{ animationDelay: `${Math.min(i * 0.04, 0.6)}s` }}
        >
          <PosterArt title={title} sizes="220px" className="aspect-[10/14] w-full" />
          <div className="p-2.5" dir="auto">
            <div className="truncate text-sm font-semibold">
              {locale === "ar" ? title.title.ar || title.title.en : title.title.en}
            </div>
            <div className="mt-0.5 text-xs text-ink-faint">
              {title.year} · ⭐ {Number(title.rating).toFixed(1)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
