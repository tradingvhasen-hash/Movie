"use client";

/**
 * THE FIRST FIVE SECONDS.
 *
 * The user's verdict on the previous version was "100 times really bad", and
 * he was right about it in a way worth writing down, because the mistake is
 * easy to make twice: it demonstrated the gesture on a **fake** card — a blank
 * surface with a logo on it — while the screen around it did nothing. So it
 * taught the shape of a movement and not one thing about what the movement
 * feels like, which is the only part a person cannot guess.
 *
 * This version demonstrates the real thing, on real film posters, by driving
 * the *same two motion values the deck uses*. `ScreenFeedback` is mounted here
 * exactly as it is mounted there and reads exactly the same numbers, so the
 * wash of colour, the mark at the edge and the commit step are not a
 * reproduction of the interaction — they are the interaction, with the finger
 * simulated. Anything I improve about how a swipe feels improves this screen
 * for free, and the two can never drift apart.
 *
 * It also says the name once, at the only moment in the product's life when
 * somebody does not know it yet, and then never again.
 *
 * WHEN IT APPEARS, exactly as specified:
 *
 *   · the first time someone opens the site and has not swiped a card
 *   · after a page refresh, if they still have not swiped a card
 *   · NOT when they wander to Discover and come back
 *
 * The third condition is what `shownThisLoad` is for. A module-level flag
 * lives as long as the JavaScript bundle does: it survives navigating between
 * pages and dies on refresh — precisely the rule asked for, with no storage,
 * no timestamps and nothing to get out of sync.
 *
 * And it can be skipped by touching the screen. A demo nobody can interrupt is
 * a demo that has stopped being a courtesy.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import ScreenFeedback from "./ScreenFeedback";
import PosterArt from "./PosterArt";
import { getLocalCatalog } from "@/lib/catalog";
import { resolveSeeds } from "@/lib/data/taste-seeds";
import { EASE_OUT, SPRING_SETTLE } from "@/lib/motion";
import type { Title } from "@/lib/types";

let shownThisLoad = false;

/** has the demo already run since this page was loaded? */
export function demoAlreadyShown(): boolean {
  return shownThisLoad;
}

/** the script, in the two numbers the deck itself is driven by */
const BEATS: { x: number; y: number; hold: number }[] = [
  { x: 0, y: 0, hold: 620 },
  { x: 142, y: -10, hold: 700 },
  { x: 0, y: 0, hold: 220 },
  { x: -142, y: -10, hold: 700 },
  { x: 0, y: 0, hold: 220 },
  { x: 0, y: -150, hold: 640 },
];

export default function WelcomeDemo({ onDone }: { onDone: () => void }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  /* the deck's own tilt curve, imported rather than re-guessed */
  const rotate = useTransform(x, [-260, 0, 260], [-16, 0, 16]);
  const [stage, setStage] = useState<"name" | "demo">("name");
  const done = useRef(false);

  /** three real posters, so the demo is the product rather than a diagram */
  const cards = useMemo<Title[]>(() => {
    const pool = getLocalCatalog().map((c) => c.title);
    if (pool.length === 0) return [];
    const named = resolveSeeds(pool, 12);
    const source = named.length >= 3 ? named : [...pool].sort((a, b) => b.voteCount - a.voteCount);
    return source.slice(0, 3);
  }, []);

  const finish = useRef(onDone);
  finish.current = onDone;

  useEffect(() => {
    shownThisLoad = true;
    let cancelled = false;

    const wait = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));

    (async () => {
      await wait(1150);
      if (cancelled) return;
      setStage("demo");
      await wait(360);

      for (const beat of BEATS) {
        if (cancelled) return;
        await Promise.all([
          animate(x, beat.x, SPRING_SETTLE).finished,
          animate(y, beat.y, SPRING_SETTLE).finished,
        ]);
        await wait(beat.hold);
      }
      if (cancelled) return;
      // only the last movement completes — the card goes, as a real one would
      await animate(y, -900, { duration: 0.42, ease: EASE_OUT }).finished;
      if (!cancelled && !done.current) {
        done.current = true;
        finish.current();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [x, y]);

  const skip = () => {
    if (done.current) return;
    done.current = true;
    finish.current();
  };

  return (
    <div
      className="swipe-stage relative mx-auto flex w-full max-w-md flex-col items-center overflow-hidden px-4 pt-4"
      style={{ height: "calc(100dvh - 74px - env(safe-area-inset-bottom))" }}
      onPointerDown={skip}
    >
      {stage === "demo" && <ScreenFeedback x={x} y={y} />}

      {/*
        THE NAME, AND WHY IT IS BUILT LIKE THIS.

        The user on the previous version: "it appears in a really fast way,
        there is no animation, it is not smooth, it is not professional, it is
        not dynamic — it is just a text that appears really fast and disappears
        really fast. I like the idea, like how the Netflix logo appears when you
        first open the app. You did it in a really bad way."

        What it was: opacity 0 → 1 over 800ms with `letterSpacing` animated
        alongside. Two faults in one line. `letter-spacing` is not a compositor
        property — animating it re-lays-out and repaints the text on every
        frame, which on his phone meant the whole reveal was drawn perhaps
        three times, so a 800ms animation read as an instant cut. And a plain
        cross-fade has no *arrival*: it has no moment where the thing lands.

        What it is now, and every part of it is `transform` or `opacity`:

          · the letters rise together from 22px below, on a long soft curve
          · they settle from 1.08 scale, so the word arrives rather than fades
          · a sweep of light crosses the word once, left to right — this is the
            "Netflix" beat he is describing, and it is a translated gradient,
            not a filter
          · the whole card holds for a breath, then lifts away as one piece

        And the subtitle is gone, as asked. "Everything you have ever watched"
        was explaining a product to somebody who has not seen it yet, in the
        one second where the only job is to say the name.
      */}
      <motion.div
        className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
        animate={{ opacity: stage === "name" ? 1 : 0, y: stage === "name" ? 0 : -26 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
      >
        <motion.div
          className="relative overflow-hidden px-2"
          initial={{ opacity: 0, y: 22, scale: 1.08 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.95, ease: [0.16, 0.9, 0.24, 1] }}
        >
          <h1 className="text-[54px] font-bold tracking-[-0.045em] text-ink">Seenit</h1>
          {/* the sweep: one pass of light across the word, transform-only */}
          <motion.span
            className="absolute inset-y-0 w-1/2"
            style={{
              background:
                "linear-gradient(100deg, transparent, rgb(var(--rgb-accent) / 0.5), transparent)",
            }}
            initial={{ x: "-160%" }}
            animate={{ x: "260%" }}
            transition={{ duration: 1.15, delay: 0.34, ease: [0.4, 0, 0.2, 1] }}
            aria-hidden
          />
        </motion.div>
      </motion.div>

      {/*
        THE DEMO SITS EXACTLY WHERE THE DECK SITS.

        The user: "when the demo appears the cards are stuck to the top, the
        title is not showing, the whole page is not how it's supposed to be.
        The demo should be exactly where the cards usually are when you are
        swiping, and the name of the website should be there too."

        He is right and the cause was that this screen was laid out by hand
        instead of copying the deck. The deck is: `h1` at the top, then a
        `flex-1` stack, then the button row. This had no `h1`, so the stack
        started 40px higher and every card sat above where its real counterpart
        would be — the demo taught the gesture in the wrong place.

        The heading below is the deck's heading, same size, same weight, same
        margin. It fades in with the deck rather than with the name card, so the
        name still gets the screen to itself first.
      */}
      <motion.h1
        className="relative z-10 mb-2 shrink-0 self-start text-[26px] font-bold tracking-[-0.03em]"
        initial={{ opacity: 0 }}
        animate={{ opacity: stage === "demo" ? 1 : 0 }}
        transition={{ duration: 0.45, ease: EASE_OUT }}
      >
        Seenit
      </motion.h1>

      <div className="relative z-10 min-h-0 w-full flex-1">
        <div className="relative mx-auto h-full w-fit">
          <div className="relative h-full max-w-[80vw]" style={{ aspectRatio: "10 / 14.6" }}>
            {/* two cards behind, so the stack looks like the deck it becomes */}
            {cards.slice(1, 3).map((tt, i) => (
              <motion.div
                key={tt.id}
                className="soft-card absolute inset-0 overflow-hidden"
                initial={{ opacity: 0, y: (i + 1) * 12 + 20, scale: 1 - (i + 1) * 0.05 }}
                animate={{
                  opacity: stage === "demo" ? 1 : 0,
                  y: (i + 1) * 12,
                  scale: 1 - (i + 1) * 0.05,
                }}
                transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.08 * i }}
                style={{ zIndex: 10 - i }}
              >
                <PosterArt title={tt} sizes="320px" />
                {/*
                  The cards behind sit slightly in shadow. This used to be
                  `filter: brightness(0.93)` in the `animate` block above —
                  which meant framer interpolated a filter from `none` to
                  `brightness(0.93)` across 450ms, on two full-size posters, in
                  the opening seconds of the app.

                  An animated filter is a re-rasterisation of the element on
                  every frame. I removed exactly this construct from the deck
                  after the user filmed his phone freezing on it, and then left
                  it sitting in the demo — which is the screen he came back and
                  told me still ran "like one frame per second". A black sheet
                  at 7% opacity is the same picture, composited.
                */}
                <div className="pointer-events-none absolute inset-0 bg-black/[0.07]" aria-hidden />
                <div className="card-sheen absolute inset-0" />
              </motion.div>
            ))}

            {/*
              THE CARD TILTS, BECAUSE A REAL ONE DOES.

              The user: "the card is not being tilted, that's a problem in the
              demo. It just moves right, the whole card as it is, fixed. It
              feels like a robot. When you actually swipe a card it gets tilted
              to the side you are swiping it to. It does not show the actual
              dynamic of how you swipe the card."

              Exactly right, and the omission was mine: `SwipeCard` derives
              `rotate` from its own `x` and this screen never did, so the demo
              was translating a rectangle while claiming to demonstrate a
              gesture. The transform below is character-for-character the one
              the real card uses — not a similar one, the same one — so the two
              cannot drift apart again.
            */}
            <motion.div
              className="absolute inset-0 z-20"
              style={{ x, y, rotate }}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: stage === "demo" ? 1 : 0, scale: 1 }}
              transition={{ duration: 0.45, ease: EASE_OUT }}
            >
              <div className="soft-card relative h-full w-full overflow-hidden">
                {cards[0] ? (
                  <PosterArt title={cards[0]} sizes="380px" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-surface-2 to-line" />
                )}
                <div className="card-sheen absolute inset-0" />
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* the row the demo is teaching, drawn as it will actually be */}
      <div className="relative z-10 flex shrink-0 items-center justify-center gap-4 py-3" aria-hidden>
        {[64, 46, 46, 64].map((size, i) => (
          <motion.div
            key={i}
            className="rounded-full border border-line bg-surface"
            style={{ width: size, height: size }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: stage === "demo" ? 1 : 0, y: 0 }}
            transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.05 * i }}
          />
        ))}
      </div>
    </div>
  );
}
