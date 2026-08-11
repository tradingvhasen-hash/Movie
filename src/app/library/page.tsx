"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import TitleTile from "@/components/TitleTile";
import { DeleteButton, NeuButton } from "@/components/ui";
import { FilmIcon, HeartIcon, ThumbsDownIcon } from "@/components/ui/Icons";
import { getLocalTitle } from "@/lib/catalog";
import { useDhawq } from "@/lib/store";
import type { Swipe } from "@/lib/types";

type Filter = "all" | "liked" | "disliked";

export default function LibraryPage() {
  const t = useTranslations();
  const swipes = useDhawq((s) => s.swipes);
  const removeSwipe = useDhawq((s) => s.removeSwipe);

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  return (
    <div className="px-5">
      <h1 className="text-2xl font-bold tracking-tight">{t("library.title")}</h1>
      <p className="mt-1 text-sm text-ink-dim">{t("library.subtitle")}</p>

      {/* filters — push buttons (ke1221), inset when active */}
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
              selected={selectedId === sw.titleId}
              onSelect={() =>
                setSelectedId(selectedId === sw.titleId ? null : sw.titleId)
              }
              onRemove={() => {
                removeSwipe(sw.titleId);
                setSelectedId(null);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LibraryTile({
  swipe,
  selected,
  onSelect,
  onRemove,
}: {
  swipe: Swipe;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations();
  const title = swipe.title ?? getLocalTitle(swipe.titleId);
  if (!title) return null;

  return (
    <TitleTile
      title={title}
      onClick={onSelect}
      badge={
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full shadow-sm ${
            swipe.action === "liked" ? "bg-accent text-white" : "bg-white/90 text-ink-dim"
          }`}
        >
          {swipe.action === "liked" ? (
            <HeartIcon size={13} filled />
          ) : (
            <ThumbsDownIcon size={12} filled />
          )}
        </span>
      }
      overlay={
        selected ? (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center rounded-[20px] bg-white/70 backdrop-blur-[2px]"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
          >
            <div
              className="rich-tooltip-panel flex flex-col items-center gap-2 !p-3"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-xs font-semibold text-ink-dim">
                {t("library.removeSwipe")}
              </span>
              {/* expanding delete — Uiverse.io by vinodjangid07 */}
              <DeleteButton label={t("common.delete")} onDelete={onRemove} />
            </div>
          </div>
        ) : undefined
      }
    />
  );
}
