"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import SwipeCard from "./SwipeCard";
import { useDeck } from "@/lib/useDeck";
import { useDhawq } from "@/lib/store";
import { GlowButton, HeartButton, NeuButton } from "./ui";
import { ArrowUpIcon, ClapperIcon, PopcornIcon, UndoIcon, XIcon } from "./ui/Icons";
import type { SwipeAction } from "@/lib/types";

export default function SwipeDeck() {
  const t = useTranslations();
  const {
    queue,
    hydrated,
    swipeTop,
    undo,
    canUndo,
    calibrating,
    calibrationProgress,
    refill,
  } = useDeck();
  const onboardingSeen = useDhawq((s) => s.onboardingSeen);
  const setOnboardingSeen = useDhawq((s) => s.setOnboardingSeen);
  const resetAll = useDhawq((s) => s.resetAll);

  const [forcedExit, setForcedExit] = useState<SwipeAction | null>(null);
  const [hintChecks, setHintChecks] = useState([false, false, false]);

  const handleSwipe = useCallback(
    (action: SwipeAction) => {
      setForcedExit(null);
      swipeTop(action);
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

  // keyboard shortcuts (physical directions, independent of RTL)
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
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto flex max-w-md flex-col items-center px-6 pt-12 text-center"
      >
        <ClapperIcon size={56} strokeWidth={1.6} className="text-accent" />
        <h1 className="mt-5 text-3xl font-bold">{t("onboarding.welcomeTitle")}</h1>
        <p className="mt-4 leading-relaxed text-ink-dim">{t("onboarding.welcomeBody")}</p>

        {/* swipe hints as animated checklist — Uiverse.io by JkHuger */}
        <div className="checklist mt-6 w-full text-start" dir="auto">
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
        </div>

        <GlowButton onClick={setOnboardingSeen} className="mt-8 w-full text-lg">
          {t("onboarding.start")}
        </GlowButton>
      </motion.div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4">
      {/* calibration progress */}
      <AnimatePresence>
        {calibrating && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="neu-card-sm mb-3 p-3">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-semibold text-accent">
                  {t("onboarding.progress")}
                </span>
                <span className="text-ink-dim">
                  {t("onboarding.calibrating", {
                    count: calibrationProgress.current,
                    total: calibrationProgress.total,
                  })}
                </span>
              </div>
              <div className="neu-inset h-2.5 overflow-hidden rounded-full">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-l from-accent to-accent-deep"
                  animate={{
                    width: `${(calibrationProgress.current / calibrationProgress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* card stack */}
      <div className="relative mx-auto aspect-[10/15] w-full max-w-sm">
        {queue.length === 0 ? (
          <div className="neu-card flex h-full flex-col items-center justify-center p-8 text-center">
            <PopcornIcon size={48} strokeWidth={1.6} className="text-ink-faint" />
            <h3 className="mt-4 text-xl font-bold">{t("swipe.emptyTitle")}</h3>
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
          </div>
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

      {/* action buttons: neu buttons (ke1221) + bursting heart (catraco) */}
      <div className="mt-6 flex items-center justify-center gap-5" dir="ltr">
        <NeuButton
          round
          aria-label={t("swipe.disliked")}
          title={t("swipe.disliked")}
          onClick={() => trigger("disliked")}
          className="h-16 w-16 text-ink"
        >
          <XIcon size={26} strokeWidth={2.6} />
        </NeuButton>
        <NeuButton
          round
          aria-label={t("swipe.undo")}
          title={t("swipe.undo")}
          disabled={!canUndo}
          onClick={undo}
          className="h-12 w-12"
        >
          <UndoIcon size={19} />
        </NeuButton>
        <NeuButton
          round
          aria-label={t("swipe.notSeen")}
          title={t("swipe.notSeen")}
          onClick={() => trigger("not_seen")}
          className="h-12 w-12"
        >
          <ArrowUpIcon size={19} />
        </NeuButton>
        <div className="neu-btn neu-btn-round h-16 w-16">
          <HeartButton
            onLike={() => trigger("liked")}
            size={56}
            title={t("swipe.liked")}
          />
        </div>
      </div>

      <p className="mt-4 hidden text-center text-xs text-ink-faint sm:block">
        {t("swipe.keyboard")}
      </p>
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
