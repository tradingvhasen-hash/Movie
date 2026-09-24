"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import PosterArt from "./PosterArt";
import { getLocalTitle, loadCatalog } from "@/lib/catalog";
import { useDhawq } from "@/lib/store";
import { FADE_UP, SPRING_SNAPPY, staggerContainer } from "@/lib/motion";
import { CheckIcon, PlusIcon } from "./ui/Icons";
import type { Title } from "@/lib/types";
import { useT } from "@/lib/i18n";

/**
 * A public list can be copied into local storage immediately. An account is a
 * backup/sync choice, not a prerequisite for creating a list on this device.
 *
 * sourceListId is the identity of the thing being copied. Names are presentation
 * and are allowed to collide; treating a name as identity previously made an
 * unrelated list suppress a copy and still show a false success state.
 */
export default function SharedList({
  listId,
  name,
  owner,
  titleIds,
}: {
  listId: string;
  name: string;
  owner: string | null;
  titleIds: string[];
}) {
  const t = useT();
  const [ready, setReady] = useState(false);
  const createList = useDhawq((s) => s.createList);
  const addToList = useDhawq((s) => s.addToList);
  const lists = useDhawq((s) => s.lists);
  const alreadyAdded = lists.some((l) => l.sourceListId === listId);

  useEffect(() => {
    void loadCatalog().then(() => setReady(true));
  }, []);

  const titles = useMemo(() => {
    if (!ready) return [];
    return titleIds
      .map((id) => getLocalTitle(id))
      .filter((t): t is Title => Boolean(t));
  }, [ready, titleIds]);

  const add = () => {
    if (alreadyAdded) return;

    const existingNames = new Set(
      lists.map((l) => l.name.trim().toLocaleLowerCase())
    );
    let copyName = name;
    let suffix = 2;
    while (existingNames.has(copyName.trim().toLocaleLowerCase())) {
      copyName = `${name} (${suffix++})`;
    }

    const id = createList(copyName, listId);
    addToList(id, titleIds);
  };

  return (
    <motion.div
      variants={staggerContainer(0.05)}
      initial="hidden"
      animate="show"
      className="px-5 pb-32 pt-8"
    >
      <motion.div variants={FADE_UP} className="flex justify-center">
        <Link
          href="/"
          className="text-lg font-bold tracking-[-0.03em] text-ink transition-opacity hover:opacity-70"
        >
          ذَوق
        </Link>
      </motion.div>

      <motion.p variants={FADE_UP} className="mt-8 text-center text-sm text-ink-dim">
        {owner ? (
          <>
            {t("shared.sharedBy", { name: owner })}
          </>
        ) : (
          t("shared.shared")
        )}
      </motion.p>
      <motion.h1 variants={FADE_UP} className="mt-1 text-center text-3xl font-bold tracking-tight">
        {name}
      </motion.h1>
      <motion.p variants={FADE_UP} className="mt-1 text-center text-xs tabular-nums text-ink-faint">
        {titleIds.length}
      </motion.p>

      <motion.div variants={FADE_UP} className="mt-7 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
        {(ready ? titles : Array.from({ length: Math.min(titleIds.length, 12) })).map((t, i) =>
          t ? (
            <motion.span
              key={(t as Title).id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING_SNAPPY, delay: Math.min(i, 12) * 0.02 }}
              className="block overflow-hidden rounded-xl border border-line"
            >
              <PosterArt title={t as Title} sizes="140px" className="aspect-[2/3] w-full" />
            </motion.span>
          ) : (
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
          disabled={alreadyAdded}
          aria-label={alreadyAdded ? t("shared.added") : t("shared.add")}
          className="mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-full bg-accent py-3.5 text-sm font-semibold text-on-accent disabled:opacity-60"
        >
          {alreadyAdded ? <CheckIcon size={17} strokeWidth={2.6} /> : <PlusIcon size={17} strokeWidth={2.4} />}
          {alreadyAdded ? t("shared.added") : t("shared.add")}
        </motion.button>
      </div>
    </motion.div>
  );
}
