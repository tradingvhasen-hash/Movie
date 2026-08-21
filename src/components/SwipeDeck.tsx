"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent } from "framer-motion";
import SwipeCard, { SWIPE_UP_THRESHOLD, SWIPE_X_THRESHOLD } from "./SwipeCard";
import SwipeBurst, { type BurstHandle } from "./SwipeBurst";
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
import { FADE_UP, SECTION, SPRING_SNAPPY, staggerContainer } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import type { SwipeAction } from "@/lib/types";

export default function SwipeDeck() {
  const { queue, hydrated, swipeTop, undo, canUndo, refill } = useDeck();
  /**
   * Someone who came in through the grid has already answered thirty
   * questions, and greeting them with "Swipe cards so we learn your taste"
   * tells them the site was not paying attention. The welcome is for people
   * who have told us nothing, which is a fact about the profile rather than a
   * flag about which screen they happened to open first.
   */
  /**
   * Read only until it stops mattering.
   *
   * `profile.totalSwipes` changes on every single swipe, and subscribing to it
   * re-rendered this component — and therefore all three cards, and therefore
   * framer's whole projection tree — on every gesture, to answer a question
   * that was settled before the first card: "has this person told us
   * anything yet". Once onboarding is done the selector returns a constant, so
   * the subscription stops firing entirely.
   */
  const answered = useDhawq((s) => (s.onboardingSeen ? 0 : s.profile.totalSwipes));
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
   * Which title is on its way out, and in which direction.
   *
   * Keyed by id rather than held as a bare action, because the card that is
   * leaving and the card that has just become top are both rendered in the
   * same frame — a bare "the exit is a like" would tell the newcomer it was
   * leaving too.
   */
  const [exitOf, setExitOf] = useState<{ id: string; action: SwipeAction } | null>(null);
  /** welcome → pick a few you love → deck */
  const [picking, setPicking] = useState(false);
  /**
   * The demo runs when nothing has been swiped and it has not already run
   * since this page was loaded. Read once into state so the answer cannot
   * change under the component mid-render.
   */
  const [showDemo, setShowDemo] = useState<boolean | null>(null);
  const burstRef = useRef<BurstHandle>(null);

  /**
   * A tick at the moment the gesture would commit.
   *
   * This is the half of "make me feel the swipe" that the eye cannot deliver:
   * on a phone, the buzz is the only feedback that reaches the hand. It fires
   * on the *crossing*, not while past the line, so dragging back and forth
   * does not turn into a rattle.
   */
  const wasPast = useRef(false);
  /**
   * Is a finger actually dragging the card right now?
   *
   * The whole-screen feedback exists only while this is true, for two separate
   * reasons and the second one is the one that mattered.
   *
   * CHEAPNESS: several full-screen layers held for a whole session cost
   * compositor memory at three times device scale even at opacity zero.
   *
   * CORRECTNESS: this used to be inferred from the card's position — "is it
   * off centre" — which is true during a drag and *also* true while a card
   * answered by a button press animates away. So tapping a verdict lit the
   * entire drag apparatus for a gesture nobody made, and on a real phone the
   * screen then froze for four seconds trying to composite it. The user filmed
   * exactly that and was right to be furious: I had reported it fixed.
   *
   * A drag is now reported by the card that is being dragged, which is the
   * only thing that actually knows.
   */
  const [live, setLive] = useState(false);
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
  /**
   * THE COLOUR FOLLOWS THE CARD OUT.
   *
   * The wash used to die the instant the finger lifted. On a slow drag that is
   * invisible, because the wash has already been on screen for a second. On a
   * flick the whole gesture is forty milliseconds, so the wash appeared and
   * was cut off inside a single blink — which is what the user meant by "the
   * glow has no time to appear".
   *
   * So when a *finger* commits a verdict, the shared position holds where he
   * let go and is then eased back to zero across the card's flight, with a
   * curve that stays high and drops late. The wash is at full strength while
   * the card is crossing the screen and gone by the time it lands. No new
   * layer is involved: this rides the transforms ScreenFeedback already reads,
   * which is why it is done here rather than by fading a wrapper.
   *
   * A button press never lit it in the first place, so `liveRef` is false and
   * none of this runs — tapping a verdict still costs nothing, which was its
   * own bug once.
   */
  const settleRef = useRef<ReturnType<typeof animate> | null>(null);
  const liveRef = useRef(false);

  const dragActive = useCallback(
    (on: boolean) => {
      if (on) {
        settleRef.current?.stop();
        settleRef.current = null;
      }
      liveRef.current = on;
      setLive(on);
    },
    []
  );

  const handleSwipe = useCallback(
    (action: SwipeAction) => {
      const top = swipeTop(action);
      if (!top) return;
      wasPast.current = false;
      haptic("commit", settings.haptics);
      // the departing card reads this to know which way to go
      setExitOf({ id: top.id, action });
      burstRef.current?.fire(action);

      if (liveRef.current) {
        /* holds for the first half, then recedes — see above */
        const ease: [number, number, number, number] = [0.7, 0, 0.85, 1];
        settleRef.current?.stop();
        void animate(y, 0, { duration: 0.46, ease });
        settleRef.current = animate(x, 0, { duration: 0.46, ease });
        void settleRef.current.then(() => {
          settleRef.current = null;
          liveRef.current = false;
          setLive(false);
        });
      }
    },
    [swipeTop, settings.haptics, x, y]
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

  /**
   * THE NEXT FEW POSTERS ARE FETCHED BEFORE THEIR CARD IS ON TOP.
   *
   * Every card in the recording shows its generated placeholder — a gradient
   * with the film's name across it in large type — and then swaps to the real
   * poster a beat later. That swap happens once per card, and it is a large
   * part of why the deck reads as slow even when nothing is blocked: the thing
   * you came to look at is the last thing to arrive.
   *
   * The deck already knows the next twenty-four films. Asking the browser for
   * the next five images costs nothing on the main thread — the fetch and the
   * decode both happen off it — and by the time a card reaches the front its
   * poster is in the cache and paints on the first frame.
   */
  const warmed = useRef(new Set<string>());
  useEffect(() => {
    if (typeof Image === "undefined") return;
    for (const t of queue.slice(0, 5)) {
      if (!t.posterPath || warmed.current.has(t.posterPath)) continue;
      warmed.current.add(t.posterPath);
      const img = new Image();
      img.decoding = "async";
      img.src = `https://image.tmdb.org/t/p/w500${t.posterPath}`;
    }
  }, [queue]);

  /**
   * Decided from the profile, not from the catalog.
   *
   * "Has this person swiped anything" is answered by localStorage, which
   * zustand rehydrates in about a millisecond. It used to wait on `hydrated`
   * — the 5.7 MB catalog — for no reason other than that both facts happened
   * to arrive from the same hook. That wait was the whole of the blank screen
   * the user filmed; see the render branch below.
   *
   * The empty dependency list is deliberate: this runs once, on mount, and the
   * answer must not change underneath a demo that has already started.
   */
  useEffect(() => {
    setShowDemo(useDhawq.getState().profile.totalSwipes === 0 && !demoAlreadyShown());
  }, []);

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

  /**
   * THE FIVE BLANK SECONDS.
   *
   * The user, on his very first impression of the site: "it takes nearly five
   * seconds, even six or seven, and it shows nothing. It is just a blank page."
   * He filmed it — a skeleton card, a skeleton heading, three skeleton
   * buttons, and nothing else.
   *
   * Measured on a phone-speed CPU and a 1.6 Mbps connection, the first real
   * content arrived at 3,353ms while the skeleton had been painted since
   * 715ms. Two and a half seconds of deliberate nothing, and the cause is one
   * word in the line below: `hydrated`.
   *
   * `hydrated` is set by `loadCatalog()` — a 5.7 MB download, a JSON parse and
   * a decode of 15,083 titles. The deck genuinely needs all of that before it
   * can deal a card.
   *
   * THE WELCOME SCREEN NEEDS NONE OF IT. It says the product's name and then
   * demonstrates a swipe on three posters it takes from `SAMPLE_TITLES`, which
   * is bundled in the JavaScript and available synchronously. It was waiting
   * for a 5.7 MB file it never reads.
   *
   * So it does not wait any more. The demo decides whether to run from the
   * persisted profile alone — which zustand rehydrates from localStorage in a
   * millisecond — and starts as soon as the page can paint. The catalog loads
   * underneath it, and the demo's own five and a half seconds are exactly the
   * budget it needs, so the deck is ready at the moment the demo ends.
   *
   * The skeleton still exists, for the person who has swiped before and comes
   * back to the deck directly. For them the catalog is in the browser cache
   * and it is on screen for a frame or two.
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
      {live && settings.screenFeedback && (
        <ScreenFeedback x={x} y={y} upAction={settings.swipeUp} />
      )}
      <SwipeBurst ref={burstRef} />

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

            <AnimatePresence initial={false}>
              {queue.slice(0, 3).map((title, i) => (
                <SwipeCard
                  key={title.id}
                  title={title}
                  index={i}
                  onSwipe={handleSwipe}
                  forcedExit={exitOf?.id === title.id ? exitOf.action : null}
                  upAction={settings.swipeUp}
                  onDragActive={i === 0 ? dragActive : undefined}
                  /* every card reads the top card's position now, not just
                     the top card: the ones behind use it to rise with the drag
                     instead of popping into place after it. Only the top card
                     ever writes to it — see the guard in SwipeCard. */
                  x={x}
                  y={y}
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
  /**
   * The pressed state is React's, not CSS's.
   *
   * `:active` is the obvious way to colour a button under a thumb and it is
   * the wrong one on iOS: Safari keeps `:active` on the last element touched
   * until something else is touched, so the heart stayed filled blue for the
   * rest of the user's recording — twenty seconds and eight cards after the
   * tap that caused it. Three handlers cannot get that wrong.
   */
  const [pressed, setPressed] = useState(false);
  const release = () => setPressed(false);

  return (
    <motion.button
      type="button"
      variants={FADE_UP}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onPress}
      onPointerDown={disabled ? undefined : () => setPressed(true)}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onBlur={release}
      data-pressed={pressed && !disabled ? "" : undefined}
      whileTap={disabled ? undefined : { scale: 0.88 }}
      transition={SPRING_SNAPPY}
      style={{ width: size, height: size, ["--tint" as string]: tint }}
      className="deck-action"
    >
      {children}
    </motion.button>
  );
}
