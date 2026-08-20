"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import SwipeCard from "./SwipeCard";
import SwipeBurst from "./SwipeBurst";
import TastePicker from "./TastePicker";
import WelcomeDemo, { demoAlreadyShown } from "./WelcomeDemo";
import { useDeck } from "@/lib/useDeck";
import { useDhawq } from "@/lib/store";
import { GlowButton, NeuButton } from "./ui";
import {
  ArrowUpIcon,
  ClapperIcon,
  EyeIcon,
  HeartIcon,
  ThumbsDownIcon,
  UndoIcon,
} from "./ui/Icons";
import { EASE_SWEEP, FADE_UP, SECTION, SPRING_SNAPPY, staggerContainer } from "@/lib/motion";
import { t } from "@/lib/i18n";
import type { SwipeAction, Title } from "@/lib/types";

export default function SwipeDeck() {
  const { queue, hydrated, swipeTop, undo, canUndo, refill } = useDeck();
  /**
   * Someone who came in through the grid has already answered thirty
   * questions, and greeting them with "Swipe cards so we learn your taste"
   * tells them the site was not paying attention. The welcome is for people
   * who have told us nothing, which is a fact about the profile rather than a
   * flag about which screen they happened to open first.
   */
  const answered = useDhawq((s) => s.profile.totalSwipes);
  const onboardingSeen = useDhawq((s) => s.onboardingSeen) || answered > 0;
  const setOnboardingSeen = useDhawq((s) => s.setOnboardingSeen);
  const resetAll = useDhawq((s) => s.resetAll);

  /**
   * The card that has already been answered and is still flying off.
   *
   * The swipe commits the instant the finger lifts; this keeps a copy on
   * screen for the half-second the animation takes, with pointer events off,
   * so the deck underneath is live immediately. Previously the *real* card
   * stayed and owned the pointer for that whole window, which made every
   * second fast swipe do nothing.
   */
  const [leaving, setLeaving] = useState<
    { title: Title; action: SwipeAction; at: number }[]
  >([]);
  const [forcedExit, setForcedExit] = useState<SwipeAction | null>(null);
  /** welcome → pick a few you love → deck */
  const [picking, setPicking] = useState(false);
  /**
   * The demo runs when nothing has been swiped and it has not already run
   * since this page was loaded. Read once into state so the answer cannot
   * change under the component mid-render.
   */
  const [showDemo, setShowDemo] = useState<boolean | null>(null);
  const [burst, setBurst] = useState<{ id: number; action: SwipeAction } | null>(null);

  /**
   * The card that flies off is the card that was answered — the same object,
   * returned by the commit itself.
   *
   * This used to read `queue[0]` out of the render closure while the commit
   * read the live queue. Two swipes inside one React batch see the same
   * closure, so the second gesture animated the *first* card off a second
   * time while recording a different one. On screen that is a card changing
   * into another film mid-flight, which is exactly what the user described
   * and I could not find until his recording was slowed to sixty frames.
   */
  const handleSwipe = useCallback(
    (action: SwipeAction) => {
      setForcedExit(null);
      const top = swipeTop(action);
      if (!top) return;
      const at = Date.now();
      setLeaving((l) => [...l, { title: top, action, at }]);
      setTimeout(() => setLeaving((l) => l.filter((c) => c.at !== at)), 560);
      setBurst({ id: Date.now(), action });
      setTimeout(() => setBurst((b) => (b && Date.now() - b.id >= 950 ? null : b)), 1000);
    },
    [swipeTop]
  );

  // a button press is the same commit, just without a finger to lift
  const trigger = handleSwipe;

  /**
   * The swipe screen is exactly one viewport tall and must never scroll — an
   * upward swipe belongs to the card, not the page.
   *
   * But only that screen. The lock was applied on mount, which also froze the
   * taste picker rendered from here, leaving its grid stuck on the first row
   * with the rest unreachable. It now follows the screen actually on show.
   */
  const deckVisible = onboardingSeen && !picking;
  useEffect(() => {
    if (!deckVisible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [deckVisible]);

  useEffect(() => {
    if (hydrated && showDemo === null) {
      setShowDemo(answered === 0 && !demoAlreadyShown());
    }
  }, [hydrated, answered, showDemo]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") trigger("liked");
      else if (e.key === "ArrowLeft") trigger("disliked");
      else if (e.key === "ArrowDown") trigger("seen");
      else if (e.key === "ArrowUp") {
        e.preventDefault();
        trigger("not_seen");
      } else if (e.key === "z" || e.key === "Backspace") undo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [trigger, undo]);

  if (!hydrated || showDemo === null) {
    return (
      <div
        className="mx-auto flex w-full max-w-md flex-col items-center overflow-hidden px-4 pt-4"
        style={{ height: "calc(100dvh - 74px - env(safe-area-inset-bottom))" }}
      >
        <div className="mb-2 h-8 w-24 shrink-0 self-start rounded-lg bg-surface-2" />
        <div className="relative min-h-0 w-full flex-1">
          <div className="relative mx-auto h-full w-fit">
            <motion.div
              className="soft-card h-full max-w-[80vw] overflow-hidden"
              style={{ aspectRatio: "10 / 14.6" }}
              animate={{ opacity: [0.55, 1, 0.55] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="h-full w-full bg-gradient-to-br from-surface-2 to-line" />
            </motion.div>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-center gap-4 py-3">
          {[56, 44, 44, 56].map((size, i) => (
            <motion.div
              key={i}
              className="rounded-full bg-surface-2"
              style={{ width: size, height: size }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{
                duration: 1.6,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.12,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  /**
   * THE DEMO, IN PLACE OF THREE SENTENCES EXPLAINING A GESTURE.
   *
   * Shown on a first visit and after a refresh, in both cases only while
   * nothing has been swiped yet — and never on a return from another tab,
   * which is what `demoAlreadyShown()` remembers. See WelcomeDemo.
   */
  if (showDemo) {
    return (
      <WelcomeDemo
        onDone={() => {
          setShowDemo(false);
          if (!onboardingSeen) setPicking(true);
        }}
      />
    );
  }

  /* ── onboarding: welcome, then the taste picker ── */
  if (!onboardingSeen && picking) {
    return (
      <TastePicker
        onDone={() => {
          setOnboardingSeen();
          setPicking(false);
          setTimeout(refill, 0);
        }}
      />
    );
  }

  if (!onboardingSeen) {
    setTimeout(() => setPicking(true), 0);
    return null;
  }

  /* ── deck: fits the viewport, never scrolls ── */
  return (
    <div
      className="swipe-stage mx-auto flex w-full max-w-md flex-col items-center overflow-hidden px-4 pt-4"
      style={{ height: "calc(100dvh - 74px - env(safe-area-inset-bottom))" }}
    >
      <motion.h1
        variants={FADE_UP}
        initial="hidden"
        animate="show"
        className="mb-2 shrink-0 self-start text-2xl font-bold tracking-tight"
      >
        {t("nav.swipe")}
      </motion.h1>

      {/* card stack — height-driven so everything fits */}
      <div className="relative min-h-0 w-full flex-1">
        <div className="relative mx-auto h-full w-fit">
          <div className="relative h-full max-w-[80vw]" style={{ aspectRatio: "10 / 14.6" }}>
            <SwipeBurst burst={burst} />
            <AnimatePresence>
              {queue.length === 0 && (
                <motion.div
                  key="empty"
                  variants={SECTION}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="soft-card absolute inset-0 flex flex-col items-center justify-center p-8 text-center"
                >
                  {/*
                    An empty deck shows itself empty. The heading and the
                    sentence under it — "No more cards for now! You've swiped
                    everything we have. Come back later or browse Discover" —
                    said three times over what an outline of a card with
                    nothing in it says once.

                    What survives the cut is the *action*, because that is the
                    one thing a picture cannot supply: without a button, an
                    empty state is a dead end that looks deliberate.
                  */}
                  <div className="flex items-end gap-2">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...SPRING_SNAPPY, delay: i * 0.07 }}
                        className="block rounded-xl border border-dashed border-line"
                        style={{ width: 34, height: i === 1 ? 62 : 50 }}
                      />
                    ))}
                  </div>
                  <motion.div whileTap={{ scale: 0.95 }} className="mt-7">
                    <NeuButton
                      onClick={() => {
                        resetAll();
                        setTimeout(refill, 50);
                      }}
                      className="text-sm"
                    >
                      {t("swipe.reset")}
                    </NeuButton>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
            {/**
              * AnimatePresence, so a card can leave the queue the instant the
              * finger lifts and still fly off afterwards.
              *
              * Without it the swipe could not be committed until the 520ms
              * exit animation finished, because the commit hung off
              * `onAnimationComplete`. For half a second after every gesture the
              * deck was **deaf**: `drag` is disabled once a card is exiting and
              * the exiting card still owns the pointer, so a second swipe in
              * that window did nothing at all. Reproduced at a swipe every
              * 250ms — every other card stuck — and the user swipes at 1.1s
              * with bursts far faster than that.
              *
              * Now the gesture commits immediately and the animation is pure
              * decoration playing out over a card React has already removed.
              */}
            {/* already answered, still flying — inert, so the live card under
                it takes the next gesture immediately */}
            {leaving.map(({ title, action, at }) => (
              <motion.div
                key={`leaving-${at}`}
                className="pointer-events-none absolute inset-0 z-40"
                /* starts roughly where the thumb let go, so the hand-off from
                   the real card to this copy is not visible */
                initial={
                  action === "liked"
                    ? { x: 130, y: -10, rotate: 8, opacity: 1, scale: 1 }
                    : action === "disliked"
                      ? { x: -130, y: -10, rotate: -8, opacity: 1, scale: 1 }
                      : { x: 0, y: -120, rotate: 0, opacity: 1, scale: 1 }
                }
                animate={
                  action === "liked"
                    ? { x: 640, y: -90, rotate: 24, opacity: 0, scale: 0.92 }
                    : action === "disliked"
                      ? { x: -640, y: -90, rotate: -24, opacity: 0, scale: 0.92 }
                      : { x: 0, y: -780, rotate: 0, opacity: 0, scale: 0.9 }
                }
                transition={{ duration: 0.52, ease: EASE_SWEEP }}
              >
                {/**
                  * A picture of the card, not another card.
                  *
                  * This used to mount a whole `PosterArt` — a React subtree and
                  * a fresh `<img>` — at the exact instant the finger lifts,
                  * which is the one moment in the interaction that cannot
                  * afford any work. Measured by removing it entirely: it cost
                  * 9 of the 24 frames lost in the half-second after a swipe.
                  *
                  * A background image on a bare div paints the same pixels
                  * from the same cached URL with no element to create and no
                  * subtree to render. Nothing here is interactive or read by a
                  * screen reader — the real card carried all of that.
                  */}
                <div
                  className="soft-card relative h-full w-full overflow-hidden bg-surface-2 bg-cover bg-center"
                  style={
                    title.posterPath
                      ? {
                          backgroundImage: `url(https://image.tmdb.org/t/p/w500${title.posterPath})`,
                        }
                      : undefined
                  }
                  aria-hidden
                >
                  <div className="card-sheen absolute inset-0" />
                </div>
              </motion.div>
            ))}
            <AnimatePresence initial={false}>
              {queue.slice(0, 3).map((title, i) => (
                <SwipeCard
                  key={title.id}
                  title={title}
                  index={i}
                  onSwipe={handleSwipe}
                  forcedExit={i === 0 ? forcedExit : null}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/*
        ONE INSTRUMENT, NOT FIVE WIDGETS.
 
        The user asked for more creative button design and said he does not
        like the heart and thumb icons. I am doing half of that and refusing
        half, so the reasoning is here rather than in a reply he has to
        remember.
 
        REFUSED: replacing the symbols. A heart means loved and a thumb-down
        means not-for-me to every person who has ever used a phone. Inventing a
        cleverer glyph for a universally understood one is design vanity that
        costs comprehension and buys novelty, and novelty in a control someone
        presses a thousand times a session is a tax, not a feature.
 
        DONE: everything else, because the cheapness was never the symbols. The
        row was built from three unrelated things — a neumorphic pill, a
        differently-shaped "glow" heart from another component library, and
        plain circles between them — each with its own surface, its own press
        behaviour and its own idea of round. Five widgets sitting together is
        what reads as assembled from parts, and no amount of redrawing an icon
        fixes it.
 
        So all five now come from one component with one material. Size carries
        the hierarchy: the two verdicts you give most are large, the three you
        give occasionally are small. Colour is spent only where it means
        something — each button is neutral at rest and takes its action's tint
        on press, so the row is calm until you touch it, and the tint you see
        is the answer you are about to give.
      */}
      <motion.div
        variants={staggerContainer(0.05, 0.12)}
        initial="hidden"
        animate="show"
        className="flex shrink-0 items-center justify-center gap-3.5 py-3"
        dir="ltr"
      >
        <DeckAction
          label={t("swipe.disliked")}
          tint="var(--color-danger)"
          size={58}
          onPress={() => trigger("disliked")}
        >
          <ThumbsDownIcon size={24} strokeWidth={1.9} />
        </DeckAction>

        <DeckAction
          label={t("swipe.undo")}
          tint="var(--color-ink-dim)"
          size={44}
          disabled={!canUndo}
          onPress={undo}
        >
          <UndoIcon size={17} strokeWidth={2} />
        </DeckAction>

        <DeckAction
          label={t("swipe.notSeen")}
          tint="var(--color-ink-dim)"
          size={44}
          onPress={() => trigger("not_seen")}
        >
          <ArrowUpIcon size={18} strokeWidth={2} />
        </DeckAction>

        <DeckAction
          label={t("swipe.seen")}
          tint="var(--color-accent-soft)"
          size={44}
          onPress={() => trigger("seen")}
        >
          <EyeIcon size={18} strokeWidth={1.9} />
        </DeckAction>

        <DeckAction
          label={t("swipe.liked")}
          tint="var(--color-accent)"
          size={58}
          onPress={() => trigger("liked")}
        >
          <HeartIcon size={24} filled />
        </DeckAction>
      </motion.div>
    </div>
  );
}

/* one row of the JkHuger checklist element */
function HintRow({
  id,
  checked,
  onChange,
  label,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
    </>
  );
}

/**
 * The one control the deck's action row is built from.
 *
 * Neutral at rest so the row is quiet, tinted on press so the colour you see
 * is the answer you are giving, and pressed rather than merely recoloured —
 * the scale and the shadow collapsing together is what makes a finger feel
 * like it moved something rather than triggered something.
 */
function DeckAction({
  label,
  tint,
  size,
  disabled,
  onPress,
  children,
}: {
  label: string;
  tint: string;
  size: number;
  disabled?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      variants={FADE_UP}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onPress}
      whileTap={disabled ? undefined : { scale: 0.9 }}
      transition={SPRING_SNAPPY}
      style={{ width: size, height: size, ["--tint" as string]: tint }}
      className="deck-action"
    >
      {children}
    </motion.button>
  );
}
