"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import PosterArt from "@/components/PosterArt";
import {
  EyeIcon,
  HeartIcon,
  SparklesIcon,
  ThumbsDownIcon,
} from "@/components/ui/Icons";
import { getLocalTitle } from "@/lib/catalog";
import { rank } from "@/lib/engine/rank-client";
import { genreLabel } from "@/lib/genres";
import { EASE_OUT, FADE_UP, SECTION, SPRING_SNAPPY, staggerContainer } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { useDhawq } from "@/lib/store";
import { useLocale, useT } from "@/lib/i18n";
import type { Recommendation, SwipeAction } from "@/lib/types";
import { useDialogKeyboard } from "@/lib/useDialogKeyboard";

/**
 * DISCOVER — what to watch next, and nothing else.
 *
 * Three things were removed from this screen and each removal was asked for.
 *
 *   THE "FROM A FEW FILMS" MODE. I put the name-two-films feature here as a
 *   second mode, arguing that "what should I watch from my library" and "what
 *   should I watch from these two" are one question with different evidence.
 *   The user: "that's at all not what I suggested… this page is ridiculous.
 *   Remove it." He is right — my argument described the computation, not the
 *   situation. That feature is about several people in a room disagreeing, and
 *   it now has the screen it deserves at /together.
 *
 *   THE ⓘ TOOLTIP. Removed outright rather than repositioned. It existed to
 *   explain how ranking works, which is a question this screen should answer
 *   by *being right*, and a control whose only job is to apologise for the
 *   screen it sits on is a control that should not be there.
 *
 *   THE SEARCH FIELD. Searching now happens in the library, which is where the
 *   result of a search goes. Two fields in two tabs answering the same words
 *   differently was the confusion, not the convenience.
 *
 * WHAT IS LEFT is one hero and a grid, and a sheet when you want to know more
 * about one of them. The hero exists because a recommender that returns
 * twenty-four equal squares has not actually recommended anything — it has
 * handed the decision back. The first answer is the answer; the rest are the
 * argument that it was not a fluke.
 */
export default function DiscoverPage() {
  const locale = useLocale();
  const t = useT();
  const swipes = useDhawq((s) => s.swipes);
  const profile = useDhawq((s) => s.profile);
  const seed = useDhawq((s) => s.seed);
  const doSwipe = useDhawq((s) => s.swipe);
  const haptics = useDhawq((s) => s.settings.haptics);

  const [open, setOpen] = useState<Recommendation | null>(null);
  const detailDialogRef = useRef<HTMLDivElement>(null);
  useDialogKeyboard(Boolean(open), detailDialogRef, () => setOpen(null));

  /**
   * The answers, ranked on a worker thread.
   *
   * This was a `useMemo` running the full ranker inline, and it was the single
   * worst moment in the whole app: measured on a phone-speed CPU, **1,261ms of
   * completely frozen page** every time this tab was opened. The page could
   * not paint, the tab bar could not respond, and the nav animation the viewer
   * had just triggered stopped mid-way — which is exactly the "one frame per
   * second" the user described.
   *
   * It is the same function on the same data; it simply runs somewhere the
   * interface is not. The screen paints immediately and the grid arrives when
   * it is ready, which on the same phone is about a second later — a second
   * during which everything still moves.
   */
  const [recs, setRecs] = useState<Recommendation[]>([]);

  useEffect(() => {
    let stale = false;
    // discover shows unwatched titles: rated ones are excluded, "not seen" stays
    const exclude = Object.values(swipes)
      .filter((s) => s.action !== "not_seen")
      .map((s) => s.titleId);
    const likedIds = Object.values(swipes)
      .filter((s) => s.action === "liked")
      .map((s) => s.titleId);
    const dislikedIds = Object.values(swipes)
      .filter((s) => s.action === "disliked")
      .map((s) => s.titleId);
    const seenIds = Object.values(swipes)
      .filter((s) => s.action === "seen")
      .map((s) => s.titleId);

    void rank({
      mode: "discover",
      profile,
      excludeIds: exclude,
      count: 25,
      seed,
      likedIds,
      dislikedIds,
      seenIds,
      withReasons: true,
    }).then((r) => {
      if (stale) return;
      setRecs(
        r.titles.map((title, i) => ({
          title,
          score: 0,
          match: r.match[i],
          reasons: r.reasons[i].map((label) => ({ kind: "", label })),
          becauseOf: r.becauseOf[i] ?? undefined,
        }))
      );
    });
    return () => {
      stale = true;
    };
  }, [swipes, profile, seed]);

  const ratedCount = profile.ratedSwipes;

  /**
   * A VERDICT NO LONGER SHUTS THE SHEET.
   *
   * The user: "let's say I press any of those three buttons — the whole square
   * that shows you the story just disappears. Maybe I want to continue reading
   * the story of the movie, but I just want to press like. I don't see the need
   * for that."
   *
   * He is right, and the old behaviour was a category error: closing is
   * navigation, and answering is not. Recording a verdict now records a verdict
   * and nothing else. The sheet stays where it is, the buttons show which
   * answer was given, and the person leaves when they have decided to leave.
   */
  const answered: SwipeAction | null = open
    ? (swipes[open.title.id]?.action ?? null)
    : null;

  /**
   * WHY A CARD USED TO VANISH INSTEAD OF LEAVING.
   *
   * The user: "the moment you press the dislike or whatever button, the card of
   * the movie just disappears from the cards in the discover page. I know why —
   * it went to the library. But it literally just disappeared. Now it exists,
   * now it does not. There is no animation, no effect. That's not a luxurious
   * website, that's a cheap website."
   *
   * The grid already had an `AnimatePresence` with an exit on every tile, which
   * is why this took reading rather than guessing. The exit never ran because
   * nothing was ever *removed*: recording a verdict changes the swipe history,
   * which re-runs the ranker, which replaces the entire `recs` array. framer
   * saw a wholesale swap of fourteen keys rather than one key leaving, so there
   * was no departing element to animate — the old list was simply gone.
   *
   * Holding the answered id here removes exactly one tile, immediately, which
   * is a thing `AnimatePresence` can see and play. The re-rank still happens
   * and still excludes it — it just no longer has to be the mechanism that
   * takes it off the screen.
   */
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const [hero, ...rest] = recs.filter((r) => !dismissed.has(r.title.id));

  const log = (rec: Recommendation, action: SwipeAction) => {
    haptic("commit", haptics);
    doSwipe(rec.title, action);
    setDismissed((prev) => new Set(prev).add(rec.title.id));
  };

  return (
    <motion.div
      variants={staggerContainer(0.06)}
      initial="hidden"
      animate="show"
      className="px-5 pb-28 pt-6"
    >
      <motion.h1 variants={FADE_UP} className="text-[26px] font-bold tracking-[-0.03em]">
        {t("discover.title")}
      </motion.h1>

      <AnimatePresence mode="wait" initial={false}>
        {ratedCount === 0 ? (
          <motion.div
            key="empty"
            variants={SECTION}
            initial="hidden"
            animate="show"
            exit="exit"
            className="mt-16 flex flex-col items-center text-center"
          >
            <SparklesIcon size={50} strokeWidth={1.3} className="text-ink-faint" />
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
            {/* ── the answer ── */}
            {hero && (
              <motion.button
                variants={FADE_UP}
                type="button"
                onClick={() => {
                  setOpen(hero);
                }}
                whileTap={{ scale: 0.985 }}
                transition={SPRING_SNAPPY}
                className="soft-card mt-5 block w-full overflow-hidden text-left"
              >
                <div className="relative">
                  {/* 4:5 rather than a wide banner: a 2:3 poster cropped to 16:10
                      loses more than half its height, which on most posters is the
                      title art — the one part that has to survive */}
                  <PosterArt title={hero.title} sizes="480px" className="aspect-[4/5] w-full" />
                  <div className="card-sheen absolute inset-0" />

                  <span className="absolute end-3 top-3 rounded-full bg-[rgb(var(--rgb-scrim)/0.5)] px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur-md">
                    {hero.match}%
                  </span>

                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <h2 className="text-[22px] font-bold leading-tight text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.5)]">
                      {hero.title.title[locale]}
                    </h2>
                    <p className="mt-1 text-[11.5px] font-medium text-white/70">
                      {hero.title.year}
                      {hero.title.genres.slice(0, 2).map((g) => (
                        <span key={g}> · {genreLabel(g, locale)}</span>
                      ))}
                    </p>
                  </div>
                </div>
              </motion.button>
            )}

            {/* ── the rest ── */}
            <motion.div
              variants={staggerContainer(0.035)}
              initial="hidden"
              animate="show"
              className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6"
            >
              <AnimatePresence>
                {rest.map((rec) => (
                  <motion.button
                    key={rec.title.id}
                    layout="position"
                    variants={FADE_UP}
                    /* long enough to read as a departure rather than a delete,
                       and the survivors close the gap on `layout` instead of
                       snapping into it */
                    exit={{
                      opacity: 0,
                      scale: 0.86,
                      transition: { duration: 0.32, ease: EASE_OUT },
                    }}
                    whileTap={{ scale: 0.94 }}
                    transition={SPRING_SNAPPY}
                    type="button"
                    onClick={() => {
                      setOpen(rec);
                    }}
                    aria-label={rec.title.title.en}
                    className="relative block w-full min-w-0 overflow-hidden rounded-2xl bg-surface-2 shadow-[0_3px_12px_rgb(var(--rgb-shadow)/0.08)]"
                  >
                    <PosterArt title={rec.title} sizes="160px" className="aspect-[2/3] w-full" />
                    <span className="absolute end-1.5 top-1.5 rounded-full bg-[rgb(var(--rgb-scrim)/0.55)] px-1.5 py-0.5 text-[9.5px] font-bold tabular-nums text-white backdrop-blur-sm">
                      {rec.match}
                    </span>
                  </motion.button>
                ))}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fast detail: a floating card, not a second page sliding over this one. */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 grid place-items-center px-4 pb-[calc(88px+env(safe-area-inset-bottom))] pt-[calc(20px+env(safe-area-inset-top))]"
            initial="hidden"
            animate="show"
            exit="hidden"
          >
            <motion.button
              type="button"
              aria-label={t("common.close")}
              className="absolute inset-0 bg-[rgb(var(--rgb-scrim)/0.42)]"
              variants={{
                hidden: { opacity: 0 },
                show: { opacity: 1 },
              }}
              transition={{ duration: 0.16, ease: EASE_OUT }}
              onClick={() => setOpen(null)}
            />

            <motion.div
              ref={detailDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="discover-detail-title"
              tabIndex={-1}
              variants={{
                hidden: { opacity: 0, y: 10, scale: 0.975 },
                show: { opacity: 1, y: 0, scale: 1 },
              }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              className="relative z-10 max-h-[78dvh] w-full max-w-md overflow-y-auto rounded-[28px] border border-line bg-surface p-5 shadow-[0_24px_70px_rgb(var(--rgb-shadow)/0.3)]"
            >
              <div className="flex gap-4">
                <div className="h-[132px] w-[88px] shrink-0 overflow-hidden rounded-2xl">
                  <PosterArt title={open.title} sizes="180px" className="h-full w-full" />
                </div>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex items-start justify-between gap-3">
                    <h2
                      id="discover-detail-title"
                      className="text-xl font-bold leading-tight tracking-tight"
                    >
                      {open.title.title[locale]}
                    </h2>
                    <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[10.5px] font-bold text-accent">
                      {open.match}%
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-ink-faint">
                    {open.title.year} ·{" "}
                    {open.title.type === "movie" ? t("card.movie") : t("card.tv")}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {open.title.genres.slice(0, 3).map((g) => (
                      <span
                        key={g}
                        className="rounded-full bg-surface-2 px-2.5 py-1 text-[10.5px] font-semibold capitalize text-ink-dim"
                      >
                        {genreLabel(g, locale)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {open.title.overview[locale] && (
                <p className="mt-4 text-[13.5px] leading-relaxed text-ink-dim">
                  {open.title.overview[locale]}
                </p>
              )}

              <WhyLine rec={open} />

              <div className="mt-5 flex items-center gap-2.5" dir="ltr">
                <SheetAction
                  label={t("swipe.disliked")}
                  tint="var(--color-danger)"
                  chosen={answered === "disliked"}
                  onPress={() => log(open, "disliked")}
                >
                  <ThumbsDownIcon size={20} filled={answered === "disliked"} />
                </SheetAction>
                <SheetAction
                  label={t("swipe.seen")}
                  tint="var(--color-ink-strong)"
                  chosen={answered === "seen"}
                  onPress={() => log(open, "seen")}
                >
                  <EyeIcon size={20} />
                </SheetAction>
                <SheetAction
                  label={t("swipe.liked")}
                  tint="var(--color-accent)"
                  chosen={answered === "liked"}
                  onPress={() => log(open, "liked")}
                >
                  <HeartIcon size={20} filled />
                </SheetAction>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function WhyLine({ rec }: { rec: Recommendation }) {
  const locale = useLocale();
  const t = useT();
  const savedBecause = useDhawq((state) =>
    rec.becauseOf ? state.swipes[rec.becauseOf] : undefined
  );
  const because = rec.becauseOf
    ? getLocalTitle(rec.becauseOf) ?? savedBecause?.title ?? null
    : null;
  const why = rec.reasons.map((r) => r.label).join(" · ");
  if (!why && !because) return null;
  return (
    <div className="mt-5 rounded-2xl bg-surface-2 px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-accent">
        <SparklesIcon size={13} strokeWidth={2.2} />
        {rec.match}%
      </div>
      {why && <p className="mt-1.5 text-[13px] capitalize text-ink-dim">{why}</p>}
      {because && (
        <p className="mt-0.5 text-[12.5px] text-ink-faint">
          {t("discover.becauseYouLiked")} {because.title[locale]}
        </p>
      )}
    </div>
  );
}

/**
 * THE THREE ANSWERS, AT THE WEIGHT OF THE SURFACE THEY SIT ON.
 *
 * The user: "the whole square is a milk colour, and then you go to the buttons
 * and it is a white that is so lighting. It does not fit the place. The buttons
 * feel so highlighted that it's too much."
 *
 * He is reading a real mismatch. These reused `.deck-action`, which is designed
 * to sit on the *page* background — a raised white pill with a lifted shadow,
 * because on the deck it has to read as a floating control over a photograph.
 * Inside a sheet that is itself a raised near-white surface, the same treatment
 * has nothing to be raised above, so it just glares.
 *
 * On a surface, a control is defined by its edge rather than by its elevation.
 * These are now the sheet's own tone with a hairline border and no shadow —
 * and the one that has been pressed fills with its verdict colour, which is
 * both the confirmation that was missing and the only saturated thing in the
 * row.
 */
function SheetAction({
  label,
  tint,
  chosen,
  onPress,
  children,
}: {
  label: string;
  tint: string;
  chosen?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      aria-pressed={chosen}
      title={label}
      onClick={onPress}
      whileTap={{ scale: 0.94 }}
      animate={{
        backgroundColor: chosen ? tint : "rgb(var(--rgb-surface-2) / 1)",
        color: chosen ? "var(--color-on-accent)" : "var(--color-ink-dim)",
        borderColor: chosen ? tint : "var(--color-line)",
      }}
      transition={{ duration: 0.14, ease: EASE_OUT }}
      style={{ height: 52 }}
      className="flex flex-1 items-center justify-center rounded-full border"
    >
      {children}
    </motion.button>
  );
}
