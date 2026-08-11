"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import SwipeCard from "./SwipeCard";
import SwipeBurst from "./SwipeBurst";
import { useDeck } from "@/lib/useDeck";
import { useDhawq } from "@/lib/store";
import { GlowButton, HeartButton, NeuButton } from "./ui";
import { ArrowUpIcon, ClapperIcon, PopcornIcon, ThumbsDownIcon, UndoIcon } from "./ui/Icons";
import { FADE_UP, SECTION, SPRING_SNAPPY, staggerContainer } from "@/lib/motion";
import { t } from "@/lib/i18n";
import type { SwipeAction } from "@/lib/types";

export default function SwipeDeck() {
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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex h-[60dvh] items-center justify-center text-ink-dim"
      >
        {t("common.loading")}
      </motion.div>
    );
  }

  /* ── onboarding ── */
  if (!onboardingSeen) {
    const hints = [t("swipe.hintRight"), t("swipe.hintLeft"), t("swipe.hintUp")];
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="onboarding"
          variants={staggerContainer(0.08, 0.08)}
          initial="hidden"
          animate="show"
          exit="exit"
          className="mx-auto flex max-w-md flex-col items-center px-6 pb-28 pt-10 text-center"
        >
          <motion.div variants={FADE_UP}>
            <ClapperIcon size={48} strokeWidth={1.6} className="text-accent" />
          </motion.div>
          <motion.h1 variants={FADE_UP} className="mt-4 text-3xl font-bold tracking-tight">
            {t("onboarding.welcomeTitle")}
          </motion.h1>
          <motion.p variants={FADE_UP} className="mt-3 leading-relaxed text-ink-dim">
            {t("onboarding.welcomeBody")}
          </motion.p>

          {/* swipe hints as animated checklist — Uiverse.io by JkHuger */}
          <motion.div variants={FADE_UP} className="checklist mt-6 w-full text-start">
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

          <motion.div variants={FADE_UP} className="mt-7 w-full">
            <GlowButton onClick={setOnboardingSeen} className="w-full text-lg">
              {t("onboarding.start")}
            </GlowButton>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  /* ── deck: fits the viewport, never scrolls ── */
  return (
    <div
      className="mx-auto flex w-full max-w-md flex-col items-center overflow-hidden px-4 pt-4"
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
                  <PopcornIcon size={42} strokeWidth={1.6} className="text-ink-faint" />
                  <h3 className="mt-4 text-lg font-bold">{t("swipe.emptyTitle")}</h3>
                  <p className="mt-2 text-sm text-ink-dim">{t("swipe.emptyBody")}</p>
                  <motion.div whileTap={{ scale: 0.95 }} className="mt-6">
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
            {queue.slice(0, 3).map((title, i) => (
              <SwipeCard
                key={title.id}
                title={title}
                index={i}
                onSwipe={handleSwipe}
                forcedExit={i === 0 ? forcedExit : null}
              />
            ))}
          </div>
        </div>
      </div>

      {/* action buttons */}
      <motion.div
        variants={staggerContainer(0.06, 0.15)}
        initial="hidden"
        animate="show"
        className="flex shrink-0 items-center justify-center gap-4 py-3"
        dir="ltr"
      >
        <motion.div variants={FADE_UP} whileTap={{ scale: 0.88 }} transition={SPRING_SNAPPY}>
          <NeuButton
            round
            aria-label={t("swipe.disliked")}
            title={t("swipe.disliked")}
            onClick={() => trigger("disliked")}
            className="h-14 w-14 text-ink"
          >
            <ThumbsDownIcon size={22} strokeWidth={2.2} />
          </NeuButton>
        </motion.div>
        <motion.div variants={FADE_UP} whileTap={{ scale: 0.88 }} transition={SPRING_SNAPPY}>
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
        </motion.div>
        <motion.div variants={FADE_UP} whileTap={{ scale: 0.88 }} transition={SPRING_SNAPPY}>
          <NeuButton
            round
            aria-label={t("swipe.notSeen")}
            title={t("swipe.notSeen")}
            onClick={() => trigger("not_seen")}
            className="h-11 w-11"
          >
            <ArrowUpIcon size={17} />
          </NeuButton>
        </motion.div>
        <motion.div variants={FADE_UP} className="neu-btn neu-btn-round h-14 w-14">
          <HeartButton onLike={() => trigger("liked")} size={50} title={t("swipe.liked")} />
        </motion.div>
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
