"use client";

/**
 * FOUR WAYS TO FILL A LIST, BECAUSE ONE WAY IS A CHORE.
 *
 * The user asked for exactly this and the reasoning holds up on its own: a list
 * builder that only offers "tap each title you want" is fine for five titles
 * and unusable for eighty, and eighty is the size of the list somebody actually
 * wants to share.
 *
 *   PICK      tap titles from your own library
 *   TYPE      search the whole catalog, including things you have not swiped
 *   GENRE     take everything of a kind you already loved, in one tap
 *
 * The genre option is the one that changes the product. "Everything comedic I
 * loved" is a thought a person has; expressing it as forty individual taps is
 * the interface making them do arithmetic. The genres offered are only the ones
 * present in their own library — a menu of every genre in the catalog would be
 * mostly empty answers.
 *
 * IT COPIES, IT NEVER MOVES. Stated explicitly by the user, and right: a list
 * is a *view* of the library, not a drawer taken out of it. Removing a title
 * from a list must never remove it from the library, and the same title belongs
 * in as many lists as its owner likes.
 */
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import PosterArt from "./PosterArt";
import { getLocalCatalog, getLocalTitle } from "@/lib/catalog";
import { matches } from "@/lib/search";
import { useDhawq } from "@/lib/store";
import { EASE_OUT, FADE_UP, QUICK, staggerContainer } from "@/lib/motion";
import { CheckIcon, SearchIcon } from "./ui/Icons";
import type { Title } from "@/lib/types";

type Mode = "pick" | "type" | "genre";

const MODES: { id: Mode; label: string }[] = [
  { id: "pick", label: "From my library" },
  { id: "type", label: "By name" },
  { id: "genre", label: "By genre" },
];

export default function ListBuilder({
  chosen,
  onToggle,
  onAddMany,
}: {
  chosen: Set<string>;
  onToggle: (id: string) => void;
  onAddMany: (ids: string[]) => void;
}) {
  const swipes = useDhawq((s) => s.swipes);
  const [mode, setMode] = useState<Mode>("pick");
  const [q, setQ] = useState("");

  /** the library, as titles rather than swipe records */
  const library = useMemo(() => {
    const out: Title[] = [];
    for (const sw of Object.values(swipes)) {
      if (sw.action !== "liked" && sw.action !== "seen") continue;
      const t = getLocalTitle(sw.titleId) ?? sw.title;
      if (t) out.push(t);
    }
    return out.sort((a, b) => b.voteCount - a.voteCount);
  }, [swipes]);

  /** only the genres this person's own library actually contains */
  const genres = useMemo(() => {
    const count = new Map<string, number>();
    for (const t of library) {
      for (const g of t.genres) count.set(g, (count.get(g) ?? 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]);
  }, [library]);

  const searchResults = useMemo(() => {
    if (q.trim().length < 2) return [];
    return getLocalCatalog()
      .filter((c) => matches(c.title, q))
      .sort((a, b) => b.title.voteCount - a.title.voteCount)
      .slice(0, 30)
      .map((c) => c.title);
  }, [q]);

  const shown = mode === "type" ? searchResults : library;

  return (
    <motion.div variants={staggerContainer(0.05)} initial="hidden" animate="show">
      <motion.div variants={FADE_UP} className="flex gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              mode === m.id
                ? "border-accent bg-accent text-[color:var(--color-on-accent)]"
                : "border-line bg-surface text-ink-dim"
            }`}
          >
            {m.label}
          </button>
        ))}
      </motion.div>

      <AnimatePresence mode="wait">
        {mode === "genre" ? (
          <motion.div
            key="genre"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: QUICK, ease: EASE_OUT }}
            className="mt-4 flex flex-wrap gap-2"
          >
            {genres.length === 0 && (
              <p className="text-sm text-ink-faint">Swipe a few cards first.</p>
            )}
            {genres.map(([g, n]) => {
              const ids = library.filter((t) => t.genres.includes(g)).map((t) => t.id);
              const all = ids.length > 0 && ids.every((id) => chosen.has(id));
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => onAddMany(ids)}
                  className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
                    all
                      ? "border-accent bg-accent/12 text-accent"
                      : "border-line bg-surface text-ink-dim hover:text-ink"
                  }`}
                >
                  {all && <CheckIcon size={14} />}
                  {g}
                  <span className="text-ink-faint">{n}</span>
                </button>
              );
            })}
          </motion.div>
        ) : (
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: QUICK, ease: EASE_OUT }}
          >
            {mode === "type" && (
              <div className="relative mt-4">
                <span className="pointer-events-none absolute inset-y-0 start-4 flex items-center text-ink-faint">
                  <SearchIcon size={17} />
                </span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Snatch · ワンピース · الفيل الأزرق"
                  className="w-full rounded-2xl border border-line bg-surface py-3 pe-4 ps-11 outline-none transition-colors focus:border-accent"
                />
              </div>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {shown.slice(0, 60).map((t) => {
                const on = chosen.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onToggle(t.id)}
                    aria-pressed={on}
                    className="relative overflow-hidden rounded-xl"
                  >
                    <PosterArt title={t} sizes="120px" className="aspect-[2/3] w-full" />
                    <span
                      className={`pointer-events-none absolute inset-0 rounded-xl transition-all ${
                        on ? "bg-accent/18 ring-2 ring-inset ring-accent" : "ring-0"
                      }`}
                    />
                    {on && (
                      <span className="absolute end-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-accent text-[color:var(--color-on-accent)]">
                        <CheckIcon size={13} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {mode === "pick" && library.length === 0 && (
              <p className="mt-6 text-center text-sm text-ink-faint">
                Swipe a few cards first.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
