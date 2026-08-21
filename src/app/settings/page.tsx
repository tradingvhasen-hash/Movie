"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowUpIcon,
  ChevronLeftIcon,
  EyeIcon,
  HeartIcon,
  ThumbsDownIcon,
} from "@/components/ui/Icons";
import { FADE_UP, SPRING_SNAPPY, staggerContainer } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { useDhawq } from "@/lib/store";

/**
 * SETTINGS — the place the fifth button went.
 *
 * The user counted the controls on the deck and said there were too many: he
 * wants three, or four with undo. The fifth verdict — "watched it, no strong
 * feeling" — is a real answer that a minority of people want to give often,
 * and the honest way to serve both is not to argue about the default. It is to
 * make the default small and put the rest here.
 *
 * He also asked for the gestures to be remappable, which sounds like a power
 * feature and is really an accessibility one: the upward swipe is the least
 * comfortable of the three on a large phone held in one hand, so which answer
 * it carries should be the person's choice rather than mine.
 *
 * This screen contains only things that change what the app *does*. There is
 * no theme switch, on purpose: the app follows the phone's own light and dark
 * setting, and a second place to answer a question the operating system has
 * already answered is a second place for the answer to be wrong.
 */
export default function SettingsPage() {
  const settings = useDhawq((s) => s.settings);
  const setSettings = useDhawq((s) => s.setSettings);

  const tap = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => {
    haptic("tick", settings.haptics || key === "haptics");
    setSettings({ [key]: value } as Partial<typeof settings>);
  };

  return (
    <motion.div
      variants={staggerContainer(0.05)}
      initial="hidden"
      animate="show"
      className="mx-auto max-w-md px-5 pb-28 pt-6"
    >
      <motion.div variants={FADE_UP}>
        <Link
          href="/profile"
          className="-ms-2 inline-flex items-center gap-0.5 rounded-full py-1.5 pe-3 ps-1.5 text-sm font-semibold text-accent transition-transform active:scale-95"
        >
          <ChevronLeftIcon size={19} strokeWidth={2.4} />
          You
        </Link>
      </motion.div>

      <motion.h1
        variants={FADE_UP}
        className="mt-3 text-[26px] font-bold tracking-[-0.03em]"
      >
        Settings
      </motion.h1>

      {/* ── the deck ── */}
      <Group title="The deck">
        <ToggleRow
          icon={<EyeIcon size={18} />}
          label="Fourth button"
          hint="Watched it, no strong feeling"
          on={settings.showSeenButton}
          onChange={(v) => tap("showSeenButton", v)}
        />
      </Group>

      {/* ── gestures ── */}
      <Group title="Swipe up means">
        <ChoiceRow
          icon={<ArrowUpIcon size={18} />}
          label="Haven't seen it"
          on={settings.swipeUp === "not_seen"}
          onSelect={() => tap("swipeUp", "not_seen")}
        />
        <ChoiceRow
          icon={<EyeIcon size={18} />}
          label="Watched it, no strong feeling"
          on={settings.swipeUp === "seen"}
          onSelect={() => tap("swipeUp", "seen")}
          last
        />
      </Group>

      {/* the two directions that are not up, stated once so the map is whole */}
      <motion.div
        variants={FADE_UP}
        className="mt-2.5 flex items-center justify-center gap-6 rounded-3xl border border-line bg-surface px-4 py-3.5"
        dir="ltr"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-ink-faint">
          <span className="text-danger">
            <ThumbsDownIcon size={17} filled />
          </span>
          ←
        </span>
        <span className="h-5 w-px bg-line" />
        <span className="flex items-center gap-2 text-xs font-semibold text-ink-faint">
          →
          <span className="text-accent">
            <HeartIcon size={17} filled />
          </span>
        </span>
      </motion.div>

      {/* ── feel ── */}
      <Group title="Feel">
        <ToggleRow
          label="Colour on the screen"
          hint="The whole screen answers the drag"
          on={settings.screenFeedback}
          onChange={(v) => tap("screenFeedback", v)}
        />
        <ToggleRow
          label="Vibration"
          hint="Where the device has a motor"
          on={settings.haptics}
          onChange={(v) => tap("haptics", v)}
          last
        />
      </Group>
    </motion.div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <motion.section variants={FADE_UP} className="mt-7">
      <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
        {title}
      </h2>
      <div className="overflow-hidden rounded-3xl border border-line bg-surface">
        {children}
      </div>
    </motion.section>
  );
}

function ToggleRow({
  icon,
  label,
  hint,
  on,
  onChange,
  last,
}: {
  icon?: React.ReactNode;
  label: string;
  hint?: string;
  on: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 ${last ? "" : "border-b border-line"}`}
    >
      {icon && <span className="text-ink-faint">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="mt-0.5 block text-[11.5px] text-ink-faint">{hint}</span>}
      </span>
      <Switch on={on} onChange={onChange} label={label} />
    </div>
  );
}

/** the platform switch, drawn in this app's own tokens rather than borrowed */
function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      whileTap={{ scale: 0.94 }}
      transition={SPRING_SNAPPY}
      className="relative h-[31px] w-[51px] shrink-0 rounded-full p-[2px]"
      style={{ backgroundColor: on ? "var(--color-accent)" : "var(--color-line)" }}
    >
      <motion.span
        className="block h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_5px_rgb(0_0_0/0.22)]"
        animate={{ x: on ? 20 : 0 }}
        transition={{ type: "spring", stiffness: 520, damping: 34 }}
      />
    </motion.button>
  );
}

function ChoiceRow({
  icon,
  label,
  on,
  onSelect,
  last,
}: {
  icon?: React.ReactNode;
  label: string;
  on: boolean;
  onSelect: () => void;
  last?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-surface-2 ${
        last ? "" : "border-b border-line"
      }`}
    >
      {icon && <span className={on ? "text-accent" : "text-ink-faint"}>{icon}</span>}
      <span className="flex-1 text-sm font-semibold">{label}</span>
      <motion.span
        className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2"
        animate={{
          borderColor: on ? "var(--color-accent)" : "var(--color-line)",
          backgroundColor: on ? "var(--color-accent)" : "rgba(0,0,0,0)",
        }}
        transition={SPRING_SNAPPY}
      >
        <motion.span
          className="block h-2 w-2 rounded-full bg-white"
          animate={{ scale: on ? 1 : 0 }}
          transition={SPRING_SNAPPY}
        />
      </motion.span>
    </button>
  );
}
