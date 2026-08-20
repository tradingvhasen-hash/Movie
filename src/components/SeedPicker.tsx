"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import PosterArt from "./PosterArt";
import { getLocalCatalog, loadCatalog, vectorOf } from "@/lib/catalog";
import { matches } from "@/lib/search";
import { recommend } from "@/lib/engine/recommend";
import { applySwipe, emptyProfile } from "@/lib/engine/taste";
import { FADE_UP, SPRING_SNAPPY, staggerContainer } from "@/lib/motion";
import { SearchIcon, XIcon } from "./ui/Icons";
import type { Title } from "@/lib/types";

/**
 * "NAME TWO FILMS AND IT TELLS YOU A THIRD."
 *
 * Asked for directly, and it is the only surface in this product that answers
 * without knowing anything about you. Everything else — the deck, Discover,
 * the library — is downstream of a session; this is downstream of a sentence.
 *
 * WHY IT LIVES ON DISCOVER RATHER THAN ON ITS OWN PAGE. It is a recommendation,
 * and there is already a screen whose whole job is recommendations. Splitting
 * "what should I watch, from my library" and "what should I watch, from these
 * two" across two tabs would put the same question in two places and make both
 * harder to find. It is a mode, not a destination.
 *
 * IT BUILDS A THROWAWAY TASTE, NOT A QUERY. The obvious implementation is
 * "find titles similar to these" — nearest neighbours on a vector. That is
 * weaker than what this engine already does, because it ignores the co-watch
 * graph, the rarity weighting and the facet tables entirely. So instead the
 * chosen films are swiped *right* into an empty profile, and the real ranker
 * runs against it. Two films produce a small, confident taste; that is exactly
 * what the engine is built to consume, and it means this mode improves
 * automatically whenever the engine does.
 *
 * Nothing here touches the stored profile. The temporary one is created,
 * consumed and dropped inside a `useMemo`.
 */
export default function SeedPicker() {
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [seeds, setSeeds] = useState<Title[]>([]);

  useEffect(() => {
    void loadCatalog().then(() => setReady(true));
  }, []);

  const results = useMemo(() => {
    if (!ready || query.trim().length < 2) return [];
    const chosen = new Set(seeds.map((t) => t.id));
    return getLocalCatalog()
      .filter((c) => !chosen.has(c.title.id) && matches(c.title, query))
      .sort((a, b) => b.title.voteCount - a.title.voteCount)
      .slice(0, 8)
      .map((c) => c.title);
  }, [ready, query, seeds]);

  const suggestions = useMemo(() => {
    if (seeds.length === 0) return [];
    let profile = emptyProfile();
    for (const t of seeds) profile = applySwipe(profile, t, vectorOf(t), "liked");
    return recommend(getLocalCatalog(), profile, {
      excludeIds: new Set(seeds.map((t) => t.id)),
      count: 12,
      likedTitles: seeds,
      seed: 7,
      vectorFor: vectorOf,
      mode: "discover",
    }).map((r) => r.title);
  }, [seeds]);

  return (
    <motion.div variants={staggerContainer(0.04)} initial="hidden" animate="show">
      <motion.label
        variants={FADE_UP}
        className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3"
      >
        <SearchIcon size={17} className="shrink-0 text-ink-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name a film you love"
          className="w-full bg-transparent text-sm outline-none placeholder:text-ink-faint"
        />
      </motion.label>

      {/* what has been named so far — removable, because a wrong pick poisons
          a two-film taste far more than it would a two-hundred-film one */}
      <AnimatePresence initial={false}>
        {seeds.length > 0 && (
          <motion.div
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={SPRING_SNAPPY}
            className="mt-3 flex flex-wrap gap-2 overflow-hidden"
          >
            {seeds.map((t) => (
              <motion.button
                key={t.id}
                layout
                type="button"
                whileTap={{ scale: 0.94 }}
                transition={SPRING_SNAPPY}
                onClick={() => setSeeds((s) => s.filter((x) => x.id !== t.id))}
                className="flex items-center gap-1.5 rounded-full border border-accent bg-accent/10 py-1.5 pl-3 pr-2 text-xs font-semibold text-accent"
              >
                {t.title.en}
                <XIcon size={12} strokeWidth={2.6} />
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* candidates while typing */}
      <AnimatePresence initial={false}>
        {results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={SPRING_SNAPPY}
            className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface"
          >
            {results.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setSeeds((s) => [...s, t]);
                  setQuery("");
                }}
                className="flex w-full items-center gap-3 border-b border-line px-3 py-2 text-left last:border-0"
              >
                <span className="block h-12 w-8 shrink-0 overflow-hidden rounded-md">
                  <PosterArt title={t} sizes="40px" className="h-full w-full" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{t.title.en}</span>
                <span className="shrink-0 text-xs tabular-nums text-ink-faint">{t.year}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* the answer */}
      <AnimatePresence initial={false}>
        {suggestions.length > 0 && (
          <motion.div
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SPRING_SNAPPY}
            className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6"
          >
            {suggestions.map((t, i) => (
              <motion.span
                key={t.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING_SNAPPY, delay: Math.min(i, 8) * 0.025 }}
                className="block overflow-hidden rounded-xl border border-line"
              >
                <PosterArt title={t} sizes="140px" className="aspect-[2/3] w-full" />
              </motion.span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
