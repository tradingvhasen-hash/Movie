"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import PosterArt from "@/components/PosterArt";
import { PlusIcon, SearchIcon, ShuffleIcon, SparklesIcon, XIcon } from "@/components/ui/Icons";
import { getLocalCatalog, loadCatalog } from "@/lib/catalog";
import { searchCatalog } from "@/lib/search";
import { rank } from "@/lib/engine/rank-client";
import { applySwipe, emptyProfile } from "@/lib/engine/taste";
import { vectorOf } from "@/lib/catalog";
import { genreLabel } from "@/lib/genres";
import { EASE_OUT, FADE_UP, SPRING_SNAPPY, staggerContainer } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { useDhawq } from "@/lib/store";
import { locale } from "@/lib/i18n";
import type { Title } from "@/lib/types";

/** five a side, which is more people than fit on a sofa */
const MAX_SLOTS = 10;

/**
 * TOGETHER — the screen you open with somebody else in the room.
 *
 * The user described this precisely and I built the wrong thing first, so both
 * versions are worth recording.
 *
 * WHAT I BUILT FIRST was a mode inside Discover called "From a few films": one
 * search field, a row of chips, a grid of answers. My argument was that "what
 * should I watch, from my library" and "what should I watch, from these two"
 * are the same question with different evidence, so they belong in one place.
 * His answer — "that's at all not what I suggested… this page is ridiculous.
 * Remove it" — is correct, and the reason my argument was wrong is that it
 * described the *computation* rather than the situation. Discover is a screen
 * for one person alone deciding what to watch next. This is a screen for two
 * or five people who have already sat down and cannot agree, and the thing
 * that makes it work is that everybody present can see their own film on the
 * screen, put there by their own hand.
 *
 * WHICH IS WHY IT IS SHAPED LIKE THIS. Two columns facing each other, up to
 * five a side, one button in the middle. That is not decoration: the layout is
 * the social fact it is modelling — your picks, their picks, and the answer
 * arriving between them. A single field with a row of chips flattens five
 * people into one queue and loses exactly the thing being negotiated.
 *
 * IT NEEDS NO ACCOUNT AND NO HISTORY. Everything else in this product is
 * downstream of a session; this is downstream of a sentence — name two films
 * and it names a third. That is also what makes it the only screen worth
 * handing to a stranger.
 *
 * HOW THE ANSWER IS COMPUTED. The obvious implementation is nearest-neighbours
 * on a vector, and it is strictly weaker than what this engine already does:
 * it ignores the co-watch graph, the rarity weighting and the facet tables. So
 * the chosen films are swiped *right* into a throwaway profile and the real
 * ranker runs against it. A handful of films makes a small, confident taste,
 * which is exactly what the engine is built to consume — and it means this
 * screen improves every time the engine does. Nothing here touches the stored
 * profile; the temporary one is created, used and dropped inside a `useMemo`.
 */
export default function TogetherPage() {
  const [ready, setReady] = useState(false);
  const [slots, setSlots] = useState<(Title | null)[]>([null, null]);
  const [editing, setEditing] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  const [showing, setShowing] = useState(false);
  const haptics = useDhawq((s) => s.settings.haptics);

  useEffect(() => {
    void loadCatalog().then(() => setReady(true));
  }, []);

  const chosen = useMemo(() => slots.filter((s): s is Title => Boolean(s)), [slots]);

  /**
   * The answer, and two more behind it.
   *
   * Three rather than one because the first suggestion being wrong is not a
   * failure of the model, it is a group of people having opinions — and
   * "another" has to be instant or nobody presses it twice.
   */
  const [answers, setAnswers] = useState<Title[]>([]);
  useEffect(() => {
    if (chosen.length < 2) {
      setAnswers([]);
      return;
    }
    let stale = false;
    let profile = emptyProfile();
    for (const t of chosen) profile = applySwipe(profile, t, vectorOf(t), "liked");
    void rank({
      mode: "discover",
      profile,
      excludeIds: chosen.map((t) => t.id),
      count: 8,
      seed: 11,
      likedIds: chosen.map((t) => t.id),
      dislikedIds: [],
    }).then((r) => {
      if (!stale) setAnswers(r.titles);
    });
    return () => {
      stale = true;
    };
  }, [chosen]);

  const answer = answers.length > 0 ? answers[round % answers.length] : null;

  const setSlot = (i: number, title: Title | null) => {
    setSlots((s) => s.map((v, k) => (k === i ? title : v)));
    setShowing(false);
  };

  const addSlot = () => {
    if (slots.length >= MAX_SLOTS) return;
    setSlots((s) => [...s, null]);
    setEditing(slots.length);
  };

  const removeSlot = (i: number) => {
    setSlots((s) => (s.length <= 2 ? s.map((v, k) => (k === i ? null : v)) : s.filter((_, k) => k !== i)));
    setShowing(false);
  };

  const left = slots.map((s, i) => ({ s, i })).filter(({ i }) => i % 2 === 0);
  const right = slots.map((s, i) => ({ s, i })).filter(({ i }) => i % 2 === 1);

  return (
    <motion.div
      variants={staggerContainer(0.06)}
      initial="hidden"
      animate="show"
      className="mx-auto max-w-md px-5 pb-28 pt-6"
    >
      <motion.h1 variants={FADE_UP} className="text-[26px] font-bold tracking-[-0.03em]">
        Together
      </motion.h1>

      {/*
        ONE SENTENCE, AND ONLY UNTIL IT IS NO LONGER NEEDED.

        Everywhere else in this app a line of text that restates its own screen
        gets deleted. This one survives the test, because this interaction does
        not exist anywhere else: nobody has seen two facing columns of posters
        with a button between them before, and no arrangement of empty squares
        can say "everyone picks one they love". It disappears the moment the
        first film is named, which is the moment it stops being true that the
        person does not know what this is.
      */}
      <AnimatePresence initial={false}>
        {chosen.length === 0 && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: EASE_OUT }}
            className="overflow-hidden text-sm leading-relaxed text-ink-dim"
          >
            <span className="mt-1.5 block">
              Everyone names a film they love. It finds one for all of you.
            </span>
          </motion.p>
        )}
      </AnimatePresence>

      <motion.div variants={FADE_UP} className="relative mt-6">
        <div className="grid grid-cols-2 gap-x-[84px] gap-y-3">
          <div className="space-y-3">
            {left.map(({ s, i }) => (
              <Slot
                key={i}
                title={s}
                onOpen={() => setEditing(i)}
                onClear={() => removeSlot(i)}
              />
            ))}
          </div>
          <div className="space-y-3">
            {right.map(({ s, i }) => (
              <Slot
                key={i}
                title={s}
                onOpen={() => setEditing(i)}
                onClear={() => removeSlot(i)}
              />
            ))}
          </div>
        </div>

        {/*
          THE BUTTON IN THE MIDDLE, WHICH IS THE WHOLE PRODUCT ON THIS SCREEN.

          It sits between the two columns rather than under them because that
          is where the answer belongs — between the people asking. It is
          disabled until two films are named, and it says so by being quiet
          rather than by printing a sentence about it.
        */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center">
          <motion.button
            type="button"
            disabled={chosen.length < 2}
            onClick={() => {
              haptic("commit", haptics);
              setRound((r) => r + 1);
              setShowing(true);
            }}
            whileTap={chosen.length >= 2 ? { scale: 0.9 } : undefined}
            animate={{
              scale: chosen.length >= 2 ? 1 : 0.86,
              opacity: chosen.length >= 2 ? 1 : 0.45,
            }}
            transition={SPRING_SNAPPY}
            className="pointer-events-auto grid h-[68px] w-[68px] place-items-center rounded-full border border-line bg-surface text-accent shadow-[0_10px_30px_rgb(var(--rgb-shadow)/0.16)] disabled:text-ink-faint"
            aria-label="Find something for all of us"
          >
            <SparklesIcon size={26} strokeWidth={1.9} />
          </motion.button>
        </div>
      </motion.div>

      {slots.length < MAX_SLOTS && (
        <motion.button
          variants={FADE_UP}
          type="button"
          onClick={addSlot}
          whileTap={{ scale: 0.97 }}
          transition={SPRING_SNAPPY}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-ink-faint/40 bg-surface py-3.5 text-sm font-semibold text-ink-dim transition-colors hover:text-ink"
          aria-label="One more person"
        >
          <PlusIcon size={18} strokeWidth={2.4} />
        </motion.button>
      )}

      {/* ── the answer, in the middle, over the picks that produced it ── */}
      <AnimatePresence>
        {showing && answer && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
          >
            <motion.div
              className="absolute inset-0 bg-[rgb(var(--rgb-scrim)/0.62)] backdrop-blur-md"
              onClick={() => setShowing(false)}
            />
            <motion.div
              key={answer.id}
              initial={{ opacity: 0, y: 28, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="soft-card relative z-10 w-full max-w-[320px] overflow-hidden"
            >
              <div className="relative">
                <PosterArt title={answer} sizes="360px" className="aspect-[2/3] w-full" />
                <div className="card-sheen absolute inset-0" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <h2 className="text-xl font-bold leading-tight text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.5)]">
                    {answer.title[locale]}
                  </h2>
                  <p className="mt-1 text-[11px] font-medium text-white/70">
                    {answer.year}
                    {answer.genres.slice(0, 2).map((g) => (
                      <span key={g}> · {genreLabel(g, locale)}</span>
                    ))}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  transition={SPRING_SNAPPY}
                  onClick={() => {
                    haptic("tick", haptics);
                    setRound((r) => r + 1);
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full border border-line py-3 text-sm font-semibold text-ink-dim"
                >
                  <ShuffleIcon size={17} />
                  Another
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  transition={SPRING_SNAPPY}
                  onClick={() => setShowing(false)}
                  className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full bg-accent text-[color:var(--color-on-accent)]"
                  aria-label="Close"
                >
                  <XIcon size={18} strokeWidth={2.6} />
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── naming a film for one square ── */}
      <AnimatePresence>
        {editing !== null && (
          <PickSheet
            ready={ready}
            taken={new Set(chosen.map((t) => t.id))}
            onPick={(t) => {
              setSlot(editing, t);
              setEditing(null);
            }}
            onClose={() => setEditing(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** one person's square: a poster, or a place to put one */
function Slot({
  title,
  onOpen,
  onClear,
}: {
  title: Title | null;
  onOpen: () => void;
  onClear: () => void;
}) {
  return (
    <div className="relative">
      <motion.button
        type="button"
        onClick={onOpen}
        whileTap={{ scale: 0.95 }}
        transition={SPRING_SNAPPY}
        className={`block aspect-[2/3] w-full overflow-hidden rounded-2xl ${
          title
            ? "shadow-[0_6px_20px_rgb(var(--rgb-shadow)/0.14)]"
            : /* The user: "everything about it is faded, you barely can see the
                 squares, you barely see the plus button, you barely see
                 anything." A dashed hairline in `--color-line` on the page
                 background is a hole in the layout; this is a surface with an
                 edge, which is a place something goes. */
              "grid place-items-center gap-1.5 border-2 border-dashed border-ink-faint/40 bg-surface text-ink-dim"
        }`}
        aria-label={title ? title.title.en : "Name a film"}
      >
        {title ? (
          <PosterArt title={title} sizes="160px" className="h-full w-full" />
        ) : (
          <>
            <SearchIcon size={22} />
            <span className="text-[11px] font-semibold">Name one</span>
          </>
        )}
      </motion.button>

      <AnimatePresence>
        {title && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={SPRING_SNAPPY}
            onClick={onClear}
            className="absolute -end-1.5 -top-1.5 grid h-[22px] w-[22px] place-items-center rounded-full bg-[rgb(var(--rgb-scrim)/0.62)] text-white shadow-md backdrop-blur-sm"
            aria-label="Remove"
          >
            <XIcon size={11} strokeWidth={3} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * The sheet that names a film.
 *
 * A sheet rather than an inline field for the reason every phone platform uses
 * one: the keyboard takes half the screen, and a field that stays in place
 * while the results it produces are pushed under the keyboard is the single
 * most common way a mobile search is made unusable.
 */
function PickSheet({
  ready,
  taken,
  onPick,
  onClose,
}: {
  ready: boolean;
  taken: Set<string>;
  onPick: (t: Title) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");

  /**
   * IT OPENS FULL, NOT EMPTY.
   *
   * The user: "when you press the square there is a whole big page that is
   * blank and only contains a bar to search the movie. It's complicated, I
   * don't like it."
   *
   * The sheet was never a whole page — it is 78dvh — but it *was* blank, and
   * blank is what he actually saw: nothing appeared until the second character
   * was typed, so opening it presented an empty rectangle and a keyboard and
   * asked the person to guess what belonged in it.
   *
   * A screen that asks "name a film you love" already knows what most answers
   * look like: they are famous. So before a single key is pressed it shows the
   * most-recognised titles in the catalog, which turns a blank prompt into a
   * grid you can simply tap — and typing still narrows it the moment you start.
   */
  const suggestions = useMemo(() => {
    if (!ready) return [];
    return getLocalCatalog()
      .map((c) => c.title)
      .filter((t) => !taken.has(t.id))
      .sort((a, b) => b.voteCount - a.voteCount)
      .slice(0, 30);
  }, [ready, taken]);

  const results = useMemo(() => {
    if (!ready) return [];
    if (q.trim().length < 2) return suggestions;
    return searchCatalog(q, { limit: 30, skip: (id) => taken.has(id) });
  }, [ready, q, taken, suggestions]);

  return (
    <motion.div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* the scrim owns its own, unhurried fade — see the Discover sheet for
          why the shared 180ms wrapper fade read as a hard cut in both places */}
      <motion.div
        className="absolute inset-0 bg-[rgb(var(--rgb-scrim)/0.5)] backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.3, ease: EASE_OUT } }}
        transition={{ duration: 0.38, ease: EASE_OUT }}
        onClick={onClose}
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%", transition: { duration: 0.34, ease: [0.4, 0, 0.7, 1] } }}
        transition={{ type: "spring", stiffness: 210, damping: 30, mass: 1 }}
        /* a definite height, not a maximum.
           With `max-h` and a `flex-1` scroll area, the scroller's flex-basis of
           0 contributes nothing to an auto-height parent — so the sheet sized
           itself to the search field alone and the results spilled off the
           bottom of the screen. A search sheet wants a stable height anyway:
           it should not resize under the thumb as results arrive. */
        className="relative z-10 flex h-[78dvh] flex-col rounded-t-[28px] border-t border-line bg-bg px-5 pb-[env(safe-area-inset-bottom)] pt-3"
      >
        <span className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-line" aria-hidden />

        <label className="flex shrink-0 items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3">
          <SearchIcon size={18} className="shrink-0 text-ink-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Snatch · Inception · الفيل الأزرق"
            className="w-full bg-transparent text-base outline-none placeholder:text-ink-faint"
          />
        </label>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-4">
          <div className="grid grid-cols-3 gap-2.5">
            {results.map((t) => (
              <motion.button
                key={t.id}
                type="button"
                whileTap={{ scale: 0.93 }}
                transition={SPRING_SNAPPY}
                onClick={() => onPick(t)}
                className="block w-full min-w-0 overflow-hidden rounded-xl bg-surface-2"
                aria-label={t.title.en}
              >
                <PosterArt title={t} sizes="130px" className="aspect-[2/3] w-full" />
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
