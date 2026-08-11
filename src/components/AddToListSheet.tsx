"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useDhawq } from "@/lib/store";

export default function AddToListSheet({
  titleId,
  onClose,
}: {
  titleId: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const lists = useDhawq((s) => s.lists);
  const toggleListItem = useDhawq((s) => s.toggleListItem);
  const createList = useDhawq((s) => s.createList);
  const [newName, setNewName] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ y: 300 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="w-full max-w-md rounded-t-3xl border border-line bg-surface p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
        <h3 className="text-lg font-bold">{t("library.addToList")}</h3>

        <div className="mt-3 grid max-h-60 gap-2 overflow-y-auto">
          {lists.map((list) => {
            const included = list.titleIds.includes(titleId);
            return (
              <button
                key={list.id}
                onClick={() => toggleListItem(list.id, titleId)}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                  included
                    ? "border-brand/60 bg-brand/10 text-brand"
                    : "border-line bg-surface-2 text-ink-dim hover:text-ink"
                }`}
              >
                <span>{list.name}</span>
                <span>{included ? "✓" : "+"}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("lists.namePlaceholder")}
            className="flex-1 rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm outline-none placeholder:text-ink-faint focus:border-brand/60"
          />
          <button
            onClick={() => {
              const name = newName.trim();
              if (!name) return;
              const id = createList(name);
              toggleListItem(id, titleId);
              setNewName("");
            }}
            className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-black"
          >
            {t("lists.create")}
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-surface-2 py-2.5 text-sm font-semibold text-ink-dim"
        >
          {t("common.close")}
        </button>
      </motion.div>
    </div>
  );
}
