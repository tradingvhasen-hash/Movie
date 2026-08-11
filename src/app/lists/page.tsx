"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import TitleTile from "@/components/TitleTile";
import { ComboInput, DotsMenu, NeuButton, NeuToggle } from "@/components/ui";
import { FilmIcon, PlusIcon, XIcon } from "@/components/ui/Icons";
import { getLocalTitle } from "@/lib/catalog";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { useDhawq } from "@/lib/store";

export default function ListsPage() {
  const t = useTranslations();
  const locale = useLocale() as "ar" | "en";
  const lists = useDhawq((s) => s.lists);
  const createList = useDhawq((s) => s.createList);
  const deleteList = useDhawq((s) => s.deleteList);
  const setListPublic = useDhawq((s) => s.setListPublic);
  const toggleListItem = useDhawq((s) => s.toggleListItem);
  const swipes = useDhawq((s) => s.swipes);

  const [hydrated, setHydrated] = useState(false);
  const [newName, setNewName] = useState("");
  const [openListId, setOpenListId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState(false);

  useEffect(() => setHydrated(true), []);
  if (!hydrated) return null;

  const openList = lists.find((l) => l.id === openListId) ?? null;
  const likedIds = Object.values(swipes)
    .filter((s) => s.action === "liked")
    .map((s) => s.titleId);

  function create() {
    if (!newName.trim()) return;
    createList(newName.trim());
    setNewName("");
  }

  async function share(listId: string) {
    if (!isSupabaseConfigured()) {
      setShareNotice(true);
      setTimeout(() => setShareNotice(false), 4000);
      return;
    }
    const url = `${window.location.origin}/l/${listId}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(listId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="px-5">
      <h1 className="text-2xl font-bold">{t("lists.title")}</h1>
      <p className="mt-1 text-sm text-ink-dim">{t("lists.subtitle")}</p>

      {/* create list — combo input (Uiverse.io by Smit-Prajapati) */}
      <ComboInput
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        placeholder={t("lists.namePlaceholder")}
        buttonLabel={t("lists.create")}
        onAction={create}
        className="mt-4"
      />

      {shareNotice && (
        <p className="neu-inset mt-3 px-4 py-2.5 text-xs font-medium text-ink-dim">
          {t("lists.shareRequiresAccount")}
        </p>
      )}

      {lists.length === 0 ? (
        <div className="mt-12 flex flex-col items-center text-center">
          <FilmIcon size={44} strokeWidth={1.6} className="text-ink-faint" />
          <p className="mt-4 text-ink-dim">{t("lists.empty")}</p>
        </div>
      ) : (
        <div className="mt-5 grid gap-4">
          {lists.map((list) => (
            <div key={list.id} className="neu-card-sm p-4">
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => setOpenListId(openListId === list.id ? null : list.id)}
                  className="min-w-0 flex-1 text-start"
                >
                  <div className="truncate font-bold">{list.name}</div>
                  <div className="text-xs text-ink-faint">
                    {t("lists.itemsCount", { count: list.titleIds.length })}
                    <span className="mx-1.5">·</span>
                    {list.isPublic ? t("lists.public") : t("lists.private")}
                    {copiedId === list.id && (
                      <span className="ms-2 font-semibold text-accent">
                        {t("lists.copied")}
                      </span>
                    )}
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  {/* public/private — neu toggle (Uiverse.io by mobinkakei) */}
                  <NeuToggle
                    checked={list.isPublic}
                    onChange={(v) => setListPublic(list.id, v)}
                    label={list.isPublic ? t("lists.public") : t("lists.private")}
                  />
                  {/* three-dots menu — from Uiverse.io stat-card by code-town3 */}
                  <DotsMenu
                    id={`list-menu-${list.id}`}
                    items={[
                      { label: t("lists.share"), onClick: () => share(list.id) },
                      { label: t("lists.delete"), onClick: () => deleteList(list.id), danger: true },
                    ]}
                  />
                </div>
              </div>

              {openList?.id === list.id && (
                <div className="mt-4">
                  {list.titleIds.length > 0 && (
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                      {list.titleIds.map((id) => {
                        const title = swipes[id]?.title ?? getLocalTitle(id);
                        if (!title) return null;
                        return (
                          <TitleTile
                            key={id}
                            title={title}
                            onClick={() => toggleListItem(list.id, id)}
                            badge={
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white">
                                <XIcon size={12} strokeWidth={3} />
                              </span>
                            }
                          />
                        );
                      })}
                    </div>
                  )}
                  {likedIds.filter((id) => !list.titleIds.includes(id)).length > 0 && (
                    <>
                      <div className="mb-2 mt-4 text-xs font-semibold text-ink-faint">
                        {t("lists.addItems")}
                      </div>
                      <div className="no-scrollbar flex gap-3 overflow-x-auto p-2 pb-3">
                        {likedIds
                          .filter((id) => !list.titleIds.includes(id))
                          .map((id) => {
                            const title = swipes[id]?.title ?? getLocalTitle(id);
                            if (!title) return null;
                            return (
                              <NeuButton
                                key={id}
                                onClick={() => toggleListItem(list.id, id)}
                                className="flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs"
                              >
                                <PlusIcon size={12} strokeWidth={2.6} />
                                {title.title[locale]}
                              </NeuButton>
                            );
                          })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
