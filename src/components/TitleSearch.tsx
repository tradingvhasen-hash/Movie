"use client";

import { useEffect, useMemo, useState } from "react";
import PosterArt from "./PosterArt";
import { normalise, searchText } from "@/lib/search";
import { getLocalCatalog, loadCatalog } from "@/lib/catalog";
import { useDhawq } from "@/lib/store";
import { EyeIcon, HeartIcon, ThumbsDownIcon } from "./ui/Icons";
import type { Title } from "@/lib/types";

/**
 * THE ONE THING THE VIEWER KNOWS THAT THE MODEL CANNOT GUESS: THE TITLE.
 *
 * Every mechanism in this project is an attempt to work out what someone has
 * watched. The person already knows. Making them wait for the gate to offer
 * *Snatch* — rank 379, reached somewhere around card 400 if the ordering
 * cooperates — when they could type six letters is spending the model's
 * weakest resource to save the viewer's strongest one.
 *
 * A real session: 1,100 cards, 207 titles recovered. Ten of those could have
 * been typed in the time one of them was swiped. This does not replace the
 * deck; it removes the deck's obligation to be exhaustive, which is the
 * obligation it cannot meet. The recommender's job becomes reducing how much
 * searching is needed, which is a problem it can actually win.
 *
 * The catalog is already in memory. This costs one input and a scan.
 */

export default function TitleSearch() {
  const [ready, setReady] = useState(false);
  const [q, setQ] = useState("");
  const swipe = useDhawq((s) => s.swipe);
  const swipes = useDhawq((s) => s.swipes);

  useEffect(() => {
    void loadCatalog().then(() => setReady(true));
  }, []);

  /** title text is prepared once, not on every keystroke */
  const index = useMemo(() => {
    if (!ready) return [] as { t: Title; hay: string }[];
    return getLocalCatalog().map((c) => ({
      t: c.title,
      /**
       * Three names, not two. The English one, the Arabic translation, and —
       * new — the name in the work's own script. Without the third, searching
       * `الفيل الأزرق` found nothing, because a film whose own name is Arabic
       * has no Arabic *translation* for us to have stored.
       */
      hay: searchText(c.title),
    }));
  }, [ready]);

  const results = useMemo(() => {
    const needle = normalise(q);
    if (needle.length < 2) return [];
    const starts: Title[] = [];
    const contains: Title[] = [];
    for (const { t, hay } of index) {
      if (hay.startsWith(needle)) starts.push(t);
      else if (hay.includes(needle)) contains.push(t);
      if (starts.length >= 40) break;
    }
    const by = (a: Title, b: Title) => b.voteCount - a.voteCount;
    return [...starts.sort(by), ...contains.sort(by)].slice(0, 40);
  }, [q, index]);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-32 pt-6">
      {/*
        This page was the only Arabic screen in an English app — heading, body,
        badges and even the button labels — which reads as a page from a
        different product. The interface language is English; the *catalog* is
        every language, which is what the placeholder now shows instead of
        saying it in a paragraph.

        The paragraph is gone under the same test as everywhere else. A search
        field with a cursor in it, three example titles in three scripts as its
        placeholder, and results appearing as you type explain this page
        completely. Two sentences arguing that searching is faster than waiting
        to be guessed at were arguing with somebody who had already arrived.
      */}
      <h1 className="text-2xl font-bold tracking-tight">Search</h1>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Snatch · American Pie · الفيل الأزرق"
        autoFocus
        className="mt-5 w-full rounded-2xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-accent"
      />

      <div className="mt-4 flex flex-col gap-2">
        {results.map((t) => {
          const known = swipes[t.id]?.action;
          return (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-2"
            >
              <div className="h-16 w-11 shrink-0 overflow-hidden rounded-lg">
                <PosterArt title={t} sizes="60px" className="h-full w-full" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{t.title.en}</div>
                <div className="text-[11px] text-ink-dim">
                  {t.year} · {t.type === "movie" ? "Film" : "Series"}
                  {known && (
                    <span className="ms-2 font-semibold text-accent">
                      {known === "liked"
                        ? "Loved"
                        : known === "disliked"
                          ? "Not for you"
                          : known === "seen"
                            ? "Watched"
                            : "Not seen"}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5" dir="ltr">
                <button
                  type="button"
                  aria-label="Not for me"
                  onClick={() => swipe(t, "disliked")}
                  className="grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-ink-dim active:scale-95"
                >
                  <ThumbsDownIcon size={17} />
                </button>
                <button
                  type="button"
                  aria-label="Watched it"
                  onClick={() => swipe(t, "seen")}
                  className="grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-ink-dim active:scale-95"
                >
                  <EyeIcon size={17} />
                </button>
                <button
                  type="button"
                  aria-label="Loved it"
                  onClick={() => swipe(t, "liked")}
                  className="grid h-10 w-10 place-items-center rounded-full bg-accent text-[color:var(--color-on-accent)] active:scale-95"
                >
                  <HeartIcon size={17} filled />
                </button>
              </div>
            </div>
          );
        })}
        {q.trim().length >= 2 && results.length === 0 && (
          <p className="py-10 text-center text-sm text-ink-faint">
            Nothing by that name in the catalog.
          </p>
        )}
      </div>
    </div>
  );
}
