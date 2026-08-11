"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Swipe, SwipeAction, Title, UserList } from "@/lib/types";
import {
  applySwipe,
  emptyProfile,
  normalizeProfile,
  revertSwipe,
  type TasteProfile,
} from "@/lib/engine/taste";
import { getLocalTitle, vectorOf } from "@/lib/catalog";

interface DhawqState {
  swipes: Record<string, Swipe>;
  swipeOrder: string[]; // titleIds in swipe order (for undo + recency)
  profile: TasteProfile;
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

function vectorFor(swipe: Swipe): Float32Array | null {
  const title = swipe.title ?? getLocalTitle(swipe.titleId);
  return title ? vectorOf(title) : null;
}

export const useDhawq = create<DhawqState>()(
  persist(
    (set, get) => ({
      swipes: {},
      swipeOrder: [],
      profile: emptyProfile(),
      lists: [],
      onboardingSeen: false,

      swipe: (title, action) => {
        const v = vectorOf(title);
        set((s) => {
          const existed = s.swipes[title.id];
          // re-swiping an existing title first reverts its old contribution
          let profile = s.profile;
          if (existed) {
            const oldV = vectorFor(existed);
            if (oldV) profile = revertSwipe(profile, oldV, existed.action);
          }
          profile = applySwipe(profile, v, action);
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
        const v = last ? vectorFor(last) : null;
        set((st) => {
          const swipes = { ...st.swipes };
          delete swipes[lastId];
          return {
            swipes,
            swipeOrder: st.swipeOrder.slice(0, -1),
            profile: v && last ? revertSwipe(st.profile, v, last.action) : st.profile,
          };
        });
        return lastId;
      },

      removeSwipe: (titleId) => {
        const s = get();
        const sw = s.swipes[titleId];
        if (!sw) return;
        const v = vectorFor(sw);
        set((st) => {
          const swipes = { ...st.swipes };
          delete swipes[titleId];
          return {
            swipes,
            swipeOrder: st.swipeOrder.filter((id) => id !== titleId),
            profile: v ? revertSwipe(st.profile, v, sw.action) : st.profile,
          };
        });
      },

      resetAll: () =>
        set({ swipes: {}, swipeOrder: [], profile: emptyProfile() }),

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
      version: 2,
      /**
       * v2 added the familiarity model. Rather than dropping existing
       * libraries, the fingerprint is rebuilt from the stored swipes —
       * every swipe carries a title snapshot, so it can be replayed.
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
          if (sw && title) profile = applySwipe(profile, vectorOf(title), sw.action);
        }
        return { ...state, profile } as DhawqState;
      },
      /** guard against partially-shaped profiles from any older build */
      merge: (persisted, current) => {
        const state = (persisted ?? {}) as Partial<DhawqState>;
        return {
          ...current,
          ...state,
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
