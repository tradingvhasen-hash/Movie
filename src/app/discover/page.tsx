"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import TitleTile from "@/components/TitleTile";
import SeedPicker from "@/components/SeedPicker";
import { HeartButton, NeuButton, RichTooltip } from "@/components/ui";
import {
  HeartIcon,
  InfoIcon,
  SearchIcon,
  SparklesIcon,
  ThumbsDownIcon,
} from "@/components/ui/Icons";
import { getLocalCatalog, getLocalTitle, loadCatalog, vectorOf } from "@/lib/catalog";
import { recommend } from "@/lib/engine/recommend";
import { FADE_UP, SECTION, SPRING_SNAPPY, staggerContainer } from "@/lib/motion";
import { useDhawq } from "@/lib/store";
import { locale, t } from "@/lib/i18n";
import type { Recommendation } from "@/lib/types";

export default function DiscoverPage() {
  const swipes = useDhawq((s) => s.swipes);
  const profile = useDhawq((s) => s.profile);
  const seed = useDhawq((s) => s.seed);
  const doSwipe = useDhawq((s) => s.swipe);

  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    void loadCatalog().then(() => {
      if (!cancelled) setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Two questions, one screen.
   *
   *   "from mine"   what should I watch, given everything I have told you
   *   "from a few"  what should I watch, given only these two films
   *
   * They are the same question with a different amount of evidence, so they
   * belong in one place. Putting the second on its own page would mean the
   * product answers "what should I watch" in two different tabs, and a person
   * would have to know which one they were in to know what they were getting.
   */
  const [source, setSource] = useState<"mine" | "few">("mine");

  const recs: Recommendation[] = useMemo(() => {
    if (!hydrated) return [];
    const pool = getLocalCatalog();
    // discover shows unwatched titles: rated ones are excluded, "not seen" stays
    const exclude = new Set(
      Object.values(swipes)
        .filter((s) => s.action !== "not_seen")
        .map((s) => s.titleId)
    );
    const likedTitles = Object.values(swipes)
      .filter((s) => s.action === "liked")
      .map((s) => getLocalTitle(s.titleId) ?? s.title)
      .filter((t): t is NonNullable<typeof t> => Boolean(t));
    return recommend(pool, profile, {
      excludeIds: exclude,
      count: 24,
      likedTitles,
      seed,
      vectorFor: vectorOf,
      mode: "discover",
    });
  }, [hydrated, swipes, profile, seed]);

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
  const view = query.trim() ? "search" : ratedCount === 0 ? "empty" : "recs";

  return (
    <motion.div
      variants={staggerContainer(0.06)}
      initial="hidden"
      animate="show"
      className="px-5 pb-24 pt-6"
    >
      <motion.div variants={FADE_UP} className="flex items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t("discover.title")}</h1>
        <RichTooltip
          title={t("discover.howTitle")}
          trigger={
            <motion.button
              whileHover={{ scale: 1.15, rotate: 8 }}
              whileTap={{ scale: 0.9 }}
              transition={SPRING_SNAPPY}
              className="mt-1 text-ink-faint transition-colors duration-300 hover:text-accent"
              aria-label={t("discover.howTitle")}
            >
              <InfoIcon size={17} />
            </motion.button>
          }
        >
          {t("discover.howBody")}
        </RichTooltip>
      </motion.div>

      <motion.div
        variants={FADE_UP}
        className="mt-4 flex rounded-full border border-line bg-surface-2 p-1"
        dir="ltr"
      >
        {(
          [
            ["mine", "From your library"],
            ["few", "From a few films"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setSource(m)}
            className={`relative flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
              source === m ? "text-on-accent" : "text-ink-dim"
            }`}
          >
            {source === m && (
              <motion.span
                layoutId="discover-source"
                transition={SPRING_SNAPPY}
                className="absolute inset-0 rounded-full bg-accent"
              />
            )}
            <span className="relative">{label}</span>
          </button>
        ))}
      </motion.div>

      {source === "few" && (
        <div className="mt-4">
          <SeedPicker />
        </div>
      )}

      {source === "mine" && (
      <>
      {/* live search — no button */}
      <motion.div variants={FADE_UP} className="relative mt-4">
        <span className="pointer-events-none absolute inset-y-0 start-4 z-10 flex items-center text-ink-faint">
          <SearchIcon size={17} />
        </span>
        <motion.input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("discover.searchAll")}
          whileFocus={{ scale: 1.01 }}
          transition={SPRING_SNAPPY}
          className="neu-input neu-input-search text-sm"
        />
      </motion.div>

      <AnimatePresence mode="wait" initial={false}>
        {view === "search" ? (
          <motion.div
            key="search"
            variants={staggerContainer(0.04)}
            initial="hidden"
            animate="show"
            exit="exit"
            className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4"
          >
            <AnimatePresence mode="popLayout">
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
                        <motion.div whileTap={{ scale: 0.86 }} transition={SPRING_SNAPPY}>
                          <NeuButton
                            round
                            aria-label={t("swipe.disliked")}
                            title={t("swipe.disliked")}
                            onClick={() => doSwipe(title, "disliked")}
                            className="h-9 w-9 text-ink-dim"
                          >
                            <ThumbsDownIcon size={15} strokeWidth={2.2} />
                          </NeuButton>
                        </motion.div>
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
            </AnimatePresence>
          </motion.div>
        ) : view === "empty" ? (
          <motion.div
            key="empty"
            variants={SECTION}
            initial="hidden"
            animate="show"
            exit="exit"
            className="mt-12 flex flex-col items-center text-center"
          >
            <SparklesIcon size={52} strokeWidth={1.4} className="text-ink-faint" />
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
          <motion.div key="recs" variants={SECTION} initial="hidden" animate="show" exit="exit">
            <AnimatePresence>
              {ratedCount < 12 && (
                <motion.p
                  key="hint"
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: "auto", marginTop: 16 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="soft-inset overflow-hidden px-4 py-2.5 text-xs font-medium text-accent"
                >
                  {t("discover.needMore")}
                </motion.p>
              )}
            </AnimatePresence>
            <motion.div
              variants={staggerContainer(0.04)}
              initial="hidden"
              animate="show"
              className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4"
            >
              <AnimatePresence mode="popLayout">
                {recs.map((rec) => {
                  const because = rec.becauseOf ? getLocalTitle(rec.becauseOf) : null;
                  // the values that actually produced the score, so the
                  // percentage is answerable rather than mysterious
                  const why = rec.reasons.map((r) => r.label).join(" · ");
                  return (
                    <TitleTile
                      key={rec.title.id}
                      title={rec.title}
                      badge={
                        <span className="rounded-full bg-accent/95 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">
                          {t("discover.match", { percent: rec.match })}
                        </span>
                      }
                      footer={
                        why || because ? (
                          <div className="mt-1 space-y-0.5">
                            {why && (
                              <div className="truncate text-[10px] capitalize text-ink-dim">
                                {why}
                              </div>
                            )}
                            {because && (
                              <div className="truncate text-[10px] text-ink-faint">
                                {t("discover.becauseYouLiked")}: {because.title[locale]}
                              </div>
                            )}
                          </div>
                        ) : undefined
                      }
                    />
                  );
                })}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </>
      )}
    </motion.div>
  );
}
