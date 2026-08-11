"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import TitleTile from "@/components/TitleTile";
import { HeartButton, NeuButton, RichTooltip } from "@/components/ui";
import {
  HeartIcon,
  InfoIcon,
  SearchIcon,
  SparklesIcon,
  ThumbsDownIcon,
} from "@/components/ui/Icons";
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
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t("discover.title")}</h1>
        <RichTooltip
          title={t("discover.howTitle")}
          trigger={
            <button
              className="mt-1 text-ink-faint transition hover:text-ink"
              aria-label={t("discover.howTitle")}
            >
              <InfoIcon size={17} />
            </button>
          }
        >
          {t("discover.howBody")}
        </RichTooltip>
      </div>

      {/* live search — no button */}
      <div className="relative mt-4">
        <span className="pointer-events-none absolute inset-y-0 start-4 flex items-center text-ink-faint">
          <SearchIcon size={17} />
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("discover.searchAll")}
          className="neu-input ps-11 text-sm"
        />
      </div>

      {query.trim() ? (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {searchResults.map((title) => {
            const existing = swipes[title.id];
            return (
              <TitleTile
                key={title.id}
                title={title}
                badge={
                  existing && existing.action !== "not_seen" ? (
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full shadow-sm ${
                        existing.action === "liked"
                          ? "bg-accent text-white"
                          : "bg-white/90 text-ink-dim"
                      }`}
                    >
                      {existing.action === "liked" ? (
                        <HeartIcon size={13} filled />
                      ) : (
                        <ThumbsDownIcon size={12} filled />
                      )}
                    </span>
                  ) : undefined
                }
                footer={
                  <div className="mt-1.5 flex items-center justify-center gap-2" dir="ltr">
                    <NeuButton
                      round
                      aria-label={t("swipe.disliked")}
                      title={t("swipe.disliked")}
                      onClick={() => doSwipe(title, "disliked")}
                      className="h-9 w-9 text-ink-dim"
                    >
                      <ThumbsDownIcon size={15} strokeWidth={2.2} />
                    </NeuButton>
                    <HeartButton
                      onLike={() => doSwipe(title, "liked")}
                      size={38}
                      title={t("swipe.liked")}
                    />
                  </div>
                }
              />
            );
          })}
        </div>
      ) : ratedCount === 0 ? (
        <div className="mt-12 flex flex-col items-center text-center">
          <SparklesIcon size={44} strokeWidth={1.6} className="text-ink-faint" />
          <p className="mt-4 text-ink-dim">{t("discover.empty")}</p>
          <Link href="/" className="mt-5">
            <span className="glow-btn inline-block">
              <span>{t("library.startSwiping")}</span>
            </span>
          </Link>
        </div>
      ) : (
        <>
          {ratedCount < 12 && (
            <p className="soft-inset mt-4 px-4 py-2.5 text-xs font-medium text-accent">
              {t("discover.needMore")}
            </p>
          )}
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {recs.map((rec) => {
              const because = rec.becauseOf ? getLocalTitle(rec.becauseOf) : null;
              return (
                <TitleTile
                  key={rec.title.id}
                  title={rec.title}
                  badge={
                    <span className="rounded-full bg-accent/95 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">
                      {t("discover.match", { percent: Math.round(rec.score * 100) })}
                    </span>
                  }
                  footer={
                    because ? (
                      <div className="mt-1 truncate text-[10px] text-ink-faint">
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
