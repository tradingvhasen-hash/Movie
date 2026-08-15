"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import AccountPanel from "@/components/AccountPanel";
import TitleTile from "@/components/TitleTile";
import { DeleteButton } from "@/components/ui";
import { FilmIcon, HeartIcon, ThumbsDownIcon } from "@/components/ui/Icons";
import { getLocalTitle } from "@/lib/catalog";
import {
  FADE_UP,
  OVERLAY,
  POP_IN,
  SECTION,
  SPRING_SNAPPY,
  staggerContainer,
} from "@/lib/motion";
import { useDhawq } from "@/lib/store";
import { t } from "@/lib/i18n";
import type { Swipe } from "@/lib/types";

type Filter = "all" | "liked" | "disliked";
const FILTERS: Filter[] = ["all", "liked", "disliked"];

export default function LibraryPage() {
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
    <motion.div
      variants={staggerContainer(0.06)}
      initial="hidden"
      animate="show"
      className="px-5 pb-24 pt-6"
    >
      <motion.h1 variants={FADE_UP} className="text-2xl font-bold tracking-tight">
        {t("library.title")}
      </motion.h1>
      <motion.p variants={FADE_UP} className="mt-1 text-sm text-ink-dim">
        {t("library.subtitle")}
      </motion.p>

      {/* signing in is optional and lives here rather than in the nav: this is
          the page about a person's own data, and it is the only place the
          question "where does this go?" naturally comes up */}
      <AccountPanel />

      {/* filters — the active pill slides between options */}
      <LayoutGroup id="library-filters">
        <motion.div variants={FADE_UP} className="mt-5 flex items-center gap-3">
          {FILTERS.map((f) => {
            const active = filter === f;
            return (
              <motion.button
                key={f}
                onClick={() => setFilter(f)}
                whileTap={{ scale: 0.93 }}
                transition={SPRING_SNAPPY}
                className={`relative rounded-[0.6em] border px-3.5 py-1.5 text-sm font-semibold transition-colors duration-300 ${
                  active
                    ? "border-transparent text-white"
                    : "border-line bg-surface text-ink-dim shadow-[0_4px_12px_rgba(29,41,61,0.08)] hover:text-ink"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="filter-pill"
                    className="absolute inset-0 rounded-[0.6em] bg-gradient-to-br from-accent to-accent-soft shadow-[0_6px_16px_rgba(14,165,233,0.35)]"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative">{t(`library.${f}`)}</span>
              </motion.button>
            );
          })}
        </motion.div>
      </LayoutGroup>

      <motion.input
        variants={FADE_UP}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("library.search")}
        whileFocus={{ scale: 1.01 }}
        transition={SPRING_SNAPPY}
        className="neu-input mt-4 text-sm"
      />

      <AnimatePresence mode="wait" initial={false}>
        {filtered.length === 0 ? (
          <motion.div
            key={`empty-${filter}-${query.trim() ? "q" : ""}`}
            variants={SECTION}
            initial="hidden"
            animate="show"
            exit="exit"
            className="mt-12 flex flex-col items-center text-center"
          >
            <FilmIcon size={44} strokeWidth={1.6} className="text-ink-faint" />
            <p className="mt-4 text-ink-dim">{t("library.empty")}</p>
            <Link href="/" className="mt-5">
              <motion.span
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.96 }}
                transition={SPRING_SNAPPY}
                className="glow-btn inline-block"
              >
                <span>{t("library.startSwiping")}</span>
              </motion.span>
            </Link>
          </motion.div>
        ) : (
          <motion.div
            key="grid"
            variants={staggerContainer(0.045)}
            initial="hidden"
            animate="show"
            exit="exit"
            className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4"
          >
            {/* popLayout lets removed tiles shrink away while the rest reflow */}
            <AnimatePresence mode="popLayout">
              {filtered.map((sw) => (
                <LibraryTile
                  key={sw.titleId}
                  swipe={sw}
                  selected={selectedId === sw.titleId}
                  onSelect={() =>
                    setSelectedId(selectedId === sw.titleId ? null : sw.titleId)
                  }
                  onRemove={() => {
                    setSelectedId(null);
                    removeSwipe(sw.titleId);
                  }}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
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
  const title = swipe.title ?? getLocalTitle(swipe.titleId);
  if (!title) return null;

  return (
    <TitleTile
      title={title}
      onClick={onSelect}
      badge={
        /* three states, not two. A title added from the grid is watched with
           no verdict — showing it a thumbs-down would put words in the
           viewer's mouth, and it is the deck's job to ask which it is. */
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full shadow-sm ${
            swipe.action === "liked"
              ? "bg-accent text-white"
              : swipe.action === "seen"
                ? "bg-white/90 text-ink-faint"
                : "bg-white/90 text-ink-dim"
          }`}
        >
          {swipe.action === "liked" ? (
            <HeartIcon size={13} filled />
          ) : swipe.action === "seen" ? (
            <span className="text-[11px] font-bold leading-none">✓</span>
          ) : (
            <ThumbsDownIcon size={12} filled />
          )}
        </span>
      }
      overlay={
        <AnimatePresence>
          {selected && (
            <motion.div
              key="actions"
              variants={OVERLAY}
              initial="hidden"
              animate="show"
              exit="exit"
              className="absolute inset-0 z-20 flex items-center justify-center rounded-[20px] bg-slate-800/25 backdrop-blur-[3px]"
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
            >
              <motion.div
                variants={POP_IN}
                onClick={(e) => e.stopPropagation()}
              >
                {/* expanding delete — Uiverse.io by vinodjangid07 */}
                <DeleteButton label={t("common.delete")} onDelete={onRemove} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      }
    />
  );
}
