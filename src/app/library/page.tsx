"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import TitleTile from "@/components/TitleTile";
import AddToListSheet from "@/components/AddToListSheet";
import { DeleteButton, NeuButton } from "@/components/ui";
import LibraryStatCard from "@/components/ui/StatCard";
import { FilmIcon, HeartIcon, XIcon } from "@/components/ui/Icons";
import { getLocalTitle } from "@/lib/catalog";
import { genreLabel } from "@/lib/genres";
import { useDhawq } from "@/lib/store";
import type { Swipe } from "@/lib/types";

type Filter = "all" | "liked" | "disliked";

export default function LibraryPage() {
  const t = useTranslations();
  const locale = useLocale() as "ar" | "en";
  const swipes = useDhawq((s) => s.swipes);
  const removeSwipe = useDhawq((s) => s.removeSwipe);

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [listTargetId, setListTargetId] = useState<string | null>(null);

  const watched = useMemo(
    () =>
      Object.values(swipes)
        .filter((sw) => sw.action !== "not_seen")
        .sort((a, b) => b.at - a.at),
    [swipes]
  );

  const filtered = useMemo(() => {
    let rows = watched;
    if (filter !== "all") rows = rows.filter((sw) => sw.action === filter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      rows = rows.filter((sw) => {
        const title = sw.title ?? getLocalTitle(sw.titleId);
        return (
          title &&
          (title.title.ar.toLowerCase().includes(q) ||
            title.title.en.toLowerCase().includes(q))
        );
      });
    }
    return rows;
  }, [watched, filter, query]);

  const topGenres = useMemo(() => {
    const genreCounts = new Map<string, number>();
    for (const sw of watched) {
      const title = sw.title ?? getLocalTitle(sw.titleId);
      for (const g of title?.genres ?? []) {
        genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
      }
    }
    return [...genreCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([g]) => g);
  }, [watched]);

  return (
    <div className="px-5">
      <h1 className="text-2xl font-bold">{t("library.title")}</h1>
      <p className="mt-1 text-sm text-ink-dim">{t("library.subtitle")}</p>

      {/* stat card with line chart — Uiverse.io by code-town3 */}
      {watched.length > 0 && (
        <div className="mt-4">
          <LibraryStatCard
            swipes={watched}
            title={t("lists.growthTitle")}
            legendText={t("lists.growthLegend")}
            legendSuffix={t("lists.growthSuffix")}
          />
          {topGenres.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-ink-faint">
                {t("library.topGenres")}:
              </span>
              {topGenres.map((g) => (
                <span
                  key={g}
                  className="neu-inset px-2.5 py-1 text-xs font-medium text-ink-dim"
                >
                  {genreLabel(g, locale)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* filters — neu push buttons (ke1221), inset when active */}
      <div className="mt-5 flex items-center gap-3">
        {(["all", "liked", "disliked"] as Filter[]).map((f) => (
          <NeuButton
            key={f}
            pressed={filter === f}
            onClick={() => setFilter(f)}
            className="px-3.5 py-1.5 text-sm"
          >
            {t(`library.${f}`)}
          </NeuButton>
        ))}
      </div>

      {/* search — neumorphic input (lenfear23) */}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("library.search")}
        className="neu-input mt-4 text-sm"
      />

      {filtered.length === 0 ? (
        <div className="mt-12 flex flex-col items-center text-center">
          <FilmIcon size={44} strokeWidth={1.6} className="text-ink-faint" />
          <p className="mt-4 text-ink-dim">{t("library.empty")}</p>
          <Link href="/" className="mt-5">
            <span className="glow-btn inline-block">
              <span>{t("library.startSwiping")}</span>
            </span>
          </Link>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {filtered.map((sw) => (
            <LibraryTile
              key={sw.titleId}
              swipe={sw}
              onAddToList={() => setListTargetId(sw.titleId)}
              onRemove={() => removeSwipe(sw.titleId)}
            />
          ))}
        </div>
      )}

      {listTargetId && (
        <AddToListSheet titleId={listTargetId} onClose={() => setListTargetId(null)} />
      )}
    </div>
  );
}

function LibraryTile({
  swipe,
  onAddToList,
  onRemove,
}: {
  swipe: Swipe;
  onAddToList: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations();
  const title = swipe.title ?? getLocalTitle(swipe.titleId);
  if (!title) return null;

  return (
    <TitleTile
      title={title}
      badge={
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full backdrop-blur ${
            swipe.action === "liked"
              ? "bg-accent text-bg"
              : "bg-black/60 text-ink-dim"
          }`}
        >
          {swipe.action === "liked" ? (
            <HeartIcon size={13} filled />
          ) : (
            <XIcon size={13} strokeWidth={3} />
          )}
        </span>
      }
      footer={
        <div className="mt-2 flex items-center gap-2">
          <NeuButton onClick={onAddToList} className="flex-1 px-2 py-1.5 text-[11px]">
            {t("library.addToList")}
          </NeuButton>
          {/* expanding delete — Uiverse.io by vinodjangid07 */}
          <DeleteButton label={t("library.removeSwipe")} onDelete={onRemove} className="shrink-0 scale-90" />
        </div>
      }
    />
  );
}
