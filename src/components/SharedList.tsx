"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import PosterArt from "./PosterArt";
import { getLocalTitle, loadCatalog } from "@/lib/catalog";
import { useDhawq } from "@/lib/store";
import { useAccount } from "@/lib/supabase/useAccount";
import { FADE_UP, SPRING_SNAPPY, staggerContainer } from "@/lib/motion";
import { CheckIcon, PlusIcon } from "./ui/Icons";
import type { Title } from "@/lib/types";

/**
 * THE PAGE SOMEBODY ELSE SEES.
 *
 * For most people who ever open this link, it is the entire product — the
 * first and possibly only screen of Seenit they will look at. So it says the
 * name, which almost nothing else in the app does: identity belongs where it
 * costs nothing and explains something, not in a bar stealing 56px from the one
 * screen the whole product is built around.
 *
 * TWO DOORS, AND ONLY ONE OF THEM HAS A LOCK. Browsing needs no account, ever —
 * a link that demands a signup before showing anything is a link nobody
 * forwards. Adding it to your own lists does need one, for an honest reason
 * rather than a growth one: there is nowhere to put it otherwise.
 *
 * AND THE RETURN. Someone who signs in from here must land back *on this list*
 * with the same question waiting, not on a home screen having lost what they
 * were doing. The pending intent is written to session storage before the
 * redirect and picked up on the way back, so the round trip is invisible.
 */
const PENDING = "dhawq:add-shared-list";

export default function SharedList({
  slug,
  name,
  owner,
  titleIds,
}: {
  slug: string;
  name: string;
  owner: string | null;
  titleIds: string[];
}) {
  const [ready, setReady] = useState(false);
  const [added, setAdded] = useState(false);
  const createList = useDhawq((s) => s.createList);
  const addToList = useDhawq((s) => s.addToList);
  const lists = useDhawq((s) => s.lists);
  const { session, signInWithGoogle } = useAccount();

  useEffect(() => {
    void loadCatalog().then(() => setReady(true));
  }, []);

  const titles = useMemo(() => {
    if (!ready) return [];
    return titleIds
      .map((id) => getLocalTitle(id))
      .filter((t): t is Title => Boolean(t));
  }, [ready, titleIds]);

  const take = useMemo(
    () => () => {
      if (lists.some((l) => l.name === name)) {
        setAdded(true);
        return;
      }
      const id = createList(name);
      addToList(id, titleIds);
      setAdded(true);
    },
    [addToList, createList, lists, name, titleIds]
  );

  /** came back from Google — finish what they asked for before leaving */
  useEffect(() => {
    if (!session || !ready) return;
    if (sessionStorage.getItem(PENDING) !== slug) return;
    sessionStorage.removeItem(PENDING);
    take();
  }, [session, ready, slug, take]);

  const add = () => {
    if (session) {
      take();
      return;
    }
    sessionStorage.setItem(PENDING, slug);
    void signInWithGoogle();
  };

  return (
    <motion.div
      variants={staggerContainer(0.05)}
      initial="hidden"
      animate="show"
      className="px-5 pb-32 pt-8"
    >
      {/* the name, plainly — this page is the first and possibly only screen
          of Seenit a stranger will ever look at */}
      <motion.div variants={FADE_UP} className="flex justify-center">
        <Link
          href="/"
          className="text-lg font-bold tracking-[-0.03em] text-ink transition-opacity hover:opacity-70"
        >
          Seenit
        </Link>
      </motion.div>

      <motion.p variants={FADE_UP} className="mt-8 text-center text-sm text-ink-dim">
        {owner ? (
          <>
            <span className="font-semibold text-ink">{owner}</span> shared
          </>
        ) : (
          "Shared"
        )}
      </motion.p>
      <motion.h1
        variants={FADE_UP}
        className="mt-1 text-center text-3xl font-bold tracking-tight"
      >
        {name}
      </motion.h1>
      <motion.p
        variants={FADE_UP}
        className="mt-1 text-center text-xs tabular-nums text-ink-faint"
      >
        {titleIds.length}
      </motion.p>

      <motion.div
        variants={FADE_UP}
        className="mt-7 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6"
      >
        {(ready ? titles : Array.from({ length: Math.min(titleIds.length, 12) })).map(
          (t, i) =>
            t ? (
              <motion.span
                key={(t as Title).id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING_SNAPPY, delay: Math.min(i, 12) * 0.02 }}
                className="block overflow-hidden rounded-xl border border-line"
              >
                <PosterArt
                  title={t as Title}
                  sizes="140px"
                  className="aspect-[2/3] w-full"
                />
              </motion.span>
            ) : (
              // a reserved box rather than nothing, so the grid does not jump
              // when the catalog lands
              <span
                key={i}
                className="block aspect-[2/3] w-full animate-pulse rounded-xl bg-surface-2"
              />
            )
        )}
      </motion.div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/85 px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          transition={SPRING_SNAPPY}
          onClick={add}
          disabled={added}
          className="mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-full bg-accent py-3.5 text-sm font-semibold text-on-accent disabled:opacity-60"
        >
          {added ? <CheckIcon size={17} strokeWidth={2.6} /> : <PlusIcon size={17} strokeWidth={2.4} />}
        </motion.button>
      </div>
    </motion.div>
  );
}
