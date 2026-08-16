"use client";

import { useEffect, useMemo, useState } from "react";
import PosterArt from "./PosterArt";
import { getLocalCatalog, loadCatalog } from "@/lib/catalog";
import { useDhawq } from "@/lib/store";
import { HeartIcon, ThumbsDownIcon } from "./ui/Icons";
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
function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    // Arabic orthography a person will not type consistently
    .replace(/[ـً-ْ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

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
      hay: `${normalise(c.title.title.en)} ${normalise(c.title.title.ar)}`,
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
      <h1 className="text-2xl font-bold tracking-tight">ابحث عمّا شاهدته</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-dim">
        اكتب اسم أي فيلم أو مسلسل تتذكّره وأضفه فورًا. أسرع طريقة لبناء مكتبتك
        هي أن تخبر الموقع بما تعرفه بدل أن ينتظر حتى يخمّنه.
      </p>

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
                  {t.year} · {t.type === "movie" ? "فيلم" : "مسلسل"}
                  {known && (
                    <span className="ms-2 font-semibold text-accent">
                      {known === "liked"
                        ? "أعجبك"
                        : known === "disliked"
                          ? "لم يعجبك"
                          : known === "seen"
                            ? "شاهدته"
                            : "لم تشاهده"}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5" dir="ltr">
                <button
                  type="button"
                  aria-label="لم يعجبني"
                  onClick={() => swipe(t, "disliked")}
                  className="grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-ink-dim active:scale-95"
                >
                  <ThumbsDownIcon size={17} />
                </button>
                <button
                  type="button"
                  aria-label="شاهدته"
                  onClick={() => swipe(t, "seen")}
                  className="rounded-full bg-surface-2 px-3 text-xs font-semibold text-ink-dim active:scale-95"
                >
                  شاهدته
                </button>
                <button
                  type="button"
                  aria-label="أعجبني"
                  onClick={() => swipe(t, "liked")}
                  className="grid h-10 w-10 place-items-center rounded-full bg-accent text-white active:scale-95"
                >
                  <HeartIcon size={17} filled />
                </button>
              </div>
            </div>
          );
        })}
        {q.trim().length >= 2 && results.length === 0 && (
          <p className="py-8 text-center text-sm text-ink-dim">
            لا شيء بهذا الاسم في الكتالوج.
          </p>
        )}
      </div>
    </div>
  );
}
