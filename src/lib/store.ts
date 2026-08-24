"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import type { Swipe, SwipeAction, Title, UserList } from "@/lib/types";
import {
  applySwipe,
  emptyProfile,
  normalizeProfile,
  revertSwipe,
  type TasteProfile,
} from "@/lib/engine/taste";
import { getLocalItem, getLocalTitle, vectorOf } from "@/lib/catalog";

/**
 * A stable per-user number mixed into every ranking tie-break and every
 * exploration draw. Without it the engine is fully deterministic, so the same
 * catalog produced the same opening deck in every browser, for everyone.
 */
function makeSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
}

/**
 * localStorage, both **encoded and written** on a trailing edge.
 *
 * The write was already deferred. The encoding was not, and the encoding is
 * the expensive half: `createJSONStorage` hands the persist middleware a
 * string, so `JSON.stringify` of the entire library ran inside every single
 * `set` — on the main thread, at the instant the finger lifts.
 *
 * Every swipe carries a snapshot of the title it was made on, so the library
 * is roughly 1.7 KB per card and the cost grows with the session. Measured on
 * a production build at 4x CPU, frames lost during the half-second after a
 * swipe:
 *
 *     empty library      3 KB       25 frames, worst stall  67 ms
 *     200 swipes       376 KB       52 frames, worst stall 183 ms
 *     600 swipes       992 KB       79 frames, worst stall 250 ms
 *
 * A quarter of a second of frozen screen on every card, and the goal for this
 * product is a library of *thousands*. The stutter the user reported was not
 * in the deck at all — it was the site writing down what he had just told it.
 *
 * Implementing `PersistStorage` rather than `StateStorage` means the
 * middleware hands us the state *object* and we choose when to encode it. The
 * state is immutable, so holding the latest reference and encoding it once per
 * burst loses nothing. A pending write is flushed the moment the page is
 * hidden or unloaded.
 */
const WRITE_DELAY_MS = 400;
let pendingWrite: { key: string; value: StorageValue<DhawqState> } | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function flushWrite() {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (!pendingWrite) return;
  try {
    localStorage.setItem(pendingWrite.key, JSON.stringify(pendingWrite.value));
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

const deferredStorage: PersistStorage<DhawqState> = {
  getItem: (name) => {
    // a burst still in the buffer is the freshest copy there is
    if (pendingWrite?.key === name) return pendingWrite.value;
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(name);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StorageValue<DhawqState>;
    } catch {
      return null;
    }
  },
  // Scheduling the flush through `requestIdleCallback` instead of this timer
  // was measured and made no difference at all (46 frames lost against 45), so
  // the plain timer stays.
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

/**
 * WHAT THE DECK LOOKS LIKE, AND WHICH GESTURE MEANS WHAT.
 *
 * The deck shipped with five buttons because five answers exist. That is the
 * wrong reason to put five buttons on a screen: the answer somebody gives a
 * thousand times a session should be one of three, and the fourth ("watched
 * it, no strong feeling") is a real answer that maybe one person in ten wants
 * to give often enough to pay a permanent seat for it.
 *
 * So the deck had three verdicts and an undo by default, and the fourth was a
 * setting. And because a person who *does* turn it on probably wants it under
 * their thumb rather than in a fifth circle, the upward gesture is remappable:
 * it means "haven't seen it" out of the box and can be pointed at "seen it, no
 * opinion" instead.
 *
 * WHAT IT COSTS, RECORDED SO NOBODY RE-DERIVES IT.
 *
 * Cross-referencing 78 titles this project's one real user answered twice —
 * once in the blind calibration grid, once in the deck — the deck disagrees
 * asymmetrically: 19% of titles he says he watched were recorded as ↑ "haven't
 * seen", against 3.5% the other way. ↑ is the most damaging of the four: it
 * tells the engine he never saw a film he did see, and drops the title out of
 * the library entirely.
 *
 * The answer also feeds the ranking: the co-watch graph is seeded from `seen`
 * as well as `liked`, worth +5.4% on the harvest ruler (paired, 60 people,
 * p < 0.0001). With the button off by default that gain reaches only people
 * who turn it on — for everyone else no `seen` answers exist, the seed list
 * falls back to likes, and the code path is bit-identical to the old one.
 *
 * It was flipped on for exactly one commit and flipped back on the product
 * owner's call: a fifth circle in the row is a real cost, anyone who wants the
 * answer can switch it on, and the collapse in recognition over a long session
 * is a far larger problem than this. Kept here as a measured trade, not as a
 * thing to reopen without new evidence.
 */
export type Settings = {
  /** show the fourth verdict — "watched it, no strong feeling" — in the row */
  showSeenButton: boolean;
  /** what an upward swipe records */
  swipeUp: "not_seen" | "seen";
  /** full-screen colour wash while dragging; off for anyone who finds it loud */
  screenFeedback: boolean;
  /** a short buzz when a verdict lands, where the device supports one */
  haptics: boolean;
  /**
   * HOW DEEP INTO THE CATALOG THE DECK IS ALLOWED TO REACH.
   *
   * A setting rather than a constant because the evidence genuinely does not
   * settle it, and saying so is more honest than picking for everyone.
   *
   * Measured on 40 real watch histories, widening the pool trades one loss for
   * another and comes out behind: titles missed because the deck never
   * considered them fall from 18.4% to 0%, titles considered but never dealt
   * rise from 53.4% to 84.9%, and the count of a person's library recovered
   * halves from 180.7 to 96.8.
   *
   * BUT THOSE HISTORIES CANNOT SEE THE CASE THIS EXISTS FOR. They are
   * MovieLens: American, English, and already inside the famous few thousand,
   * so a wider net can only add noise for them. For a viewer whose titles are
   * Arabic, Turkish or Indian the same widening is the only way they appear at
   * all — The Tonight Show ranks 10,877 by vote count, Key & Peele 14,600, the
   * Egyptian Blue Elephant 23,979, and at "narrow" not one of them can ever be
   * dealt.
   *
   * So the number stays with the person it affects.
   */
  reach: "narrow" | "medium" | "wide";
};

export const DEFAULT_SETTINGS: Settings = {
  showSeenButton: false,
  swipeUp: "not_seen",
  screenFeedback: true,
  haptics: true,
  /* the measured-best default; the other two are there to be tried */
  reach: "narrow",
};

interface DhawqState {
  swipes: Record<string, Swipe>;
  swipeOrder: string[]; // titleIds in swipe order (for undo + recency)
  profile: TasteProfile;
  seed: number;
  lists: UserList[];
  /**
   * Who this person is when they share something.
   *
   * A shared list carries a name and a face, or it carries "shared by
   * somebody" — there is no third option, and the person sharing should be the
   * one who decides which. Kept locally rather than only in the account so the
   * profile page works before anyone signs in, and so a guest can still see
   * what their share page would say.
   */
  publicProfile: { name: string; bio: string; avatarUrl: string };
  onboardingSeen: boolean;
  settings: Settings;

  /** ids of onboarding tiles shown and not tapped, so they can be replayed */
  passed: string[];

  swipe: (title: Title, action: SwipeAction) => void;
  /**
   * Fold "shown and not tapped" evidence into the fingerprint.
   *
   * Not swipes: nothing is added to the library, nothing is retired from the
   * deck, and the user can still be shown any of these titles later. The
   * onboarding grid otherwise hands the engine a handful of likes and no
   * negatives at all, so whatever those few titles happen to share — an era, a
   * language, a genre — is inflated with nothing to push back against it.
   */
  learnPasses: (titles: Title[]) => void;
  undo: () => string | null;
  removeSwipe: (titleId: string) => void;
  resetAll: () => void;
  setOnboardingSeen: () => void;

  setPublicProfile: (p: { name: string; bio: string; avatarUrl: string }) => void;
  setSettings: (patch: Partial<Settings>) => void;
  /**
   * Drop title snapshots the catalog can supply.
   *
   * Called once the catalog is in memory, for libraries saved by a build that
   * stored one with every swipe. It cannot run at load time because the
   * migration hook runs before the catalog exists — there is nothing to check
   * against yet — so it happens the moment there is.
   */
  compactSwipes: () => void;
  createList: (name: string) => string;
  deleteList: (id: string) => void;
  renameList: (id: string, name: string) => void;
  toggleListItem: (listId: string, titleId: string) => void;
  setListPublic: (listId: string, isPublic: boolean) => void;
  setListHideOwner: (listId: string, hide: boolean) => void;
  /**
   * Put many titles into a list at once.
   *
   * The four ways a list gets built — hand-picking, typing names, taking every
   * comedy, and copying somebody else's — are all "here are N ids" underneath.
   * Doing them through `toggleListItem` in a loop would write the store N
   * times, and at 300 comedies that is 300 renders and 300 localStorage
   * writes for one tap.
   */
  addToList: (listId: string, titleIds: string[]) => void;
  removeFromList: (listId: string, titleIds: string[]) => void;
}

/**
 * The catalog first, the stored copy only as a fallback.
 *
 * It used to be the other way round, which is backwards: the catalog entry is
 * complete and current, and the stored copy exists for the one case the
 * catalog cannot cover — a title that was in it when you swiped and is not in
 * it now. Preferring the catalog also means a swipe is reverted with exactly
 * the title it was applied with.
 */
function titleFor(swipe: Swipe): Title | undefined {
  return getLocalTitle(swipe.titleId) ?? swipe.title;
}

/**
 * What gets written down for a swipe.
 *
 * Two fields are 61% of the bytes and neither is worth storing. `related` is
 * the co-watch edge list, derived from the bundled catalog and re-derivable
 * from it at any time. `overview` is a paragraph of prose in two languages,
 * for display only, and the catalog has it.
 *
 * The taste model reads genres, keywords, people, language, year and vote
 * count; all of those stay. Measured across 600 catalog entries:
 *
 *     full title      1,412 bytes    6.7 MB for 5,000 films
 *     this snapshot     490 bytes    2.3 MB for 5,000 films
 *
 * That difference matters because localStorage stops at five to ten megabytes
 * and the stated goal for this product is every film a person has ever
 * watched. The old shape ran out of room somewhere around four thousand.
 */
function snapshot(title: Title): Title {
  return { ...title, overview: { en: "", ar: "" }, related: undefined };
}

export const useDhawq = create<DhawqState>()(
  persist(
    (set, get) => ({
      swipes: {},
      swipeOrder: [],
      profile: emptyProfile(),
      seed: makeSeed(),
      lists: [],
      publicProfile: { name: "", bio: "", avatarUrl: "" },
      onboardingSeen: false,
      settings: DEFAULT_SETTINGS,
      passed: [],

      setSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),

      compactSwipes: () =>
        set((s) => {
          let changed = 0;
          const slim: Record<string, Swipe> = {};
          for (const [id, sw] of Object.entries(s.swipes)) {
            if (sw.title && getLocalItem(id)) {
              const { title: _drop, ...rest } = sw;
              slim[id] = rest;
              changed++;
            } else {
              slim[id] = sw;
            }
          }
          return changed > 0 ? { swipes: slim } : {};
        }),

      learnPasses: (titles) =>
        set((s) => {
          const already = new Set(s.passed);
          const fresh = titles.filter((t) => !already.has(t.id) && !s.swipes[t.id]);
          if (fresh.length === 0) return {};
          let profile = s.profile;
          for (const t of fresh) profile = applySwipe(profile, t, vectorOf(t), "not_seen");
          return { profile, passed: [...s.passed, ...fresh.map((t) => t.id)] };
        }),

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
              /**
               * The snapshot is only kept for a title the catalog does not
               * have.
               *
               * Every swipe used to carry a ~490-byte copy of its own title,
               * and the whole store is re-serialised to localStorage on every
               * write. At 900 titles that is half a megabyte of `JSON.stringify`
               * plus a synchronous `setItem` — profiled at 472ms of frozen main
               * thread across ten swipes on a phone-speed CPU, and it gets
               * worse with every film added. The stated goal for this product
               * is a library of *thousands*, so a per-swipe cost that grows
               * with the library is the one cost that cannot be allowed to
               * stand.
               *
               * The copy was insurance against the catalog changing under a
               * stored library, and every reader already spells it
               * `getLocalTitle(id) ?? sw.title`. So it is kept exactly where it
               * is still insurance — a title the bundled catalog cannot name —
               * and dropped for the 99% of swipes where it is a duplicate of
               * data already on disk in catalog.json.
               */
              [title.id]: {
                titleId: title.id,
                action,
                at: Date.now(),
                title: getLocalItem(title.id) ? undefined : snapshot(title),
              },
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
        set({
          swipes: {},
          swipeOrder: [],
          passed: [],
          profile: emptyProfile(),
          seed: makeSeed(),
        }),

      setOnboardingSeen: () => set({ onboardingSeen: true }),

      setPublicProfile: (p) => set({ publicProfile: p }),

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

      setListHideOwner: (listId, hide) =>
        set((s) => ({
          lists: s.lists.map((l) => (l.id === listId ? { ...l, hideOwner: hide } : l)),
        })),

      addToList: (listId, titleIds) =>
        set((s) => ({
          lists: s.lists.map((l) =>
            l.id === listId
              ? { ...l, titleIds: [...new Set([...l.titleIds, ...titleIds])] }
              : l
          ),
        })),

      removeFromList: (listId, titleIds) => {
        const drop = new Set(titleIds);
        set((s) => ({
          lists: s.lists.map((l) =>
            l.id === listId
              ? { ...l, titleIds: l.titleIds.filter((id) => !drop.has(id)) }
              : l
          ),
        }));
      },

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
      version: 5,
      storage: deferredStorage,
      /**
       * v4 replaced the hashed taste vector with named facet counters. v5
       * slims the per-swipe title snapshot (see `snapshot`), which is applied
       * to a library already on disk so a long-standing session gets the space
       * back without re-swiping anything.
       *
       * No library is ever dropped on an upgrade: every swipe carries a
       * snapshot of the title it was made on, so the whole history is simply
       * replayed through the new model. A user who swiped for an hour keeps
       * every bit of that hour — and gets it back interpreted by an engine
       * that needs far fewer examples to act on it.
       */
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Partial<DhawqState> | undefined;
        if (!state) return persisted as DhawqState;
        const order = state.swipeOrder ?? [];
        const swipes = state.swipes ?? {};

        // v4 -> v5 is a shape change only; the model does not need replaying
        if (version >= 4) {
          const slim: Record<string, Swipe> = {};
          for (const [id, sw] of Object.entries(swipes)) {
            slim[id] = sw.title ? { ...sw, title: snapshot(sw.title) } : sw;
          }
          return { ...state, swipes: slim } as DhawqState;
        }

        let profile = emptyProfile();
        for (const id of order) {
          const sw = swipes[id];
          const title = sw?.title ?? getLocalTitle(id);
          if (sw && title) profile = applySwipe(profile, title, vectorOf(title), sw.action);
        }
        // onboarding passes are evidence too, and are replayed the same way
        for (const id of state.passed ?? []) {
          const title = getLocalTitle(id);
          if (title) profile = applySwipe(profile, title, vectorOf(title), "not_seen");
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
          passed: state.passed ?? [],
          /* a settings object written by an older build is missing whatever
             was added since; defaults fill the gaps rather than the screen
             rendering an undefined toggle */
          settings: { ...DEFAULT_SETTINGS, ...(state.settings ?? {}) },
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
