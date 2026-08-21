"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ListBuilder from "./ListBuilder";
import PosterArt from "./PosterArt";
import { getLocalTitle } from "@/lib/catalog";
import { useDhawq } from "@/lib/store";
import { useAccount } from "@/lib/supabase/useAccount";
import { publishList } from "@/lib/supabase/lists";
import { FADE_UP, SPRING_SNAPPY, staggerContainer } from "@/lib/motion";
import {
  CheckIcon,
  ChevronLeftIcon,
  PlusIcon,
  ShareIcon,
  StackIcon,
  TrashIcon,
} from "./ui/Icons";

/**
 * LISTS — rebuilt after the user got stuck inside one.
 *
 * His report, and it is the most damning kind: "the lists are unusable and
 * impossible to understand. It took me more than five minutes and I invented
 * them. And there is no back button and no save button — I'm stuck here."
 *
 * He was not exaggerating and the bug is structural rather than cosmetic. The
 * builder wrote every change straight into the store, so there was nothing to
 * save; and the only way out was a bare `‹` glyph floating above the heading,
 * which is a character, not a control. A screen that commits silently and
 * offers no exit is a screen a person cannot tell they are finished with. The
 * absence of a Done button was not a missing feature — it was the reason the
 * silent commits felt like a trap.
 *
 * So the editor now has a real header: a back control with a word next to it,
 * the list's name, and a Done button that is always present and always works.
 * It still commits immediately — that is the right behaviour, because a list
 * of two hundred films should not be lost to a closed tab — and Done is
 * therefore honest rather than decorative: it says "I am finished", which is a
 * different statement from "keep my work", and it is the one that was missing.
 *
 * A list is a *view* of the library, never a move out of it. Everything here
 * copies; nothing removes a title from what you have watched. That was asked
 * for explicitly and it is also the only coherent model: the library is a fact
 * about you, a list is an argument you are making about it.
 *
 * Sharing needs an account for one honest reason, and it is not a growth
 * tactic — a shared link has to resolve to *somebody*, and an anonymous device
 * has no somebody. So the requirement appears at the moment it becomes true
 * rather than as a wall in front of the screen.
 */
export default function ListsView() {
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
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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

  /* ── inside one list ── */
  if (editing) {
    return (
      <motion.div variants={staggerContainer(0.05)} initial="hidden" animate="show">
        <motion.div
          variants={FADE_UP}
          className="sticky top-0 z-20 -mx-5 flex items-center gap-3 border-b border-line bg-bg/90 px-5 py-3 backdrop-blur-xl"
        >
          <motion.button
            type="button"
            onClick={() => setOpen(null)}
            whileTap={{ scale: 0.92 }}
            transition={SPRING_SNAPPY}
            className="-ms-2 flex shrink-0 items-center gap-0.5 rounded-full py-1.5 pe-2.5 ps-1.5 text-sm font-semibold text-accent"
          >
            <ChevronLeftIcon size={19} strokeWidth={2.4} />
            Lists
          </motion.button>

          <span className="min-w-0 flex-1 truncate text-center text-sm font-bold">
            {editing.name}
          </span>

          <motion.button
            type="button"
            onClick={() => setOpen(null)}
            whileTap={{ scale: 0.94 }}
            transition={SPRING_SNAPPY}
            className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-bold text-[color:var(--color-on-accent)]"
          >
            Done
          </motion.button>
        </motion.div>

        <div className="mt-5">
          <ListBuilder listId={editing.id} />
        </div>
      </motion.div>
    );
  }

  /* ── the shelf ── */
  return (
    <motion.div variants={staggerContainer(0.05)} initial="hidden" animate="show">
      <motion.div variants={FADE_UP} className="mt-1">
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") create();
                  if (e.key === "Escape") setNaming(false);
                }}
                placeholder="Name it"
                className="flex-1 rounded-2xl border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors placeholder:text-ink-faint focus:border-accent"
              />
              <motion.button
                type="button"
                onClick={create}
                whileTap={{ scale: 0.93 }}
                transition={SPRING_SNAPPY}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent text-[color:var(--color-on-accent)]"
                aria-label="Create"
              >
                <CheckIcon size={18} strokeWidth={2.6} />
              </motion.button>
            </motion.div>
          ) : (
            <motion.button
              key="add"
              type="button"
              onClick={() => setNaming(true)}
              whileTap={{ scale: 0.97 }}
              transition={SPRING_SNAPPY}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line py-4 text-ink-faint transition-colors hover:text-ink-dim"
              aria-label="New list"
            >
              <PlusIcon size={18} strokeWidth={2.4} />
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>

      {lists.length === 0 && !naming && (
        <motion.div variants={FADE_UP} className="mt-14 flex justify-center">
          <StackIcon size={46} strokeWidth={1.3} className="text-ink-faint" />
        </motion.div>
      )}

      <div className="mt-4 space-y-3">
        <AnimatePresence initial={false}>
          {lists.map((list) => {
            const covers = list.titleIds
              .map((id) => getLocalTitle(id))
              .filter(Boolean)
              .slice(0, 5);
            const armed = confirmDelete === list.id;
            return (
              <motion.div
                key={list.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={SPRING_SNAPPY}
                className="overflow-hidden rounded-3xl border border-line bg-surface p-4"
              >
                <motion.button
                  type="button"
                  onClick={() => setOpen(list.id)}
                  whileTap={{ scale: 0.985 }}
                  transition={SPRING_SNAPPY}
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
                </motion.button>

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

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    transition={SPRING_SNAPPY}
                    onClick={() => setListHideOwner(list.id, !list.hideOwner)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      list.hideOwner
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-line text-ink-faint"
                    }`}
                  >
                    Anonymous
                  </motion.button>

                  {/* delete asks once, in place, rather than through a dialog
                      that would cover the thing being deleted */}
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    transition={SPRING_SNAPPY}
                    onClick={() => {
                      if (armed) deleteList(list.id);
                      else setConfirmDelete(list.id);
                    }}
                    onBlur={() => setConfirmDelete(null)}
                    animate={{
                      backgroundColor: armed ? "var(--color-danger)" : "rgba(0,0,0,0)",
                      color: armed ? "#fff" : "var(--color-ink-faint)",
                    }}
                    className="ms-auto grid h-8 w-8 place-items-center rounded-full"
                    aria-label={armed ? "Tap again to delete" : "Delete list"}
                  >
                    <TrashIcon size={15} />
                  </motion.button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
