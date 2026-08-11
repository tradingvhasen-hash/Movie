"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { Swipe, SwipeAction, Title, UserList } from "@/lib/types";
import {
  applySwipe,
  emptyProfile,
  normalizeProfile,
  revertSwipe,
  type TasteProfile,
} from "@/lib/engine/taste";
import { getLocalTitle, vectorOf } from "@/lib/catalog";

/**
 * A stable per-user number mixed into every ranking tie-break and every
 * exploration draw. Without it the engine is fully deterministic, so the same
 * catalog produced the same opening deck in every browser, for everyone.
 */
function makeSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
}

/**
 * localStorage, written on a trailing edge instead of on every keystroke of
 * state.
 *
 * Serialising the whole library and writing it synchronously is one of the
 * two things that made rapid swiping stutter — by a few hundred swipes it is
 * hundreds of kilobytes re-encoded on the main thread per card. Swipes are
 * bursty and only the final state matters, so writes collapse into one.
 * A pending write is flushed the moment the page is hidden or unloaded, so
 * nothing is ever lost.
 */
const WRITE_DELAY_MS = 400;
let pendingWrite: { key: string; value: string } | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function flushWrite() {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (!pendingWrite) return;
  try {
    localStorage.setItem(pendingWrite.key, pendingWrite.value);
  } catch {
    // quota exceeded or storage disabled — the in-memory store still works
  }
  pendingWrite = null;
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushWrite);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushWrite();
  });
}

const deferredStorage: StateStorage = {
  getItem: (name) => {
    if (typeof localStorage === "undefined") return null;
    if (pendingWrite?.key === name) return pendingWrite.value;
    return localStorage.getItem(name);
  },
  setItem: (name, value) => {
    pendingWrite = { key: name, value };
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(flushWrite, WRITE_DELAY_MS);
  },
  removeItem: (name) => {
    pendingWrite = null;
    if (writeTimer) clearTimeout(writeTimer);
    if (typeof localStorage !== "undefined") localStorage.removeItem(name);
  },
};

interface DhawqState {
  swipes: Record<string, Swipe>;
  swipeOrder: string[]; // titleIds in swipe order (for undo + recency)
  profile: TasteProfile;
  seed: number;
  lists: UserList[];
  onboardingSeen: boolean;

  swipe: (title: Title, action: SwipeAction) => void;
  undo: () => string | null;
  removeSwipe: (titleId: string) => void;
  resetAll: () => void;
  setOnboardingSeen: () => void;

  createList: (name: string) => string;
  deleteList: (id: string) => void;
  renameList: (id: string, name: string) => void;
  toggleListItem: (listId: string, titleId: string) => void;
  setListPublic: (listId: string, isPublic: boolean) => void;
}

function titleFor(swipe: Swipe): Title | undefined {
  return swipe.title ?? getLocalTitle(swipe.titleId);
}

export const useDhawq = create<DhawqState>()(
  persist(
    (set, get) => ({
      swipes: {},
      swipeOrder: [],
      profile: emptyProfile(),
      seed: makeSeed(),
      lists: [],
      onboardingSeen: false,

      swipe: (title, action) => {
        const v = vectorOf(title);
        set((s) => {
          const existed = s.swipes[title.id];
          // re-swiping an existing title first reverts its old contribution
          let profile = s.profile;
          const oldTitle = existed ? titleFor(existed) : undefined;
          if (existed && oldTitle) {
            profile = revertSwipe(profile, oldTitle, vectorOf(oldTitle), existed.action);
          }
          profile = applySwipe(profile, title, v, action);
          return {
            swipes: {
              ...s.swipes,
              [title.id]: { titleId: title.id, action, at: Date.now(), title },
            },
            swipeOrder: [...s.swipeOrder.filter((id) => id !== title.id), title.id],
            profile,
          };
        });
      },

      undo: () => {
        const s = get();
        const lastId = s.swipeOrder[s.swipeOrder.length - 1];
        if (!lastId) return null;
        const last = s.swipes[lastId];
        const title = last ? titleFor(last) : undefined;
        set((st) => {
          const swipes = { ...st.swipes };
          delete swipes[lastId];
          return {
            swipes,
            swipeOrder: st.swipeOrder.slice(0, -1),
            profile:
              title && last
                ? revertSwipe(st.profile, title, vectorOf(title), last.action)
                : st.profile,
          };
        });
        return lastId;
      },

      removeSwipe: (titleId) => {
        const s = get();
        const sw = s.swipes[titleId];
        if (!sw) return;
        const title = titleFor(sw);
        set((st) => {
          const swipes = { ...st.swipes };
          delete swipes[titleId];
          return {
            swipes,
            swipeOrder: st.swipeOrder.filter((id) => id !== titleId),
            profile: title
              ? revertSwipe(st.profile, title, vectorOf(title), sw.action)
              : st.profile,
          };
        });
      },

      resetAll: () =>
        set({ swipes: {}, swipeOrder: [], profile: emptyProfile(), seed: makeSeed() }),

      setOnboardingSeen: () => set({ onboardingSeen: true }),

      createList: (name) => {
        const id = `list-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        set((s) => ({
          lists: [
            ...s.lists,
            { id, name, isPublic: false, titleIds: [], createdAt: Date.now() },
          ],
        }));
        return id;
      },

      deleteList: (id) =>
        set((s) => ({ lists: s.lists.filter((l) => l.id !== id) })),

      renameList: (id, name) =>
        set((s) => ({
          lists: s.lists.map((l) => (l.id === id ? { ...l, name } : l)),
        })),

      toggleListItem: (listId, titleId) =>
        set((s) => ({
          lists: s.lists.map((l) =>
            l.id === listId
              ? {
                  ...l,
                  titleIds: l.titleIds.includes(titleId)
                    ? l.titleIds.filter((t) => t !== titleId)
                    : [...l.titleIds, titleId],
                }
              : l
          ),
        })),

      setListPublic: (listId, isPublic) =>
        set((s) => ({
          lists: s.lists.map((l) => (l.id === listId ? { ...l, isPublic } : l)),
        })),
    }),
    {
      name: "dhawq-store",
      version: 4,
      storage: createJSONStorage(() => deferredStorage),
      /**
       * v4 replaced the hashed taste vector with named facet counters.
       *
       * No library is ever dropped on an upgrade: every swipe carries a
       * snapshot of the title it was made on, so the whole history is simply
       * replayed through the new model. A user who swiped for an hour keeps
       * every bit of that hour — and gets it back interpreted by an engine
       * that needs far fewer examples to act on it.
       */
      migrate: (persisted: unknown) => {
        const state = persisted as Partial<DhawqState> | undefined;
        if (!state) return persisted as DhawqState;
        const order = state.swipeOrder ?? [];
        const swipes = state.swipes ?? {};
        let profile = emptyProfile();
        for (const id of order) {
          const sw = swipes[id];
          const title = sw?.title ?? getLocalTitle(id);
          if (sw && title) profile = applySwipe(profile, title, vectorOf(title), sw.action);
        }
        return { ...state, profile, seed: state.seed ?? makeSeed() } as DhawqState;
      },
      /** guard against partially-shaped profiles from any older build */
      merge: (persisted, current) => {
        const state = (persisted ?? {}) as Partial<DhawqState>;
        return {
          ...current,
          ...state,
          seed: state.seed ?? current.seed,
          profile: normalizeProfile(state.profile),
        };
      },
    }
  )
);

/** Selectors */
export const selectWatched = (s: DhawqState) =>
  Object.values(s.swipes).filter((sw) => sw.action !== "not_seen");

export const selectLiked = (s: DhawqState) =>
  Object.values(s.swipes).filter((sw) => sw.action === "liked");
