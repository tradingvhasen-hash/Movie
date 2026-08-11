"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import TitleTile from "@/components/TitleTile";
import AddToListSheet from "@/components/AddToListSheet";
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

  const stats = useMemo(() => {
    const genreCounts = new Map<string, number>();
    let liked = 0;
    for (const sw of watched) {
      if (sw.action === "liked") liked++;
      const title = sw.title ?? getLocalTitle(sw.titleId);
      for (const g of title?.genres ?? []) {
        genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
      }
    }
    const topGenres = [...genreCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([g]) => g);
    return { total: watched.length, liked, topGenres };
  }, [watched]);

  return (
    <div className="px-5">
      <h1 className="text-2xl font-bold">{t("library.title")}</h1>
      <p className="mt-1 text-sm text-ink-dim">{t("library.subtitle")}</p>

      {watched.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <StatCard value={stats.total} label={t("library.watchedCount")} />
          <StatCard value={stats.liked} label={t("library.likedCount")} accent />
          <div className="rounded-2xl border border-line bg-surface p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
              {t("library.topGenres")}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {stats.topGenres.map((g) => (
                <span
                  key={g}
                  className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-dim"
                >
                  {genreLabel(g, locale)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        {(["all", "liked", "disliked"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              filter === f
                ? "bg-brand text-black"
                : "bg-surface text-ink-dim hover:text-ink"
            }`}
          >
            {t(`library.${f}`)}
          </button>
        ))}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("library.search")}
        className="mt-3 w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm outline-none placeholder:text-ink-faint focus:border-brand/60"
      />

      {filtered.length === 0 ? (
        <div className="mt-12 flex flex-col items-center text-center">
          <div className="text-5xl">🎞️</div>
          <p className="mt-4 text-ink-dim">{t("library.empty")}</p>
          <Link
            href="/"
            className="mt-5 rounded-xl bg-brand px-5 py-2.5 font-bold text-black"
          >
            {t("library.startSwiping")}
          </Link>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
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

function StatCard({ value, label, accent = false }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <div className={`text-2xl font-extrabold ${accent ? "text-like" : "text-brand"}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </div>
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
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            swipe.action === "liked"
              ? "bg-like/90 text-black"
              : "bg-nope/90 text-black"
          }`}
        >
          {swipe.action === "liked" ? "♥" : "✕"}
        </span>
      }
      footer={
        <div className="mt-2 flex gap-1.5">
          <button
            onClick={onAddToList}
            className="flex-1 rounded-lg bg-surface-2 py-1 text-[11px] font-semibold text-ink-dim transition hover:text-ink"
          >
            {t("library.addToList")}
          </button>
          <button
            onClick={onRemove}
            title={t("library.removeSwipe")}
            className="rounded-lg bg-surface-2 px-2 py-1 text-[11px] text-ink-faint transition hover:text-nope"
          >
            🗑
          </button>
        </div>
      }
    />
  );
}
