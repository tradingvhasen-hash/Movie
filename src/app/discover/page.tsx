"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import TitleTile from "@/components/TitleTile";
import { getLocalCatalog, getLocalTitle, vectorOf } from "@/lib/catalog";
import { recommend } from "@/lib/engine/recommend";
import { useDhawq } from "@/lib/store";
import type { Recommendation } from "@/lib/types";

export default function DiscoverPage() {
  const t = useTranslations();
  const locale = useLocale() as "ar" | "en";
  const swipes = useDhawq((s) => s.swipes);
  const profile = useDhawq((s) => s.profile);
  const doSwipe = useDhawq((s) => s.swipe);

  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => setHydrated(true), []);

  const recs: Recommendation[] = useMemo(() => {
    if (!hydrated) return [];
    const pool = getLocalCatalog();
    // discover shows unwatched titles: rated ones are excluded, "not seen" stays
    const exclude = new Set(
      Object.values(swipes)
        .filter((s) => s.action !== "not_seen")
        .map((s) => s.titleId)
    );
    const likedItems = Object.values(swipes)
      .filter((s) => s.action === "liked")
      .map((s) => {
        const title = s.title ?? getLocalTitle(s.titleId);
        return title ? { title, vector: vectorOf(title) } : null;
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    return recommend(pool, profile, {
      excludeIds: exclude,
      count: 24,
      likedItems,
      seed: 42,
    });
  }, [hydrated, swipes, profile]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return getLocalCatalog()
      .filter(
        (c) =>
          c.title.title.ar.toLowerCase().includes(q) ||
          c.title.title.en.toLowerCase().includes(q)
      )
      .slice(0, 12)
      .map((c) => c.title);
  }, [query]);

  const ratedCount = profile.ratedSwipes;

  return (
    <div className="px-5">
      <h1 className="text-2xl font-bold">{t("discover.title")}</h1>
      <p className="mt-1 text-sm text-ink-dim">{t("discover.subtitle")}</p>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("discover.searchAll")}
        className="mt-4 w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm outline-none placeholder:text-ink-faint focus:border-brand/60"
      />

      {query.trim() ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {searchResults.map((title) => {
            const existing = swipes[title.id];
            return (
              <TitleTile
                key={title.id}
                title={title}
                badge={
                  existing && existing.action !== "not_seen" ? (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${existing.action === "liked" ? "bg-like/90" : "bg-nope/90"} text-black`}>
                      {existing.action === "liked" ? "♥" : "✕"}
                    </span>
                  ) : undefined
                }
                footer={
                  <div className="mt-2 flex gap-1.5">
                    <button
                      onClick={() => doSwipe(title, "liked")}
                      className="flex-1 rounded-lg bg-like/15 py-1 text-[11px] font-bold text-like transition hover:bg-like/25"
                    >
                      ♥ {t("swipe.liked")}
                    </button>
                    <button
                      onClick={() => doSwipe(title, "disliked")}
                      className="flex-1 rounded-lg bg-nope/15 py-1 text-[11px] font-bold text-nope transition hover:bg-nope/25"
                    >
                      ✕ {t("swipe.disliked")}
                    </button>
                  </div>
                }
              />
            );
          })}
        </div>
      ) : ratedCount === 0 ? (
        <div className="mt-12 flex flex-col items-center text-center">
          <div className="text-5xl">✨</div>
          <p className="mt-4 text-ink-dim">{t("discover.empty")}</p>
          <Link href="/" className="mt-5 rounded-xl bg-brand px-5 py-2.5 font-bold text-black">
            {t("library.startSwiping")}
          </Link>
        </div>
      ) : (
        <>
          {ratedCount < 12 && (
            <p className="mt-3 rounded-xl bg-brand/10 px-4 py-2.5 text-xs font-medium text-brand">
              💡 {t("discover.needMore")}
            </p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {recs.map((rec) => {
              const because = rec.becauseOf ? getLocalTitle(rec.becauseOf) : null;
              return (
                <TitleTile
                  key={rec.title.id}
                  title={rec.title}
                  badge={
                    <span className="rounded-full bg-brand/95 px-2 py-0.5 text-[10px] font-bold text-black">
                      {t("discover.match", { percent: Math.round(rec.score * 100) })}
                    </span>
                  }
                  footer={
                    because ? (
                      <div className="mt-1.5 truncate text-[10px] text-ink-faint">
                        {t("discover.becauseYouLiked")}: {because.title[locale]}
                      </div>
                    ) : undefined
                  }
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
