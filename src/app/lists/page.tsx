"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ListBuilder from "@/components/ListBuilder";
import PosterArt from "@/components/PosterArt";
import { getLocalTitle } from "@/lib/catalog";
import { useDhawq } from "@/lib/store";
import { useAccount } from "@/lib/supabase/useAccount";
import { publishList } from "@/lib/supabase/lists";
import { FADE_UP, SPRING_SNAPPY, staggerContainer } from "@/lib/motion";
import { CheckIcon, PlusIcon, ShareIcon } from "@/components/ui/Icons";

/**
 * LISTS — the only screen in the app that needs an account, and the only one
 * that says so by doing rather than by explaining.
 *
 * A list is a *view* of the library, never a move out of it. Everything here
 * copies; nothing removes a title from what you have watched. That was asked
 * for explicitly and it is also the only coherent model: the library is a fact
 * about you, a list is an argument you are making.
 *
 * Sharing requires an account for one honest reason and it is not a growth
 * tactic — a shared link has to resolve to *somebody*, and an anonymous device
 * has no somebody. So the account requirement appears at the moment it becomes
 * true (pressing share) rather than as a wall in front of the page.
 */
export default function ListsPage() {
  const lists = useDhawq((s) => s.lists);
  const createList = useDhawq((s) => s.createList);
  const deleteList = useDhawq((s) => s.deleteList);
  const setListHideOwner = useDhawq((s) => s.setListHideOwner);
  const { session } = useAccount();

  const [open, setOpen] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [sharing, setSharing] = useState<string | null>(null);
  const [shared, setShared] = useState<Record<string, string>>({});

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = createList(trimmed);
    setName("");
    setNaming(false);
    setOpen(id);
  };

  const share = async (listId: string) => {
    const list = lists.find((l) => l.id === listId);
    if (!list) return;
    setSharing(listId);
    try {
      const slug = await publishList(list);
      if (slug) {
        const url = `${window.location.origin}/l/${slug}`;
        setShared((s) => ({ ...s, [listId]: url }));
        // the phone's own share sheet, so the link lands wherever they want it
        if (navigator.share) {
          await navigator.share({ title: list.name, url }).catch(() => {});
        } else {
          await navigator.clipboard?.writeText(url).catch(() => {});
        }
      }
    } finally {
      setSharing(null);
    }
  };

  const editing = open ? lists.find((l) => l.id === open) : null;

  if (editing) {
    return (
      <motion.div
        variants={staggerContainer(0.05)}
        initial="hidden"
        animate="show"
        className="px-5 pb-32 pt-6"
      >
        <motion.button
          variants={FADE_UP}
          type="button"
          onClick={() => setOpen(null)}
          className="text-sm font-semibold text-accent"
        >
          ‹
        </motion.button>
        <motion.h1 variants={FADE_UP} className="mt-2 text-3xl font-bold tracking-tight">
          {editing.name}
        </motion.h1>
        <div className="mt-5">
          <ListBuilder listId={editing.id} />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={staggerContainer(0.05)}
      initial="hidden"
      animate="show"
      className="px-5 pb-28 pt-6"
    >
      <motion.h1 variants={FADE_UP} className="text-3xl font-bold tracking-tight">
        Lists
      </motion.h1>

      <motion.div variants={FADE_UP} className="mt-5">
        <AnimatePresence mode="wait" initial={false}>
          {naming ? (
            <motion.div
              key="naming"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={SPRING_SNAPPY}
              className="flex gap-2"
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                placeholder="Name it"
                className="flex-1 rounded-2xl border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors focus:border-accent placeholder:text-ink-faint"
              />
              <button
                type="button"
                onClick={create}
                className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-on-accent"
              >
                <CheckIcon size={18} strokeWidth={2.6} />
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="add"
              type="button"
              onClick={() => setNaming(true)}
              whileTap={{ scale: 0.97 }}
              transition={SPRING_SNAPPY}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line py-4 text-sm font-semibold text-ink-dim"
            >
              <PlusIcon size={17} strokeWidth={2.4} />
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>

      <div className="mt-4 space-y-3">
        <AnimatePresence initial={false}>
          {lists.map((list) => {
            const covers = list.titleIds
              .map((id) => getLocalTitle(id))
              .filter(Boolean)
              .slice(0, 5);
            return (
              <motion.div
                key={list.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={SPRING_SNAPPY}
                className="rounded-3xl border border-line bg-surface p-4"
              >
                <button
                  type="button"
                  onClick={() => setOpen(list.id)}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <span className="flex -space-x-3">
                    {covers.length > 0 ? (
                      covers.map((t) => (
                        <span
                          key={t!.id}
                          className="block h-14 w-10 overflow-hidden rounded-lg border border-line"
                        >
                          <PosterArt title={t!} sizes="60px" className="h-full w-full" />
                        </span>
                      ))
                    ) : (
                      <>
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="block h-14 w-10 rounded-lg border border-dashed border-line"
                          />
                        ))}
                      </>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{list.name}</span>
                    <span className="block text-xs tabular-nums text-ink-faint">
                      {list.titleIds.length}
                    </span>
                  </span>
                </button>

                <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    transition={SPRING_SNAPPY}
                    disabled={list.titleIds.length === 0 || sharing === list.id}
                    onClick={() => void share(list.id)}
                    className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-dim disabled:opacity-40"
                  >
                    <ShareIcon size={14} />
                    {shared[list.id] ? "Copied" : session ? "Share" : "Sign in to share"}
                  </motion.button>

                  <button
                    type="button"
                    onClick={() => setListHideOwner(list.id, !list.hideOwner)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      list.hideOwner
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-line text-ink-faint"
                    }`}
                  >
                    Anonymous
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteList(list.id)}
                    className="ml-auto text-xs font-semibold text-ink-faint"
                  >
                    ✕
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
