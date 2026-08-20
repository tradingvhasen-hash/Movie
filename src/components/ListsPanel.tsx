"use client";

/**
 * LISTS: THE PART OF THIS PRODUCT SOMEBODY ELSE EVER SEES.
 *
 * Everything else here is private — a library, a taste model, a deck. A list is
 * the only artefact that leaves, which makes it the only screen where the
 * design is doing marketing as well as work, and the reason the share page it
 * produces gets more care than any other page in the app.
 *
 * WHY LISTS LIVE OFF THE LIBRARY RATHER THAN IN THE TAB BAR. The bar has four
 * tabs and a fifth would make each one a smaller target on the screen size this
 * product is built for. Lists are made *out of* the library and looked at right
 * after it, so the entry point sits in the library's own header next to the
 * profile — which is where a person goes looking for "the things I made" —
 * rather than competing with Swipe for a permanent seat.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import ListBuilder from "./ListBuilder";
import PosterArt from "./PosterArt";
import { getLocalTitle } from "@/lib/catalog";
import { useDhawq } from "@/lib/store";
import { useAccount } from "@/lib/supabase/useAccount";
import { EASE_OUT, FADE_UP, QUICK, staggerContainer } from "@/lib/motion";
import { CheckIcon, LinkIcon, PlusIcon, TrashIcon } from "./ui/Icons";

export default function ListsPanel() {
  const lists = useDhawq((s) => s.lists);
  const createList = useDhawq((s) => s.createList);
  const deleteList = useDhawq((s) => s.deleteList);
  const toggleListItem = useDhawq((s) => s.toggleListItem);
  const setListPublic = useDhawq((s) => s.setListPublic);
  const { session } = useAccount();

  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [creating, setCreating] = useState(false);

  const current = lists.find((l) => l.id === editing) ?? null;
  const chosen = useMemo(() => new Set(current?.titleIds ?? []), [current]);

  const start = () => {
    const id = createList(draftName.trim() || "Untitled list");
    setDraftName("");
    setCreating(false);
    setEditing(id);
  };

  /* ── editing one list ── */
  if (current) {
    return (
      <motion.div
        variants={staggerContainer(0.05)}
        initial="hidden"
        animate="show"
        className="mx-auto max-w-md px-5 pb-32 pt-7"
      >
        <motion.div variants={FADE_UP} className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="text-sm font-semibold text-ink-dim transition-colors hover:text-ink"
          >
            Done
          </button>
          <span className="text-sm tabular-nums text-ink-faint">
            {current.titleIds.length}
          </span>
        </motion.div>

        <motion.input
          variants={FADE_UP}
          value={current.name}
          onChange={(e) => useDhawq.getState().renameList(current.id, e.target.value)}
          className="mt-3 w-full bg-transparent text-2xl font-bold tracking-tight outline-none"
        />

        {/*
          Sharing is the one thing here that genuinely cannot work without an
          account — a link has to resolve to something on a server, and there is
          no server-side "this device". Saying so at the moment the person
          reaches for it is one of the two kinds of text that survived the
          sweep: it explains a thing that would otherwise silently not happen.
        */}
        <motion.div variants={FADE_UP} className="mt-4 flex items-center gap-3">
          <button
            type="button"
            disabled={!session}
            onClick={() => setListPublic(current.id, !current.isPublic)}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-40 ${
              current.isPublic
                ? "border-accent bg-accent/12 text-accent"
                : "border-line bg-surface text-ink-dim"
            }`}
          >
            <LinkIcon size={15} />
            {current.isPublic ? "Shared" : "Share"}
          </button>
          {!session && (
            <Link href="/profile" className="text-xs text-ink-faint underline">
              Sign in to share
            </Link>
          )}
        </motion.div>

        <div className="mt-7">
          <ListBuilder
            chosen={chosen}
            onToggle={(id) => toggleListItem(current.id, id)}
            onAddMany={(ids) => {
              for (const id of ids) if (!chosen.has(id)) toggleListItem(current.id, id);
            }}
          />
        </div>
      </motion.div>
    );
  }

  /* ── the shelf ── */
  return (
    <motion.div
      variants={staggerContainer(0.06)}
      initial="hidden"
      animate="show"
      className="mx-auto max-w-md px-5 pb-28 pt-7"
    >
      <motion.div variants={FADE_UP} className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Lists</h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          aria-label="New list"
          className="grid h-9 w-9 place-items-center rounded-full bg-accent text-[color:var(--color-on-accent)]"
        >
          <PlusIcon size={18} />
        </button>
      </motion.div>

      <AnimatePresence>
        {creating && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: QUICK, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="mt-4 flex gap-2">
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && start()}
                placeholder="Best of 2025"
                className="flex-1 rounded-2xl border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={start}
                className="grid w-12 place-items-center rounded-2xl bg-accent text-[color:var(--color-on-accent)]"
              >
                <CheckIcon size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-6 flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {lists.map((l) => {
            const covers = l.titleIds
              .slice(0, 4)
              .map((id) => getLocalTitle(id))
              .filter(Boolean);
            return (
              <motion.div
                key={l.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: QUICK, ease: EASE_OUT }}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3"
              >
                <button
                  type="button"
                  onClick={() => setEditing(l.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-start"
                >
                  {/* the covers are the description: four posters say what a
                      list is about faster than any sentence naming its genres */}
                  <span className="flex shrink-0 -space-x-3">
                    {covers.length === 0 && (
                      <span className="h-14 w-10 rounded-lg border border-dashed border-line" />
                    )}
                    {covers.map((t) => (
                      <span
                        key={t!.id}
                        className="h-14 w-10 overflow-hidden rounded-lg border-2 border-surface"
                      >
                        <PosterArt title={t!} sizes="48px" className="h-full w-full" />
                      </span>
                    ))}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{l.name}</span>
                    <span className="block text-xs text-ink-faint">
                      {l.titleIds.length} · {l.isPublic ? "shared" : "private"}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Delete list"
                  onClick={() => deleteList(l.id)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:text-danger"
                >
                  <TrashIcon size={17} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
