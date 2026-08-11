"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import SwipeCard from "./SwipeCard";
import { useDeck } from "@/lib/useDeck";
import { useDhawq } from "@/lib/store";
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
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto flex max-w-md flex-col items-center px-6 pt-14 text-center"
      >
        <div className="mb-6 text-6xl">🎬</div>
        <h1 className="text-3xl font-bold">{t("onboarding.welcomeTitle")}</h1>
        <p className="mt-4 leading-relaxed text-ink-dim">{t("onboarding.welcomeBody")}</p>
        <div className="mt-6 grid w-full gap-2 text-sm">
          <div className="flex items-center gap-3 rounded-xl bg-surface p-3">
            <span className="text-like">➡️</span> {t("swipe.hintRight")}
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-surface p-3">
            <span className="text-nope">⬅️</span> {t("swipe.hintLeft")}
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-surface p-3">
            <span className="text-skip">⬆️</span> {t("swipe.hintUp")}
          </div>
        </div>
        <button
          onClick={setOnboardingSeen}
          className="mt-8 w-full rounded-2xl bg-brand py-3.5 text-lg font-bold text-black transition hover:bg-brand-deep"
        >
          {t("onboarding.start")}
        </button>
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
            <div className="mb-3 rounded-2xl bg-surface p-3">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-semibold text-brand">
                  {t("onboarding.progress")}
                </span>
                <span className="text-ink-dim">
                  {t("onboarding.calibrating", {
                    count: calibrationProgress.current,
                    total: calibrationProgress.total,
                  })}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <motion.div
                  className="h-full rounded-full bg-brand"
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
          <div className="flex h-full flex-col items-center justify-center rounded-card border border-line bg-surface p-8 text-center">
            <div className="text-5xl">🍿</div>
            <h3 className="mt-4 text-xl font-bold">{t("swipe.emptyTitle")}</h3>
            <p className="mt-2 text-sm text-ink-dim">{t("swipe.emptyBody")}</p>
            <button
              onClick={() => {
                resetAll();
                setTimeout(refill, 50);
              }}
              className="mt-6 rounded-xl bg-surface-2 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-line"
            >
              {t("swipe.reset")}
            </button>
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

      {/* action buttons */}
      <div className="mt-5 flex items-center justify-center gap-4" dir="ltr">
        <ActionButton
          label={t("swipe.disliked")}
          color="nope"
          onClick={() => trigger("disliked")}
          icon={
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          }
        />
        <ActionButton
          label={t("swipe.undo")}
          color="dim"
          small
          disabled={!canUndo}
          onClick={undo}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10a6 6 0 016 6v1" />
            </svg>
          }
        />
        <ActionButton
          label={t("swipe.notSeen")}
          color="skip"
          small
          onClick={() => trigger("not_seen")}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          }
        />
        <ActionButton
          label={t("swipe.liked")}
          color="like"
          onClick={() => trigger("liked")}
          icon={
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21s-7.5-4.9-9.7-9.1C.7 8.7 2.6 5 6.1 5c2 0 3.4 1.1 4.2 2.4L12 9l1.7-1.6C14.5 6.1 15.9 5 17.9 5c3.5 0 5.4 3.7 3.8 6.9C19.5 16.1 12 21 12 21z" />
            </svg>
          }
        />
      </div>

      <p className="mt-4 hidden text-center text-xs text-ink-faint sm:block">
        {t("swipe.keyboard")}
      </p>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  color,
  onClick,
  small = false,
  disabled = false,
}: {
  label: string;
  icon: React.ReactNode;
  color: "like" | "nope" | "skip" | "dim";
  onClick: () => void;
  small?: boolean;
  disabled?: boolean;
}) {
  const colorCls =
    color === "like"
      ? "text-like border-like/40 hover:bg-like/15"
      : color === "nope"
        ? "text-nope border-nope/40 hover:bg-nope/15"
        : color === "skip"
          ? "text-skip border-skip/40 hover:bg-skip/15"
          : "text-ink-dim border-line hover:bg-surface-2";
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center rounded-full border-2 bg-surface shadow-lg transition active:scale-90 disabled:opacity-30 ${colorCls} ${
        small ? "h-12 w-12" : "h-16 w-16"
      }`}
    >
      {icon}
    </button>
  );
}
