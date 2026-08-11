"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import SwipeCard from "./SwipeCard";
import SwipeBurst from "./SwipeBurst";
import { useDeck } from "@/lib/useDeck";
import { useDhawq } from "@/lib/store";
import { GlowButton, HeartButton, NeuButton } from "./ui";
import { ArrowUpIcon, ClapperIcon, PopcornIcon, ThumbsDownIcon, UndoIcon } from "./ui/Icons";
import type { SwipeAction } from "@/lib/types";

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0 },
};

export default function SwipeDeck() {
  const t = useTranslations();
  const { queue, hydrated, swipeTop, undo, canUndo, refill } = useDeck();
  const onboardingSeen = useDhawq((s) => s.onboardingSeen);
  const setOnboardingSeen = useDhawq((s) => s.setOnboardingSeen);
  const resetAll = useDhawq((s) => s.resetAll);

  const [forcedExit, setForcedExit] = useState<SwipeAction | null>(null);
  const [hintChecks, setHintChecks] = useState([false, false, false]);
  const [burst, setBurst] = useState<{ id: number; action: SwipeAction } | null>(null);

  const handleSwipe = useCallback(
    (action: SwipeAction) => {
      setForcedExit(null);
      swipeTop(action);
      // celebration matching the choice
      setBurst({ id: Date.now(), action });
      setTimeout(() => setBurst((b) => (b && Date.now() - b.id >= 950 ? null : b)), 1000);
    },
    [swipeTop]
  );

  const trigger = useCallback(
    (action: SwipeAction) => {
      if (queue.length === 0 || forcedExit) return;
      setForcedExit(action);
    },
    [queue.length, forcedExit]
  );

  // keyboard shortcuts (physical directions)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") trigger("liked");
      else if (e.key === "ArrowLeft") trigger("disliked");
      else if (e.key === "ArrowUp") {
        e.preventDefault();
        trigger("not_seen");
      } else if (e.key === "z" || e.key === "Backspace") undo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [trigger, undo]);

  if (!hydrated) {
    return (
      <div className="flex h-[60dvh] items-center justify-center text-ink-dim">
        {t("common.loading")}
      </div>
    );
  }

  if (!onboardingSeen) {
    const hints = [t("swipe.hintRight"), t("swipe.hintLeft"), t("swipe.hintUp")];
    return (
      <motion.div
        initial="hidden"
        animate="show"
        transition={{ staggerChildren: 0.09, delayChildren: 0.1 }}
        className="mx-auto flex max-w-md flex-col items-center px-6 pb-28 pt-12 text-center"
      >
        <motion.div variants={fadeUp} transition={{ duration: 0.5, ease: "easeOut" }}>
          <ClapperIcon size={52} strokeWidth={1.6} className="text-accent" />
        </motion.div>
        <motion.h1
          variants={fadeUp}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mt-5 text-3xl font-bold tracking-tight"
        >
          {t("onboarding.welcomeTitle")}
        </motion.h1>
        <motion.p
          variants={fadeUp}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mt-4 leading-relaxed text-ink-dim"
        >
          {t("onboarding.welcomeBody")}
        </motion.p>

        {/* swipe hints as animated checklist — Uiverse.io by JkHuger */}
        <motion.div
          variants={fadeUp}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="checklist mt-6 w-full text-start"
        >
          {hints.map((hint, i) => (
            <HintRow
              key={i}
              id={`hint-${i}`}
              checked={hintChecks[i]}
              onChange={(v) =>
                setHintChecks((prev) => prev.map((c, j) => (j === i ? v : c)))
              }
              label={hint}
            />
          ))}
        </motion.div>

        <motion.div
          variants={fadeUp}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mt-8 w-full"
        >
          <GlowButton onClick={setOnboardingSeen} className="w-full text-lg">
            {t("onboarding.start")}
          </GlowButton>
        </motion.div>
      </motion.div>
    );
  }

  /* everything fits the viewport — no scrolling on the swipe screen */
  return (
    <div
      className="mx-auto flex w-full max-w-md flex-col items-center overflow-hidden px-4 pt-3"
      style={{ height: "calc(100dvh - 78px - env(safe-area-inset-bottom))" }}
    >
      {/* card stack — sized by available height */}
      <div className="relative min-h-0 w-full flex-1">
        <div className="relative mx-auto h-full w-fit">
          <div className="relative h-full max-w-[85vw]" style={{ aspectRatio: "10 / 14.2" }}>
            <SwipeBurst burst={burst} />
            {queue.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="soft-card flex h-full flex-col items-center justify-center p-8 text-center"
              >
                <PopcornIcon size={44} strokeWidth={1.6} className="text-ink-faint" />
                <h3 className="mt-4 text-lg font-bold">{t("swipe.emptyTitle")}</h3>
                <p className="mt-2 text-sm text-ink-dim">{t("swipe.emptyBody")}</p>
                <NeuButton
                  onClick={() => {
                    resetAll();
                    setTimeout(refill, 50);
                  }}
                  className="mt-6 text-sm"
                >
                  {t("swipe.reset")}
                </NeuButton>
              </motion.div>
            ) : (
              queue.slice(0, 3).map((title, i) => (
                <SwipeCard
                  key={title.id}
                  title={title}
                  index={i}
                  onSwipe={handleSwipe}
                  forcedExit={i === 0 ? forcedExit : null}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* action buttons */}
      <div className="flex shrink-0 items-center justify-center gap-4 py-3" dir="ltr">
        <NeuButton
          round
          aria-label={t("swipe.disliked")}
          title={t("swipe.disliked")}
          onClick={() => trigger("disliked")}
          className="h-14 w-14 text-ink"
        >
          <ThumbsDownIcon size={23} strokeWidth={2.2} />
        </NeuButton>
        <NeuButton
          round
          aria-label={t("swipe.undo")}
          title={t("swipe.undo")}
          disabled={!canUndo}
          onClick={undo}
          className="h-11 w-11"
        >
          <UndoIcon size={17} />
        </NeuButton>
        <NeuButton
          round
          aria-label={t("swipe.notSeen")}
          title={t("swipe.notSeen")}
          onClick={() => trigger("not_seen")}
          className="h-11 w-11"
        >
          <ArrowUpIcon size={17} />
        </NeuButton>
        <div className="neu-btn neu-btn-round h-14 w-14">
          <HeartButton onLike={() => trigger("liked")} size={50} title={t("swipe.liked")} />
        </div>
      </div>
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
