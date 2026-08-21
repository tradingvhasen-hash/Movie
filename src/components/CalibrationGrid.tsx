"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PosterArt from "./PosterArt";
import { getLocalCatalog, loadCatalog } from "@/lib/catalog";
import type { Title } from "@/lib/types";

/**
 * THE ONLY UNBIASED SAMPLE OF A PERSON'S EXPOSURE THAT WILL EVER EXIST.
 *
 * Every label this project owns was chosen by the gate. The deck draws from
 * roughly the top 900 titles by vote count, so every "have you seen this?"
 * answer we have was asked about a title the model already believed was
 * likely. Every exposure model since has been fitted on the output of the
 * model it was meant to correct.
 *
 * That is why the vote count scored AUC 0.500 against real answers and was
 * declared worthless. It was measured on a sample truncated by vote count —
 * range restriction drives AUC toward 0.5 mechanically, and 0.500 is close to
 * the textbook artefact. The honest reading is far narrower: *within the top
 * 7% of the catalog fame has no residual power*, which says nothing at all
 * about ranks 900 to 12,826, and that is precisely the range the gate needs it
 * for.
 *
 * This screen breaks the loop. It draws a stratified random sample across the
 * whole catalog — equal numbers from each fifth of the fame ranking, films and
 * series in proportion — and asks one question. Nothing here is ranked, scored,
 * gated or personalised. The order is random. The answers are the first data in
 * this project that the engine did not choose.
 *
 * With them we can, for the first time: compute an honest AUC for any exposure
 * prior across the full depth; calibrate P(seen | title) rather than rank it;
 * and see the real shape of one person's recognition-versus-obscurity curve.
 */
const STRATA = 5;
const PER_STRATUM = 40;

/** deterministic per-seed shuffle, so a reload continues the same sample */
function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function sample(pool: Title[], seed: number): Title[] {
  const byKind = (kind: Title["type"]) =>
    pool.filter((t) => t.type === kind).sort((a, b) => b.voteCount - a.voteCount);
  const picked: Title[] = [];
  for (const kind of ["movie", "tv"] as const) {
    const list = byKind(kind);
    if (list.length === 0) continue;
    // films and series in proportion to the catalog, so the sample is not
    // quietly a film sample the way every behavioural source here already is
    const share = Math.round((PER_STRATUM * list.length) / pool.length);
    const size = Math.floor(list.length / STRATA);
    for (let s = 0; s < STRATA; s++) {
      const band = list.slice(s * size, s === STRATA - 1 ? list.length : (s + 1) * size);
      picked.push(...shuffled(band, seed + s * 977 + (kind === "tv" ? 31 : 0)).slice(0, share));
    }
  }
  return shuffled(picked, seed);
}

export default function CalibrationGrid() {
  const [ready, setReady] = useState(false);
  const [seed] = useState(() => Math.floor(Math.random() * 1e9));
  const [page, setPage] = useState(0);
  /**
   * TAPPED MEANS WATCHED, AND NOTHING ELSE IS AN ANSWER TO GIVE.
   *
   * This asked for two taps' worth of decision per poster — "watched" or "not
   * watched" — with a third state for "not answered", so 200 titles cost 200
   * deliberate choices. The user asked for the grid's shape instead: everything
   * starts at not-watched, one tap anywhere on a card flips it to watched, and
   * another tap flips it back.
   *
   * The cost is that "I did not answer" and "I have not seen it" stop being
   * distinguishable, and every title on a page he skims past is recorded as
   * unwatched. That is the right trade here: the base rate is about 5%, so the
   * overwhelming majority of correct answers are "no", and a sample where the
   * "no"s are free is a sample he will actually finish. It is the same argument
   * the /seen grid is built on.
   */
  const [watched, setWatched] = useState<Record<string, true>>({});

  useEffect(() => {
    void loadCatalog().then(() => setReady(true));
  }, []);

  const items = useMemo(
    () => (ready ? sample(getLocalCatalog().map((c) => c.title), seed) : []),
    [ready, seed]
  );
  const PER_PAGE = 24;
  const pages = Math.ceil(items.length / PER_PAGE);
  const view = items.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const picked = Object.keys(watched).length;
  // every title on a page the user has reached counts as answered
  const reached = Math.min(items.length, (page + 1) * PER_PAGE);

  const toggle = useCallback((id: string) => {
    setWatched((s) => {
      const next = { ...s };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  }, []);

  const download = () => {
    const rows = items
      .slice(0, reached)
      .map((t) => ({
        id: t.id,
        seen: t.id in watched,
        voteCount: t.voteCount,
        lang: t.originalLanguage,
        type: t.type,
        year: t.year,
      }));
    const blob = new Blob([JSON.stringify({ sample: rows }, null, 1)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `seenit-calibration-${rows.length}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-ink-dim">
        loading the catalog…
      </div>
    );
  }

  return (
    <div className="px-4 pb-40 pt-6">
      <h1 className="text-2xl font-bold tracking-tight">هل شاهدت هذا؟</h1>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-dim">
        عيّنة عشوائية تمامًا من الكتالوج كلّه — لا ترتيب، لا ترشيح، لا علاقة
        بذوقك. فيها المشهور والمغمور بالتساوي، أفلامًا ومسلسلات.{" "}
        <strong>انقر فقط ما شاهدته</strong> — نقرة واحدة في أي مكان على البطاقة،
        ونقرة ثانية تتراجع. كل ما لم تنقره يُحسب «لم أشاهده»، وهي إجابة ثمينة
        تمامًا. اضغط «تصدير» في النهاية وأرسل الملف.
      </p>

      <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {view.map((t) => {
          const on = t.id in watched;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t.id)}
              aria-pressed={on}
              /**
               * `min-w-0` and an explicit width, because this is a button and
               * a flex container. A flex item's automatic minimum size is its
               * *content*, so until the poster image has intrinsic dimensions
               * the long title decides how wide the card is: the columns blow
               * past the screen, `truncate` never bites and the rows overlap.
               * It looks correct the instant the images are cached and wrong
               * on the first load of a page, which is exactly when a person
               * sees it. The div this replaced was a block-level grid item and
               * had the behaviour for free.
               */
              className="flex w-full min-w-0 flex-col gap-1 text-left"
            >
              <div
                /**
                 * The 2:3 box belongs to the *card*, not to the image inside
                 * it. Hanging the ratio on the <img> alone means the card has
                 * no shape until a poster arrives, and a person opening this
                 * page for the first time is looking at exactly that moment.
                 * With the ratio here the grid is laid out correctly before a
                 * single byte of image has been fetched, and stays correct if
                 * one never arrives.
                 */
                className={`relative aspect-[2/3] w-full overflow-hidden rounded-xl border transition-all ${
                  on
                    ? "border-accent ring-2 ring-accent/60"
                    : "border-line opacity-60"
                }`}
              >
                <PosterArt title={t} sizes="140px" className="aspect-[2/3] w-full" />
                {on && (
                  <span className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-accent text-xs font-bold text-white">
                    ✓
                  </span>
                )}
              </div>
              <div className="w-full truncate text-center text-[10px] leading-tight text-ink-dim">
                {t.title.en} · {t.year}
              </div>
            </button>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <p className="text-xs tabular-nums text-ink-dim">
            <span className="font-semibold text-ink">{picked}</span> شاهدته ·{" "}
            {reached} / {items.length} · صفحة {page + 1} من {pages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={download}
              disabled={reached === 0}
              className="rounded-full border border-line px-4 py-2 text-sm font-semibold disabled:opacity-40"
            >
              تصدير
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
              disabled={page >= pages - 1}
              className="rounded-full bg-accent px-6 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              التالي
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
