"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ComboInput, FancyCheckbox, NeuButton } from "./ui";
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

  function createAndAdd() {
    const name = newName.trim();
    if (!name) return;
    const id = createList(name);
    toggleListItem(id, titleId);
    setNewName("");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 300 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="neu-card w-full max-w-md rounded-b-none p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
        <h3 className="text-lg font-bold">{t("library.addToList")}</h3>

        {/* list selection — animated checkbox (Uiverse.io by MattiaCode-IT) */}
        <div className="mt-3 grid max-h-60 gap-1 overflow-y-auto">
          {lists.map((list) => (
            <FancyCheckbox
              key={list.id}
              id={`sheet-${list.id}`}
              checked={list.titleIds.includes(titleId)}
              onChange={() => toggleListItem(list.id, titleId)}
            >
              {list.name}
            </FancyCheckbox>
          ))}
        </div>

        {/* create new list — combo input (Uiverse.io by Smit-Prajapati) */}
        <ComboInput
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t("lists.namePlaceholder")}
          buttonLabel={t("lists.create")}
          onAction={createAndAdd}
          className="mt-4"
        />

        <NeuButton onClick={onClose} className="mt-4 w-full text-sm">
          {t("common.close")}
        </NeuButton>
      </motion.div>
    </div>
  );
}
