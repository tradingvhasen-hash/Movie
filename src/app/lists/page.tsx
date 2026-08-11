"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import TitleTile from "@/components/TitleTile";
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

      <div className="mt-4 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) {
              createList(newName.trim());
              setNewName("");
            }
          }}
          placeholder={t("lists.namePlaceholder")}
          className="flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm outline-none placeholder:text-ink-faint focus:border-brand/60"
        />
        <button
          onClick={() => {
            if (!newName.trim()) return;
            createList(newName.trim());
            setNewName("");
          }}
          className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-black"
        >
          {t("lists.create")}
        </button>
      </div>

      {shareNotice && (
        <p className="mt-3 rounded-xl bg-skip/10 px-4 py-2.5 text-xs font-medium text-skip">
          {t("lists.shareRequiresAccount")}
        </p>
      )}

      {lists.length === 0 ? (
        <div className="mt-12 flex flex-col items-center text-center">
          <div className="text-5xl">🎞️</div>
          <p className="mt-4 text-ink-dim">{t("lists.empty")}</p>
        </div>
      ) : (
        <div className="mt-5 grid gap-3">
          {lists.map((list) => (
            <div key={list.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => setOpenListId(openListId === list.id ? null : list.id)}
                  className="min-w-0 text-start"
                >
                  <div className="truncate font-bold">{list.name}</div>
                  <div className="text-xs text-ink-faint">
                    {t("lists.itemsCount", { count: list.titleIds.length })}
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => setListPublic(list.id, !list.isPublic)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                      list.isPublic
                        ? "bg-like/15 text-like"
                        : "bg-surface-2 text-ink-faint"
                    }`}
                  >
                    {list.isPublic ? t("lists.public") : t("lists.private")}
                  </button>
                  <button
                    onClick={() => share(list.id)}
                    className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-ink-dim transition hover:text-ink"
                  >
                    {copiedId === list.id ? t("lists.copied") : t("lists.share")}
                  </button>
                  <button
                    onClick={() => deleteList(list.id)}
                    title={t("lists.delete")}
                    className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-ink-faint transition hover:text-nope"
                  >
                    🗑
                  </button>
                </div>
              </div>

              {openList?.id === list.id && (
                <div className="mt-4">
                  {list.titleIds.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                      {list.titleIds.map((id) => {
                        const title = swipes[id]?.title ?? getLocalTitle(id);
                        if (!title) return null;
                        return (
                          <TitleTile
                            key={id}
                            title={title}
                            onClick={() => toggleListItem(list.id, id)}
                            badge={
                              <span className="rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                                ✕
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
                      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                        {likedIds
                          .filter((id) => !list.titleIds.includes(id))
                          .map((id) => {
                            const title = swipes[id]?.title ?? getLocalTitle(id);
                            if (!title) return null;
                            return (
                              <button
                                key={id}
                                onClick={() => toggleListItem(list.id, id)}
                                className="shrink-0 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink-dim transition hover:border-brand/50 hover:text-ink"
                              >
                                + {title.title[locale]}
                              </button>
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
