"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import PosterArt from "@/components/PosterArt";
import {
  EyeIcon,
  HeartIcon,
  SparklesIcon,
  ThumbsDownIcon,
  XIcon,
} from "@/components/ui/Icons";
import { getLocalTitle, loadCatalog } from "@/lib/catalog";
import { rank } from "@/lib/engine/rank-client";
import { genreLabel } from "@/lib/genres";
import { EASE_OUT, FADE_UP, SECTION, SPRING_SNAPPY, staggerContainer } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { useDhawq } from "@/lib/store";
import { locale, t } from "@/lib/i18n";
import type { Recommendation, SwipeAction } from "@/lib/types";

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
  const swipes = useDhawq((s) => s.swipes);
  const profile = useDhawq((s) => s.profile);
  const seed = useDhawq((s) => s.seed);
  const doSwipe = useDhawq((s) => s.swipe);
  const haptics = useDhawq((s) => s.settings.haptics);

  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState<Recommendation | null>(null);

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
    if (!hydrated) return;
    let stale = false;
    // discover shows unwatched titles: rated ones are excluded, "not seen" stays
    const exclude = Object.values(swipes)
      .filter((s) => s.action !== "not_seen")
      .map((s) => s.titleId);
    const likedIds = Object.values(swipes)
      .filter((s) => s.action === "liked")
      .map((s) => s.titleId);

    void rank({
      mode: "discover",
      profile,
      excludeIds: exclude,
      count: 25,
      seed,
      likedIds,
      dislikedIds: [],
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
  }, [hydrated, swipes, profile, seed]);

  const ratedCount = profile.ratedSwipes;
  const [hero, ...rest] = recs;

  const log = (rec: Recommendation, action: SwipeAction) => {
    haptic("commit", haptics);
    doSwipe(rec.title, action);
    setOpen(null);
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
                onClick={() => setOpen(hero)}
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
                    <h2 className="text-[22px] font-bold leading-tight text-white drop-shadow">
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
                    variants={FADE_UP}
                    exit={{ opacity: 0, scale: 0.9 }}
                    whileTap={{ scale: 0.94 }}
                    transition={SPRING_SNAPPY}
                    type="button"
                    onClick={() => setOpen(rec)}
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

      {/* ── one of them, up close ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col justify-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
          >
            <div
              className="absolute inset-0 bg-[rgb(var(--rgb-scrim)/0.55)] backdrop-blur-md"
              onClick={() => setOpen(null)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 340, damping: 34 }}
              className="relative z-10 max-h-[86dvh] overflow-y-auto rounded-t-[28px] border-t border-line bg-bg px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3"
            >
              <span className="mx-auto mb-4 block h-1 w-10 rounded-full bg-line" aria-hidden />

              <div className="flex gap-4">
                <div className="h-[132px] w-[88px] shrink-0 overflow-hidden rounded-2xl">
                  <PosterArt title={open.title} sizes="180px" className="h-full w-full" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold leading-tight tracking-tight">
                    {open.title.title[locale]}
                  </h2>
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

              {/*
                WHY THIS ONE — the only sentence on the screen, and it earns its
                place because it is the one thing the design cannot draw. A
                percentage says how confident; only this says what the
                confidence is *made of*, and without it the number is a claim
                the product refuses to support.
              */}
              <WhyLine rec={open} />

              <div className="mt-6 flex items-center gap-2.5" dir="ltr">
                <SheetAction
                  label={t("swipe.disliked")}
                  tint="var(--color-danger)"
                  onPress={() => log(open, "disliked")}
                >
                  <ThumbsDownIcon size={20} />
                </SheetAction>
                <SheetAction
                  label={t("swipe.seen")}
                  tint="var(--color-ink-strong)"
                  onPress={() => log(open, "seen")}
                >
                  <EyeIcon size={20} />
                </SheetAction>
                <SheetAction
                  label={t("swipe.liked")}
                  tint="var(--color-accent)"
                  onPress={() => log(open, "liked")}
                >
                  <HeartIcon size={20} filled />
                </SheetAction>
                <motion.button
                  type="button"
                  onClick={() => setOpen(null)}
                  whileTap={{ scale: 0.9 }}
                  transition={SPRING_SNAPPY}
                  aria-label={t("common.close")}
                  className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full border border-line text-ink-faint"
                >
                  <XIcon size={18} strokeWidth={2.4} />
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function WhyLine({ rec }: { rec: Recommendation }) {
  const because = rec.becauseOf ? getLocalTitle(rec.becauseOf) : null;
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

function SheetAction({
  label,
  tint,
  onPress,
  children,
}: {
  label: string;
  tint: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      onClick={onPress}
      whileTap={{ scale: 0.9 }}
      transition={SPRING_SNAPPY}
      style={{ height: 52, ["--tint" as string]: tint }}
      className="deck-action flex-1"
    >
      {children}
    </motion.button>
  );
}
