"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
  type PanInfo,
} from "framer-motion";
import PosterArt from "./PosterArt";
import { StarIcon } from "./ui/Icons";
import { genreLabel } from "@/lib/genres";
import { EASE_OUT, SPRING_SETTLE } from "@/lib/motion";
import { locale, t } from "@/lib/i18n";
import type { SwipeAction, Title } from "@/lib/types";

export const SWIPE_X_THRESHOLD = 100;
export const SWIPE_UP_THRESHOLD = 120;

/**
 * A tap is a press that went nowhere.
 *
 * 14px rather than the 4–5px a mouse needs: a thumb on glass rolls while it
 * presses, and a threshold tuned on a trackpad turns half of a real person's
 * taps into one-pixel drags that do nothing. It is still an order of magnitude
 * under the 100px a swipe has to travel to commit, so nothing that was meant
 * as a gesture can be mistaken for a tap.
 */
const TAP_SLOP = 14;

export interface SwipeCardProps {
  title: Title;
  /** 0 = top of stack */
  index: number;
  onSwipe: (action: SwipeAction) => void;
  /** externally-triggered exit (buttons/keyboard): action or null */
  forcedExit: SwipeAction | null;
  /** what an upward swipe records — a user setting */
  upAction: SwipeAction;
  /**
   * A finger is on the card and moving it.
   *
   * The deck mounts the whole-screen feedback on this and nothing else. It
   * used to infer "is the card off centre" from the position itself, which was
   * true during a drag *and* during the exit animation of a card answered with
   * a button — so a tap lit the entire drag apparatus.
   */
  onDragActive?: (active: boolean) => void;
  /**
   * The top card's position, owned by the deck.
   *
   * It lives up there rather than here because the *screen* reacts to this
   * drag, not just the card. See ScreenFeedback.
   */
  x?: MotionValue<number>;
  y?: MotionValue<number>;
}

export default function SwipeCard({
  title,
  index,
  onSwipe,
  forcedExit,
  upAction,
  onDragActive,
  x: sharedX,
  y: sharedY,
}: SwipeCardProps) {
  const [flipped, setFlipped] = useState(false);
  /**
   * THE BACK OF THE CARD DOES NOT EXIST UNTIL SOMEBODY ASKS FOR IT.
   *
   * This is the single most expensive line in the redesign, and it was costing
   * on every card whether or not anyone ever turned one over. Three cards are
   * mounted at all times; each back face carried a full-bleed poster, a second
   * poster thumbnail and a `backdrop-filter` over both. So the deck was paying
   * for six posters and three backdrop filters — and a backdrop filter inside
   * an element that is being transformed every frame has to re-sample
   * everything behind it *every frame*, which is what turned a 60fps drag into
   * the slideshow the user filmed.
   *
   * Nothing about the design changes. The back is built the first time a card
   * is turned over and kept from then on, so the flip is instant on every
   * subsequent tap; the two cards behind the top one simply never build one.
   */
  const [everFlipped, setEverFlipped] = useState(false);
  const [exiting, setExiting] = useState<SwipeAction | null>(null);

  /**
   * EVERY CARD OWNS ITS POSITION FOR ITS WHOLE LIFE. THIS IS NOT A DETAIL.
   *
   * It used to read `const x = sharedX ?? ownX` — the deck's shared motion
   * value for the top card, a private one for the two behind it. Which means
   * that the instant a card was promoted from second to first, the motion
   * value bound to `style.x` **changed identity underneath a live component**.
   *
   * framer-motion sets up its drag gesture against the value it was given at
   * mount. After the swap, a finger dragged the card and the element moved —
   * so it looked fine — but the gesture and the element were no longer talking
   * about the same object: `onDragEnd` never resolved against the rendered
   * position, nothing committed, and the card stayed where the finger left it.
   *
   * That is precisely what the user filmed: the first swipe works, and from
   * the second card onward the deck accepts the drag and does nothing with it.
   * He dragged that Reservoir Dogs card for thirteen seconds. Every drag test
   * I had written dragged exactly one card, so every one of them passed.
   *
   * So: the position is created here, once, and never replaced. The deck still
   * needs to read the top card's position for the whole-screen feedback, and
   * it gets it by mirroring — a copy, never a substitution.
   */
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotate = useTransform(x, [-260, 0, 260], [-16, 0, 16]);

  /* how far this drag has gone toward each verdict — read by the stamps */
  const likeAt = useTransform(x, [24, SWIPE_X_THRESHOLD], [0, 1], { clamp: true });
  const nopeAt = useTransform(x, [-24, -SWIPE_X_THRESHOLD], [0, 1], { clamp: true });
  const upAt = useTransform(() => {
    const dy = Math.max(0, (-y.get() - 24) / (SWIPE_UP_THRESHOLD - 24));
    const sideways = Math.min(1, Math.abs(x.get()) / SWIPE_X_THRESHOLD);
    return Math.min(1, dy) * (1 - sideways);
  });

  const isTop = index === 0;
  const activeExit = isTop ? (exiting ?? forcedExit) : null;

  /**
   * THE CARD UNDERNEATH RISES WITH THE DRAG, NOT AFTER IT.
   *
   * The user: "while you drag a card the one below appears but does not push.
   * The moment you throw it, the card below appears with an effect like a push
   * upward. No — I don't like it, it's very cheap."
   *
   * He has described the mechanism exactly. The stack was static: every card
   * sat at `index * 12` and waited. When the top card committed, the second
   * became the first and its whole promotion — twelve pixels up and a scale
   * step — happened at once, on a slightly underdamped spring, so it did not
   * merely move, it popped.
   *
   * A deck of real cards does not work that way. As you slide the top one off,
   * the one beneath is progressively uncovered and is *already* where it needs
   * to be by the time the top card is gone. So the promotion is now driven by
   * how far the top card has travelled: at rest the stack looks exactly as it
   * did, and at the commit point the second card has already arrived at the
   * first card's position. Nothing is left to animate, so there is nothing to
   * pop.
   *
   * A button press has no drag to ride, so for that path the settle transition
   * below drops the spring for a plain ease — same destination, no overshoot.
   */
  const promote = useTransform(() => {
    if (isTop || !sharedX || !sharedY) return 0;
    const travelled = Math.hypot(sharedX.get(), sharedY.get());
    return Math.min(1, travelled / SWIPE_X_THRESHOLD);
  });
  const stackY = useTransform(promote, [0, 1], [index * 12, (index - 1) * 12]);
  const stackScale = useTransform(
    promote,
    [0, 1],
    [1 - index * 0.05, 1 - (index - 1) * 0.05]
  );

  useMotionValueEvent(x, "change", (v) => {
    if (isTop && !activeExit) sharedX?.set(v);
  });
  useMotionValueEvent(y, "change", (v) => {
    if (isTop && !activeExit) sharedY?.set(v);
  });

  /* a card arriving at the front starts face-up and un-dragged */
  useEffect(() => {
    if (isTop) {
      setFlipped(false);
      x.set(0);
      y.set(0);
      sharedX?.set(0);
      sharedY?.set(0);
    }
    // the motion values are stable for the life of this component
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTop, title.id]);

  /**
   * TAP TO TURN THE CARD OVER.
   *
   * There used to be a chevron in the corner that slid a translucent panel up
   * over the bottom of the poster. The user's verdict, twice: "still bad… all
   * you are doing is changing an icon."
   *
   * He was right, and the reason is that a panel over a poster is the *same*
   * object trying to be two things at once — you can see the film and the text
   * simultaneously, and neither wins. The thing this product is built out of
   * is a card. Cards have backs. So the whole card turns over: poster on the
   * front, everything the poster cannot say on the back, on a real surface
   * with room to breathe. Nothing overlaps anything.
   *
   * And it costs no control at all. The affordance is the card itself — tap
   * it — which is why the corner button is gone rather than redrawn.
   */
  const press = useRef<{ px: number; py: number; at: number } | null>(null);
  /** set by the release, read by the exit transition — see handleDragEnd */
  const flightSeconds = useRef(0.56);

  function handlePointerDown(e: React.PointerEvent) {
    press.current = { px: e.clientX, py: e.clientY, at: Date.now() };
  }

  function handlePointerUp(e: React.PointerEvent) {
    const p = press.current;
    press.current = null;
    if (!p || !isTop || activeExit) return;
    const moved = Math.hypot(e.clientX - p.px, e.clientY - p.py);
    if (moved <= TAP_SLOP && Date.now() - p.at < 600) {
      setEverFlipped(true);
      setFlipped((v) => !v);
    }
  }

  /**
   * A gesture commits the moment the finger lifts, not when the animation
   * ends. The card is removed from the queue immediately and the deck plays
   * the fly-off over the top of a card React has already dropped.
   *
   * It used to commit from `onAnimationComplete`, 520ms later, and the deck
   * ignored every swipe in between — reproduced as one stuck card in two at a
   * swipe every 250ms. Half a second is not a long time to a machine and is a
   * very long time to a thumb.
   */
  function handleDragEnd(_: unknown, info: PanInfo) {
    const px = info.offset.x + info.velocity.x / 7;
    const py = info.offset.y + info.velocity.y / 7;
    const action: SwipeAction | null =
      py < -SWIPE_UP_THRESHOLD && Math.abs(py) > Math.abs(px)
        ? upAction
        : px > SWIPE_X_THRESHOLD
          ? "liked"
          : px < -SWIPE_X_THRESHOLD
            ? "disliked"
            : null;

    /**
     * HOW HARD YOU THREW IT IS THE ONE THING THE ANIMATION MUST NOT IGNORE.
     *
     * The user: "you throw the card as fast as you can, and then the moment
     * the effect appears the card gets slow and gets thrown to the left. That
     * takes out the feeling of throwing — it feels like a ready-made effect
     * that plays anyway no matter how fast you throw."
     *
     * He is describing a fixed 560ms tween, which is exactly what it was. A
     * flick and a shove produced the identical flight, so the gesture stopped
     * being his.
     *
     * The fix is not to hand the animation back to physics — that was the
     * previous version, and it threw the card off-screen in 284ms with the
     * colour not yet drawn. It is to let velocity choose the duration inside a
     * range where every value is still watchable: a hard throw leaves in
     * 400ms, a gentle push takes 620ms, and nothing is ever faster than the
     * eye. The gesture is felt, and the effect is always seen.
     *
     * The floor is 400 rather than the 340 I first picked, and the reason is
     * measured: at 340 a hard flick put the card off-screen at 317ms, which is
     * within thirty milliseconds of the 284ms he had already told me was too
     * fast to see. A range whose fast end lands on the number he complained
     * about is not a compromise, it is the same bug with extra arithmetic.
     * 400 → 620 is still a 55% spread, which is plainly felt.
     */
    const speed = Math.hypot(info.velocity.x, info.velocity.y);
    flightSeconds.current = Math.max(0.4, Math.min(0.62, 0.62 - speed / 9000));

    /**
     * And the momentum has to die at the exact moment a verdict is given.
     *
     * `dragMomentum` is back on, because turning it off is what cost the card
     * its float — see the drag props below. But inertia and the exit tween
     * animate the same two values, and if inertia is still running the card
     * leaves on whichever finishes last, which is the arbitrary behaviour the
     * user filmed. Stopping the values here means momentum owns the release
     * and the exit owns the departure, with no overlap.
     */
    if (action) {
      x.stop();
      y.stop();
    }
    /**
     * A gesture that commits does NOT switch the screen feedback off here.
     *
     * It used to, and on a flick that meant the wash existed for about forty
     * milliseconds — the whole gesture — and was gone before the eye
     * registered it. The user: "it is thrown so fast that the glow and the
     * rest have no time to appear." A verdict is exactly the moment the colour
     * should be at its loudest, not the moment it is switched off.
     *
     * The deck now owns that: it holds the wash while the card flies and eases
     * it out behind it. A gesture that commits nothing still turns it off
     * immediately, because there is nothing to celebrate.
     */
    if (!action) {
      onDragActive?.(false);
      return;
    }
    setExiting(action);
    onSwipe(action);
  }

  /**
   * THE CARD ITSELF FLIES AWAY. THERE IS NO COPY ANY MORE.
   *
   * Three versions of this have now existed and it is worth recording why the
   * middle one was wrong.
   *
   * v1: the real card animated out, and because it was still mounted it still
   * owned the pointer — so every second fast swipe hit a card that was already
   * leaving and did nothing.
   *
   * v2 (the mistake): the real card was deleted in the same frame and an inert
   * *copy* was mounted to do the flying. That fixed the input problem and
   * created a worse one. At the instant of release the phone had to build a
   * new full-size composited layer for the copy, build the burst's layers, and
   * tear down the drag feedback's layers — all in one frame. The 520ms flight
   * was then drawn about twice. The user: "the cards vanish, there is no
   * smoothness at all."
   *
   * v3: the real card flies, and simply stops accepting touches while it does.
   * `pointer-events: none` solves what the copy was invented to solve, and
   * costs nothing: no new layer, no second image decode, and the card
   * continues from exactly where the finger left it instead of jumping back to
   * a hardcoded start position.
   */
  /**
   * The shared position is deliberately NOT reset here any more.
   *
   * Zeroing it the instant a card began leaving snapped the whole-screen wash
   * off in one frame. The mirror above already stops writing once `activeExit`
   * is set, so the value simply holds where the finger left it — and the deck
   * eases it back to zero behind the departing card, which is what makes the
   * colour follow the throw out instead of vanishing with the thumb.
   */

  /**
   * Where a thrown card goes, and how long you get to watch it.
   *
   * 560ms on a gentle glide rather than 520 on a deep sweep: the old curve put
   * most of the distance in the first fifth of the time, so even at a full
   * sixty frames the card was effectively gone in under 200ms. A throw should
   * *travel*.
   *
   * That was the right diagnosis and an insufficient fix — see the transition
   * below, where the actual measurements are.
   */
  /**
   * THE CARD THAT FLEW UPWARD ON ITS OWN.
   *
   * The user, twice: "all of a sudden there is a random card underneath the
   * card I'm swiping that gets swiped to the upside. I didn't swipe anything."
   * He first saw it on a fresh load and then again mid-session.
   *
   * It was in this expression. `exitPose` fell through to the upward pose
   * whenever `activeExit` was null — and `activeExit` is null for every card
   * that leaves the queue *without a verdict*: a re-rank dropping a title from
   * positions two or three, a refill replacing the tail, a title that has just
   * been answered somewhere else. Every one of those played the full
   * "haven't seen it" fly-up, from behind the top card, for no reason.
   *
   * A card that nobody answered has no direction to go, so it does not go
   * anywhere: it fades where it stands. The three verdict poses are unchanged.
   */
  const exitPose =
    activeExit === "liked"
      ? { x: 620, y: -70, rotate: 22, opacity: 0, scale: 0.94 }
      : activeExit === "disliked"
        ? { x: -620, y: -70, rotate: -22, opacity: 0, scale: 0.94 }
        : activeExit
          ? { x: 0, y: -820, rotate: 0, opacity: 0, scale: 0.92 }
          : { opacity: 0, scale: 0.97 };

  /**
   * Resting pose in the stack — springs whenever the index changes.
   *
   * NO `filter` HERE, and that absence is worth a paragraph. The cards behind
   * the top one used to be dimmed with `filter: brightness(0.93)`, animated as
   * a card was promoted to the front. A filter is not a compositor property:
   * animating one re-rasterises the whole element — a full-size poster — on
   * every frame, twice over, for the half second after every single swipe.
   * Profiled on a phone-speed CPU it was a large share of the 44% of the time
   * this screen spent in paint rather than in script.
   *
   * The dimming is now a black overlay whose *opacity* animates, which the
   * compositor does on the GPU for free. Identical on screen, and it is the
   * difference between a swipe costing a repaint of the deck and costing
   * nothing at all.
   */
  /**
   * The top card is the only one whose rest is animated by React state; the
   * cards behind it follow the drag through `stackY` / `stackScale` above, so
   * their pose is a motion value and must not also be an `animate` target —
   * two owners of one property is a fight, and framer resolves it by jumping.
   */
  const restingPose = isTop
    ? { x: 0, y: 0, scale: 1, opacity: 1 }
    : { opacity: index > 2 ? 0 : 1 };

  return (
    <motion.div
      className="absolute inset-0 touch-none select-none will-change-transform"
      style={{
        ...(isTop ? { x, y, rotate } : { y: stackY, scale: stackScale }),
        zIndex: activeExit ? 40 : 30 - index,
        pointerEvents: isTop && !activeExit ? "auto" : "none",
        perspective: 1400,
      }}
      /* a card joining the back of the stack grows in instead of popping */
      initial={{
        y: index * 12 + 26,
        scale: 1 - index * 0.05 - 0.06,
        opacity: 0,
      }}
      animate={restingPose}
      /* a tween, not the spring: SPRING_SETTLE is damped at 0.93, which
         overshoots — invisible on a card returning to centre and, on a card
         being promoted after a button press, exactly the pop he called cheap */
      transition={{ duration: 0.34, ease: EASE_OUT, opacity: { duration: 0.35 } }}
      /**
       * THE CARD IS NOT ALLOWED TO LEAVE FASTER THAN YOU CAN WATCH IT.
       *
       * The user: "if you drag it and throw it, it is thrown so fast that the
       * glow and the rest have no time to appear." And, crucially, that
       * dragging slowly while keeping your finger down looks fine. Two
       * different speeds for the same journey means the *gesture* was feeding
       * the animation, and it was, in two ways I had to measure to see:
       *
       *   off-screen at   slow drag 483ms   flick 284ms
       *   fully faded at  slow drag 567ms   flick 417ms
       *
       * 1. THE EASE WAS FRONT-LOADED. cubic-bezier(0.25, 0.6, 0.35, 1) puts
       *    60% of the distance in the first quarter of the time. The card then
       *    spent 230ms creeping through its last 12%, off-screen, where nobody
       *    can see it — which is why my earlier "700ms flight" number looked
       *    fine and the screen did not. It is near-linear now, with only a
       *    soft landing, so the card crosses the screen at a speed the eye can
       *    follow.
       *
       * 2. OPACITY RODE THE SAME CURVE. The card was 85% transparent 417ms in
       *    — it did not fly away so much as evaporate. It now holds full
       *    opacity until it is already off the screen, and fades over the last
       *    200ms, when the fade is doing cleanup rather than the exit itself.
       *
       * And `dragMomentum={false}` is the third: framer adds inertia after the
       * finger leaves, so a flick started the exit already travelling and
       * already displaced. That made a throw a completely different animation
       * from a drag — the exact difference the user described. A verdict is a
       * verdict; it should look the same however hard you threw it.
       */
      exit={
        activeExit
          ? {
              ...exitPose,
              transition: {
                duration: flightSeconds.current,
                ease: [0.32, 0.3, 0.55, 0.98],
                opacity: {
                  duration: flightSeconds.current * 0.36,
                  delay: flightSeconds.current * 0.64,
                  ease: "linear",
                },
              },
            }
          : { ...exitPose, transition: { duration: 0.24, ease: EASE_OUT } }
      }
      drag={isTop && !activeExit}
      dragElastic={0.55}
      /**
       * MOMENTUM IS BACK, AND IT IS WHAT "FLOATING" MEANS.
       *
       * The user: "before, when you dragged the card and let go, it felt like
       * it was floating. Now the moment you stop pressing it, it just stops.
       * I like the previous one."
       *
       * He is describing `dragMomentum`, which I turned off last round to stop
       * a hard flick outrunning the exit animation. That fixed the throw and
       * broke the release, which is the trade I should have noticed: those are
       * two different gestures and they deserved two different answers.
       *
       * They have them now. Momentum is on, so a card let go mid-drag carries
       * and glides back. And `handleDragEnd` stops both values the instant a
       * verdict is given, so the exit never has to race the inertia it used to
       * lose to.
       */
      dragMomentum
      /**
       * There is no downward verdict, so downward should not be a gesture.
       *
       * It was: the card could be dragged 454px down and then took 1,750ms to
       * drift back, during which the deck looked stuck. The user called it a
       * freeze, and from the outside it is one — nearly two seconds where the
       * card is somewhere it should never have been and nothing responds.
       *
       * `bottom: 0` pins the card to its resting line; `dragElastic` still
       * lets it give a little under the thumb, so it feels like a card that
       * will not go that way rather than a card that is broken. Up, left and
       * right are untouched.
       */
      dragConstraints={{ bottom: 0 }}
      onDragStart={() => onDragActive?.(true)}
      onDragEnd={handleDragEnd}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      whileDrag={{ cursor: "grabbing" }}
    >
      {/* what `filter: brightness()` used to do, on the compositor instead */}
      <motion.div
        className="pointer-events-none absolute inset-0 z-10 rounded-[var(--radius-card)] bg-black"
        initial={{ opacity: index === 0 ? 0 : 0.07 }}
        animate={{ opacity: index === 0 ? 0 : 0.07 }}
        transition={{ duration: 0.35 }}
        aria-hidden
      />

      {isTop && (
        <>
          <VerdictStamp progress={likeAt} tint="var(--color-accent)" label={t("swipe.liked")} side="left" />
          <VerdictStamp progress={nopeAt} tint="var(--color-danger)" label={t("swipe.disliked")} side="right" />
          <VerdictStamp
            progress={upAt}
            tint={upAction === "seen" ? "var(--color-ink-strong)" : "var(--color-skip)"}
            label={upAction === "seen" ? t("swipe.seen") : t("swipe.notSeen")}
            side="top"
          />
        </>
      )}
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 30, mass: 0.9 }}
      >
        {/* ── front: the poster, and only what a poster cannot say ── */}
        <div
          className="soft-card absolute inset-0 overflow-hidden"
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
        >
          <PosterArt title={title} />
          <div className="card-sheen absolute inset-0" />

          <div className="absolute inset-x-0 bottom-0 p-4">
            {/*
              THESE THREE BADGES USED TO BE FROSTED GLASS.

              `backdrop-blur` on an element inside a card that is transformed
              every frame is the worst shape of this feature: the browser must
              re-sample the pixels behind a moving element on every frame, and
              there were three of them per card across three mounted cards.
              They sit on the dark end of a poster gradient, so a flat scrim
              reads the same and costs nothing.
            */}
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-black/35 px-2 py-0.5 text-[10px] font-bold text-white/95">
                {title.type === "movie" ? t("card.movie") : t("card.tv")}
              </span>
              <span className="rounded-md bg-black/35 px-2 py-0.5 text-[10px] font-semibold text-white/95">
                {title.year}
              </span>
              <span className="flex items-center gap-1 rounded-md bg-black/35 px-2 py-0.5 text-[10px] font-semibold text-white/95">
                <StarIcon size={10} filled className="text-accent" />
                {title.rating.toFixed(1)}
              </span>
            </div>
            <h2 className="text-xl font-bold leading-tight text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.55)]">
              {title.title[locale]}
            </h2>
            <div className="mt-1 flex flex-wrap gap-x-2.5">
              {title.genres.slice(0, 3).map((g) => (
                <span key={g} className="text-[11px] font-medium text-white/60">
                  {genreLabel(g, locale)}
                </span>
              ))}
            </div>
          </div>

          {/*
            The only hint that there is a back, and it is a hint rather than a
            control: two stacked lines in the corner, the universal "there is
            more written here". It never needs to be pressed — the whole card
            is the target — so it is 22px of ink instead of a 36px button.
          */}
          {isTop && (
            <motion.span
              className="absolute end-3.5 top-3.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/40"
              animate={{ opacity: [0.45, 0.9, 0.45] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
              aria-hidden
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round">
                <path d="M5 8.5h14M5 13h10M5 17.5h6" />
              </svg>
            </motion.span>
          )}
        </div>

        {/* ── back: everything the poster cannot say ──
            The poster does not disappear when the card turns; it goes out of
            focus behind the text. A back face made of flat surface colour was
            the first version and it was disorienting — you could no longer
            tell *which* film you had turned over without reading the title,
            and the card lost every bit of the colour that made it recognisable
            a second earlier. The blurred artwork keeps the identity, fills the
            space a short synopsis leaves empty, and is the same trick a phone
            uses behind an album on a now-playing screen. */}
        <div
          className="soft-card absolute inset-0 flex flex-col overflow-hidden bg-surface"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          {everFlipped && (
          <>
          {/*
            THE SAME LOOK, WITHOUT A BACKDROP FILTER.

            `backdrop-filter` blurs whatever is painted behind an element, which
            means the browser re-samples the backdrop on every frame the element
            moves — and this element moves with the card. Blurring the *image
            itself* is a filter on a static subtree: the browser rasterises it
            once and reuses the texture. Visually identical, and it is the
            difference between a frame budget and no frame budget.

            A background-image rather than <PosterArt> because this layer is
            decoration: it needs no fallback artwork, no cross-fade and no React
            subtree, and the URL is already in the browser's cache from the
            front of the same card.
          */}
          <div
            className="absolute inset-0 scale-125"
            style={{
              backgroundImage: title.posterPath
                ? `url(https://image.tmdb.org/t/p/w500${title.posterPath})`
                : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(22px)",
            }}
            aria-hidden
          />
          <div
            className="absolute inset-0"
            style={{ background: "rgb(var(--rgb-scrim) / 0.74)" }}
            aria-hidden
          />

          <div className="relative flex h-full flex-col p-5 text-white">
            <div className="flex shrink-0 gap-3.5">
              <div className="h-[92px] w-[62px] shrink-0 overflow-hidden rounded-xl shadow-[0_6px_18px_rgb(0_0_0/0.4)]">
                <PosterArt title={title} sizes="120px" className="h-full w-full" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-[19px] font-bold leading-tight tracking-tight">
                  {title.title[locale]}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] font-semibold text-white/60">
                  <span>{title.year}</span>
                  <span>·</span>
                  <span>{title.type === "movie" ? t("card.movie") : t("card.tv")}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <StarIcon size={11} filled className="text-accent-soft" />
                    {title.rating.toFixed(1)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {title.genres.slice(0, 3).map((g) => (
                    <span
                      key={g}
                      className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold capitalize"
                    >
                      {genreLabel(g, locale)}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* the one scrolling surface inside the stage — see globals.css */}
            <div className="card-back-scroll mt-5 min-h-0 flex-1 overflow-y-auto">
              <p className="text-[14px] leading-relaxed text-white/85">
                {title.overview[locale] || "…"}
              </p>
            </div>

            <div className="mt-4 shrink-0 space-y-1 border-t border-white/15 pt-3 text-[11.5px] text-white/60">
              {title.people.director && (
                <p>
                  <span className="font-semibold text-white/85">
                    {title.type === "movie" ? t("card.director") : t("card.creator")}
                  </span>{" "}
                  {title.people.director}
                </p>
              )}
              {title.people.cast.length > 0 && (
                <p>
                  <span className="font-semibold text-white/85">{t("card.cast")}</span>{" "}
                  {title.people.cast.slice(0, 3).join(", ")}
                </p>
              )}
            </div>
          </div>
          </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * THE VERDICT, AS SOMETHING THE CARD CARRIES.
 *
 * What this replaces: a 150px filled glyph that faded in over the middle of the
 * poster, drawn by the full-screen feedback layer. The user's verdict on it was
 * total — "I don't like how it appears at the top of the card, I don't like how
 * it appears, I don't like anything about it" — with the one constraint that
 * removing it outright would leave the moment empty.
 *
 * So the difference is not the size of the glyph, it is what the thing *is*. A
 * mark floating over a poster is an overlay: it belongs to the screen, it
 * obscures the film, and it is the same object whichever card is underneath.
 * A stamp in the card's own corner belongs to the card — it tilts with it, it
 * flies away with it, and it never covers the face of the poster.
 *
 * Built the way a physical stamp reads: a hairline outline in the verdict's
 * colour, the word in capitals with wide tracking, rotated a few degrees off
 * true, and pressed on with a slight overshoot in scale rather than faded in.
 * It sits on the side the card is coming *from*, so a card thrown right shows
 * its stamp on the left, which is the edge with nothing behind it.
 *
 * Only `opacity` and `transform` animate, so it composites with the card
 * instead of costing a layer of its own.
 */
function VerdictStamp({
  progress,
  tint,
  label,
  side,
}: {
  progress: MotionValue<number>;
  tint: string;
  label: string;
  side: "left" | "right" | "top";
}) {
  const opacity = useTransform(progress, [0.08, 0.42], [0, 1], { clamp: true });
  const scale = useTransform(progress, [0.08, 0.55, 1], [0.72, 1.04, 1], { clamp: true });

  /**
   * The upward stamp lives at the BOTTOM of the card, and that is not a whim.
   *
   * An upward swipe carries the card off the top of the screen, so a stamp
   * pinned to its top edge is the first thing to leave — screenshotted, it was
   * already half cut off at the commit point. Anchored to the bottom it stays
   * on screen for the whole gesture and is the last thing you see as the card
   * goes. The two sideways stamps stay high, where a card moving horizontally
   * keeps them in view.
   */
  const place =
    side === "left"
      ? "left-4 top-5 -rotate-[11deg] origin-top-left"
      : side === "right"
        ? "right-4 top-5 rotate-[11deg] origin-top-right"
        : "left-1/2 bottom-5 -translate-x-1/2 origin-bottom";

  return (
    <motion.div
      className={`pointer-events-none absolute z-20 ${place} will-change-[opacity,transform]`}
      style={{ opacity, scale }}
      aria-hidden
    >
      <span
        className="block rounded-xl border-[2.5px] px-3 py-1.5 text-[15px] font-extrabold uppercase tracking-[0.14em]"
        style={{
          color: tint,
          borderColor: tint,
          background: "rgb(var(--rgb-scrim) / 0.28)",
        }}
      >
        {label}
      </span>
    </motion.div>
  );
}
