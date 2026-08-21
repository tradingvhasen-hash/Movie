"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useMotionValueEvent } from "framer-motion";
import SwipeCard, { SWIPE_UP_THRESHOLD, SWIPE_X_THRESHOLD } from "./SwipeCard";
import SwipeBurst from "./SwipeBurst";
import ScreenFeedback from "./ScreenFeedback";
import TastePicker from "./TastePicker";
import WelcomeDemo, { demoAlreadyShown } from "./WelcomeDemo";
import { useDeck } from "@/lib/useDeck";
import { useDhawq } from "@/lib/store";
import { NeuButton } from "./ui";
import {
  ArrowUpIcon,
  EyeIcon,
  HeartIcon,
  ThumbsDownIcon,
  UndoIcon,
} from "./ui/Icons";
import { EASE_SWEEP, FADE_UP, SECTION, SPRING_SNAPPY, staggerContainer } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
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
  const settings = useDhawq((s) => s.settings);

  /**
   * The top card's position, owned here rather than by the card.
   *
   * The whole screen reacts to this drag — see ScreenFeedback — and a value
   * that two components read has to live above both of them. It also survives
   * the card changing, which is what lets the next card be dragged the instant
   * the last one is answered.
   */
  const x = useMotionValue(0);
  const y = useMotionValue(0);

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
   * A tick at the moment the gesture would commit.
   *
   * This is the half of "make me feel the swipe" that the eye cannot deliver:
   * on a phone, the buzz is the only feedback that reaches the hand. It fires
   * on the *crossing*, not while past the line, so dragging back and forth
   * does not turn into a rattle.
   */
  const wasPast = useRef(false);
  const checkThreshold = useCallback(() => {
    const past =
      Math.abs(x.get()) > SWIPE_X_THRESHOLD || -y.get() > SWIPE_UP_THRESHOLD;
    if (past !== wasPast.current) {
      wasPast.current = past;
      if (past) haptic("tick", settings.haptics);
    }
  }, [x, y, settings.haptics]);
  useMotionValueEvent(x, "change", checkThreshold);
  useMotionValueEvent(y, "change", checkThreshold);

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
      wasPast.current = false;
      haptic("commit", settings.haptics);
      setLeaving((l) => [...l, { title: top, action, at }]);
      setTimeout(() => setLeaving((l) => l.filter((c) => c.at !== at)), 560);
      setBurst({ id: at, action });
      setTimeout(() => setBurst((b) => (b && b.id === at ? null : b)), 420);
    },
    [swipeTop, settings.haptics]
  );

  // a button press is the same commit, just without a finger to lift
  const trigger = handleSwipe;

  const takeBack = useCallback(() => {
    haptic("undo", settings.haptics);
    undo();
  }, [undo, settings.haptics]);

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
        trigger(settings.swipeUp);
      } else if (e.key === "z" || e.key === "Backspace") takeBack();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [trigger, takeBack, settings.swipeUp]);

  if (!hydrated || showDemo === null) {
    return (
      <div
        className="mx-auto flex w-full max-w-md flex-col items-center overflow-hidden px-4 pt-4"
        style={{ height: "calc(100dvh - 74px - env(safe-area-inset-bottom))" }}
      >
        <div className="mb-2 h-9 w-28 shrink-0 self-start rounded-lg bg-surface-2" />
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
          {[64, 46, 64].map((size, i) => (
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
      className="swipe-stage relative mx-auto flex w-full max-w-md flex-col items-center overflow-hidden px-4 pt-4"
      style={{ height: "calc(100dvh - 74px - env(safe-area-inset-bottom))" }}
    >
      <ScreenFeedback
        layer="back"
        x={x}
        y={y}
        upAction={settings.swipeUp}
        enabled={settings.screenFeedback}
      />
      <ScreenFeedback
        layer="front"
        x={x}
        y={y}
        upAction={settings.swipeUp}
        enabled={settings.screenFeedback}
      />
      <SwipeBurst burst={burst} />

      {/*
        THE NAME, WHERE A HEADING WAS GOING TO BE ANYWAY.

        Every other screen in this app carries its own title; this one carried
        the word "Swipe", which named the gesture the person was already
        performing. The user's two notes were that the top of this screen felt
        empty and that the product has no memorable name anywhere — and that he
        did not want a top bar, because a bar costs ~56px of height on a screen
        whose whole content is one card that wants every pixel.

        Both notes have the same answer. The heading slot already exists and is
        already paid for. Putting the product's name in it costs nothing, fills
        the space that felt empty, and means the one screen a person opens most
        is the one that says what this is.
      */}
      <motion.h1
        variants={FADE_UP}
        initial="hidden"
        animate="show"
        className="relative z-10 mb-2 shrink-0 self-start text-[26px] font-bold tracking-[-0.03em]"
      >
        Seenit
      </motion.h1>

      {/* card stack — height-driven so everything fits */}
      <div className="relative z-10 min-h-0 w-full flex-1">
        <div className="relative mx-auto h-full w-fit">
          <div className="relative h-full max-w-[80vw]" style={{ aspectRatio: "10 / 14.6" }}>
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
                    An empty deck shows itself empty. What survives the cut is
                    the *action*, because that is the one thing a picture
                    cannot supply: without a button, an empty state is a dead
                    end that looks deliberate.
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
                  upAction={settings.swipeUp}
                  x={i === 0 ? x : undefined}
                  y={i === 0 ? y : undefined}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/*
        THREE ANSWERS AND A WAY BACK.

        This row had five controls. The user counted them and said so: "there
        are too many buttons now — I want only three, or four with undo."

        He is right, and the arithmetic behind the fifth was always weak. There
        are four things a person can say about a film, but only three of them
        get said often: loved it, didn't, haven't seen it. "Watched it, no
        strong feeling" is a real answer that a small minority want to give
        often enough to justify a permanent seat — so it is a setting, and
        anyone who turns it on gets it back here *and* can point the upward
        swipe at it instead. Nothing is lost; the default screen stops charging
        everybody for it.

        The two verdicts you give most are large; undo is small and sits
        between them, where it is reachable and never mistaken for a verdict.
        Colour is spent only on press, so the row is calm until a finger
        arrives and the colour that appears is the answer about to be given.
      */}
      <motion.div
        variants={staggerContainer(0.05, 0.12)}
        initial="hidden"
        animate="show"
        className="relative z-10 flex shrink-0 items-center justify-center gap-4 py-3"
        dir="ltr"
      >
        <DeckAction
          label={t("swipe.disliked")}
          tint="var(--color-danger)"
          size={64}
          onPress={() => trigger("disliked")}
        >
          <ThumbsDownIcon size={27} strokeWidth={1.9} />
        </DeckAction>

        <DeckAction
          label={t("swipe.undo")}
          tint="var(--color-ink-dim)"
          size={46}
          disabled={!canUndo}
          onPress={takeBack}
        >
          <UndoIcon size={18} strokeWidth={2} />
        </DeckAction>

        {/*
          The fourth button is whichever of the two neutral answers the upward
          swipe is *not* carrying. Without that rule, turning the setting on
          while the gesture was already remapped put two identical eyes in the
          row and left "haven't seen it" with no control at all.
        */}
        {settings.showSeenButton && (
          <DeckAction
            label={settings.swipeUp === "seen" ? t("swipe.notSeen") : t("swipe.seen")}
            tint={settings.swipeUp === "seen" ? "var(--color-skip)" : "var(--color-ink-strong)"}
            size={46}
            onPress={() => trigger(settings.swipeUp === "seen" ? "not_seen" : "seen")}
          >
            {settings.swipeUp === "seen" ? (
              <ArrowUpIcon size={19} strokeWidth={2} />
            ) : (
              <EyeIcon size={19} strokeWidth={1.9} />
            )}
          </DeckAction>
        )}

        {/* this button and the upward swipe are the same answer, so they must
            never disagree about which answer it is */}
        <DeckAction
          label={settings.swipeUp === "seen" ? t("swipe.seen") : t("swipe.notSeen")}
          tint={settings.swipeUp === "seen" ? "var(--color-ink-strong)" : "var(--color-skip)"}
          size={46}
          onPress={() => trigger(settings.swipeUp)}
        >
          {settings.swipeUp === "seen" ? (
            <EyeIcon size={19} strokeWidth={1.9} />
          ) : (
            <ArrowUpIcon size={19} strokeWidth={2} />
          )}
        </DeckAction>

        <DeckAction
          label={t("swipe.liked")}
          tint="var(--color-accent)"
          size={64}
          onPress={() => trigger("liked")}
        >
          <HeartIcon size={27} filled />
        </DeckAction>
      </motion.div>
    </div>
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
      whileTap={disabled ? undefined : { scale: 0.88 }}
      transition={SPRING_SNAPPY}
      style={{ width: size, height: size, ["--tint" as string]: tint }}
      className="deck-action"
    >
      {children}
    </motion.button>
  );
}
