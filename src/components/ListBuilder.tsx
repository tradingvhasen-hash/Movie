"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import PosterArt from "./PosterArt";
import { getLocalTitle, loadCatalog } from "@/lib/catalog";
import { matches, searchCatalog } from "@/lib/search";
import { useDhawq } from "@/lib/store";
import { FADE_UP, SPRING_SNAPPY, staggerContainer } from "@/lib/motion";
import { CheckIcon, SearchIcon, XIcon } from "./ui/Icons";
import type { Title } from "@/lib/types";

/**
 * THREE WAYS TO FILL A LIST, BECAUSE ONE OF THEM IS ALWAYS THE WRONG ONE.
 *
 * The obvious build is a picker: here is your library, tick what belongs. It
 * is also the slowest possible way to say "all my comedies" — a person with
 * three hundred comedies has to tap three hundred times, and will not.
 *
 * These are not three features. They are the same operation — "add these ids"
 * — reached from the three ways a person actually has the list in their head:
 *
 *   LIBRARY   you can see them, so point at them
 *   NAME      you remember the title but it is not in your library yet
 *   GENRE     you cannot name them but the rule is obvious: every comedy
 *
 * (The fourth way, copying somebody else's, lives on the share page where the
 * somebody else is.)
 *
 * GENRE is the one that earns the screen. It answers "every comedy" in one
 * tap, it composes — comedy *and* horror gives both — and the counts update
 * live so the size of the answer is visible before committing. Only genres
 * present in *this person's* library are offered, sorted by size: putting
 * "comedy 184" first is the difference between a menu and a suggestion.
 *
 * WHAT CHANGED AFTER THE USER GOT STUCK HERE. The screen used to open on the
 * three modes, with the list's actual contents pushed to the bottom below a
 * grid of candidates — so the first thing you saw on entering a list was
 * everything that was *not* in it. That is backwards, and it is most of why he
 * could not tell what this screen was. The list comes first now, with a cross
 * on every tile because "tap the poster to remove it" is not a thing anybody
 * guesses; adding is below it, where an action on a subject belongs.
 */
type Mode = "pick" | "type" | "genre";

export default function ListBuilder({
  listId,
  onDone,
}: {
  listId: string;
  onDone?: () => void;
}) {
  const lists = useDhawq((s) => s.lists);
  const swipes = useDhawq((s) => s.swipes);
  const addToList = useDhawq((s) => s.addToList);
  const removeFromList = useDhawq((s) => s.removeFromList);

  const list = lists.find((l) => l.id === listId);
  const inList = useMemo(() => new Set(list?.titleIds ?? []), [list?.titleIds]);

  /**
   * The catalog has to be here before anything below can name a film.
   *
   * Every read in this component goes through `getLocalTitle`, which answers
   * from memory and returns nothing until the catalog has been fetched. On the
   * deck that fetch has always already happened; arriving at this screen
   * directly — from a link, or a reload — it has not, so the library read as
   * empty and the genre chips as "you have watched nothing".
   */
  const [catalogReady, setCatalogReady] = useState(false);
  useEffect(() => {
    void loadCatalog().then(() => setCatalogReady(true));
  }, []);

  const [mode, setMode] = useState<Mode>("pick");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  /** everything this person has watched, newest first — the pick source */
  const library = useMemo(() => {
    const out: Title[] = [];
    void catalogReady;
    for (const sw of Object.values(swipes)) {
      if (sw.action === "not_seen") continue;
      const t = getLocalTitle(sw.titleId) ?? sw.title;
      if (t) out.push(t);
    }
    return out.reverse();
  }, [swipes, catalogReady]);

  const genres = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of library) {
      for (const g of t.genres) {
        const key = g.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [library]);

  const [chosenGenres, setChosenGenres] = useState<Set<string>>(new Set());
  const genreMatches = useMemo(() => {
    if (chosenGenres.size === 0) return [];
    return library.filter((t) =>
      t.genres.some((g) => chosenGenres.has(g.toLowerCase()))
    );
  }, [library, chosenGenres]);

  /** the whole catalog, for names that are not in the library yet */
  const typed = useMemo(() => {
    if (query.trim().length < 2) return [];
    void catalogReady;
    return searchCatalog(query, { limit: 24 });
  }, [query, catalogReady]);

  const pickable = useMemo(() => {
    if (!query.trim()) return library;
    return library.filter((t) => matches(t, query));
  }, [library, query]);

  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const commit = (ids: string[]) => {
    if (ids.length === 0) return;
    addToList(listId, ids);
    setPicked(new Set());
    setChosenGenres(new Set());
    setQuery("");
    onDone?.();
  };

  if (!list) return null;

  const shown = mode === "pick" ? pickable : mode === "type" ? typed : genreMatches;
  const pendingCount =
    mode === "genre"
      ? genreMatches.filter((t) => !inList.has(t.id)).length
      : picked.size;

  const contents = list.titleIds
    .map((id) => getLocalTitle(id))
    .filter((t): t is Title => Boolean(t));

  return (
    <motion.div variants={staggerContainer(0.04)} initial="hidden" animate="show">
      {/* ── what is in the list, first, because that is what a list is ── */}
      {contents.length > 0 && (
        <motion.div variants={FADE_UP} className="mb-8">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            <AnimatePresence initial={false}>
              {contents.map((t) => (
                <motion.button
                  key={t.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.86 }}
                  whileTap={{ scale: 0.93 }}
                  transition={SPRING_SNAPPY}
                  type="button"
                  onClick={() => removeFromList(listId, [t.id])}
                  aria-label={`Remove ${t.title.en}`}
                  className="relative block w-full min-w-0 overflow-hidden rounded-xl"
                >
                  <PosterArt title={t} sizes="110px" className="aspect-[2/3] w-full" />
                  <span className="absolute end-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-[rgb(var(--rgb-scrim)/0.62)] text-white backdrop-blur-sm">
                    <XIcon size={11} strokeWidth={3} />
                  </span>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
          <div className="mt-6 h-px bg-line" />
        </motion.div>
      )}

      {/* the three ways in — a segmented control, not three buttons */}
      <motion.div
        variants={FADE_UP}
        className="flex rounded-full border border-line bg-surface-2 p-1"
        dir="ltr"
      >
        {(
          [
            ["pick", "Your library"],
            ["type", "By name"],
            ["genre", "By genre"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setQuery("");
              setPicked(new Set());
            }}
            className={`relative flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
              mode === m ? "text-[color:var(--color-on-accent)]" : "text-ink-dim"
            }`}
          >
            {mode === m && (
              <motion.span
                layoutId="list-builder-mode"
                transition={SPRING_SNAPPY}
                className="absolute inset-0 rounded-full bg-accent"
              />
            )}
            <span className="relative">{label}</span>
          </button>
        ))}
      </motion.div>

      {mode !== "genre" && (
        <motion.label
          variants={FADE_UP}
          className="mt-3 flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3"
        >
          <SearchIcon size={17} className="shrink-0 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === "pick" ? "Filter your library" : "Type a name"}
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-faint"
          />
        </motion.label>
      )}

      {mode === "genre" && (
        <motion.div variants={FADE_UP} className="mt-3 flex flex-wrap gap-2">
          {genres.map(([g, n]) => {
            const on = chosenGenres.has(g);
            return (
              <motion.button
                key={g}
                type="button"
                whileTap={{ scale: 0.94 }}
                transition={SPRING_SNAPPY}
                onClick={() =>
                  setChosenGenres((s) => {
                    const next = new Set(s);
                    if (next.has(g)) next.delete(g);
                    else next.add(g);
                    return next;
                  })
                }
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                  on
                    ? "border-accent bg-accent text-[color:var(--color-on-accent)]"
                    : "border-line bg-surface text-ink-dim"
                }`}
              >
                {g} <span className="tabular-nums opacity-70">{n}</span>
              </motion.button>
            );
          })}
          {genres.length === 0 && (
            <div className="flex w-full justify-center gap-1.5 py-10">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-14 w-10 rounded-lg border border-dashed border-line"
                />
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* the result of whichever way was chosen */}
      <motion.div variants={FADE_UP} className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
        <AnimatePresence initial={false}>
          {shown.slice(0, 60).map((t) => {
            const already = inList.has(t.id);
            const on = mode === "genre" ? true : picked.has(t.id);
            return (
              <motion.button
                key={t.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: already ? 0.4 : 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={SPRING_SNAPPY}
                whileTap={{ scale: 0.93 }}
                type="button"
                disabled={mode === "genre" || already}
                onClick={() => toggle(t.id)}
                aria-label={t.title.en}
                className="relative block w-full min-w-0 overflow-hidden rounded-xl"
                style={{
                  boxShadow:
                    on && !already && mode !== "genre"
                      ? "0 0 0 3px var(--color-accent)"
                      : undefined,
                }}
              >
                <PosterArt title={t} sizes="110px" className="aspect-[2/3] w-full" />
                {(already || (on && mode !== "genre")) && (
                  <span className="absolute end-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-accent text-[color:var(--color-on-accent)]">
                    <CheckIcon size={12} strokeWidth={3} />
                  </span>
                )}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </motion.div>

      {/* the commit control only exists when there is something to commit */}
      <AnimatePresence>
        {pendingCount > 0 && (
          <motion.div
            initial={{ y: 90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 90, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-30 flex justify-center px-5"
          >
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              transition={SPRING_SNAPPY}
              onClick={() =>
                commit(mode === "genre" ? genreMatches.map((t) => t.id) : [...picked])
              }
              className="rounded-full bg-accent px-7 py-3.5 text-sm font-bold text-[color:var(--color-on-accent)] shadow-[0_10px_34px_rgb(var(--rgb-accent)/0.45)]"
            >
              Add {pendingCount}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
