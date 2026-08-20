"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import TitleTile from "@/components/TitleTile";
import { FilmIcon, HeartIcon, ThumbsDownIcon, TrashIcon, UserIcon } from "@/components/ui/Icons";
import { matches } from "@/lib/search";
import { getLocalTitle } from "@/lib/catalog";
import { EASE_OUT, FADE_UP, OVERLAY, POP_IN, QUICK, SECTION, SPRING_SNAPPY, staggerContainer } from "@/lib/motion";
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
      rows = rows.filter((sw) => {
        const title = getLocalTitle(sw.titleId) ?? sw.title;
        return Boolean(title && matches(title, query));
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
      <motion.div variants={FADE_UP} className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t("library.title")}</h1>
        {/*
          A 36px circle that is always exactly 36px, signed in or out, loading
          or loaded. The sign-in panel that used to sit here rendered `null`
          until Supabase answered and then appeared at full height, shoving the
          filters and the search box down a fifth of a second after they were
          drawn — which is the "search bar blinking" the user reported. It was
          never blinking; it was moving. Nothing on this page changes size
          asynchronously any more.
        */}
        <Link
          href="/profile"
          aria-label="Profile"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-dim transition-colors hover:text-ink"
        >
          <UserIcon size={18} />
        </Link>
      </motion.div>
      {/*
        The subtitle that stood here is gone, and so is every other line in
        this app whose only job was to restate its own heading. The test each
        one had to pass: **does this sentence stop somebody being confused or
        losing something?** "Everything you've ever watched, in one place"
        under a heading that says "My Library" fails it — the reader already
        knows, and the sentence costs them a line of screen and a beat of
        attention to learn nothing.

        What survived the sweep are the two kinds that pass: an error saying
        why something failed, and an empty state that carries an *action*. The
        empty states below keep their button and lost their sentence, because
        an icon and a button labelled "Start swiping" already say the whole of
        "your library is empty, start swiping to fill it".
      */}


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
                /**
                 * The same material as every other control in the app, and a
                 * shadow that survives dark mode. It was a gradient pill with
                 * a hardcoded blue-grey glow — invisible in dark, and the only
                 * gradient on a page of flat surfaces. The sliding indicator
                 * stays, because that motion is doing real work: it shows the
                 * two filters are one control with one value, not two buttons.
                 */
                className={`relative rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? "border-transparent text-[color:var(--color-on-accent)]"
                    : "border-line bg-surface text-ink-dim hover:text-ink"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="filter-pill"
                    className="absolute inset-0 rounded-full bg-accent"
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
            <FilmIcon size={52} strokeWidth={1.4} className="text-ink-faint" />
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
  const title = getLocalTitle(swipe.titleId) ?? swipe.title;
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
      /**
       * DELETE, WITH THE FEELING OF HAVING PRESSED SOMETHING.
       *
       * The user's words: "it just appears — I want to feel like the card is
       * getting pushed". He is describing the difference between a state that
       * is *revealed* and a surface that *responds*. What was here appeared:
       * a scrim faded in and a button popped, with the poster underneath
       * completely inert, so the tap and the result had no physical
       * relationship.
       *
       * Now the tile itself takes the press — it sinks slightly and its
       * shadow contracts, which is what a real object under a thumb does — and
       * the scrim and the action arrive on top of that movement rather than
       * instead of it. The delete control is a plain destructive button on the
       * app's own material rather than the borrowed expanding widget, which
       * had its own idea of shape, colour and timing and was one of the five
       * unrelated vocabularies that made this app read as assembled.
       */
      overlay={
        <AnimatePresence>
          {selected && (
            <motion.div
              key="actions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: QUICK, ease: EASE_OUT }}
              className="absolute inset-0 z-20 flex items-center justify-center rounded-[20px] bg-[rgb(var(--rgb-scrim)/0.45)] backdrop-blur-[6px]"
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
            >
              <motion.button
                type="button"
                aria-label={t("common.delete")}
                initial={{ scale: 0.88, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ duration: QUICK, ease: EASE_OUT }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="grid h-12 w-12 place-items-center rounded-full bg-danger text-white shadow-[0_6px_20px_rgb(var(--rgb-shadow)/0.35)]"
              >
                <TrashIcon size={20} />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      }
    />
  );
}
