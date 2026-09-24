"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "./client";
import {
  loadCloudLibrary,
  loadCloudPublicProfile,
  mergeLibraries,
  pushProfile,
  syncListIds,
  syncLocalToCloud,
  syncSwipeIds,
  type CloudLibrary,
} from "./sync";
import { loadCatalog } from "@/lib/catalog";
import { useDhawq } from "@/lib/store";

export type SyncState = "idle" | "working" | "ok" | (string & {});

export type AccountState = {
  session: Session | null;
  ready: boolean;
  enabled: boolean;
  busy: boolean;
  error: string | null;
  notice: string | null;
  sync: SyncState;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AccountContext = createContext<AccountState | null>(null);

function currentLibrary(): CloudLibrary {
  const s = useDhawq.getState();
  return { swipes: s.swipes, swipeOrder: s.swipeOrder, lists: s.lists };
}

function hasLocalLibrary(lib: CloudLibrary): boolean {
  return lib.swipeOrder.length > 0 || lib.lists.length > 0;
}

/**
 * Exactly one account controller exists for the app.
 *
 * Before this provider, ProfilePanel and its nested AccountPanel each called
 * useAccount(), so one screen installed two auth listeners and could run the
 * same sign-in reconciliation twice. The public hook below now only consumes
 * this shared controller.
 */
function useAccountController(): AccountState {
  const enabled = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>("idle");
  const [reconciledUser, setReconciledUser] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let alive = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setReconciledUser(null);
        setSync("idle");
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;

  /**
   * Reconcile by the timestamp of each title, never by aggregate counts.
   *
   * accountOwner is the contamination barrier. Guest data may be adopted by
   * the first account that signs in. Data explicitly owned by a different
   * account is never merged or uploaded into the new account.
   */
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setReconciledUser(null);
    setSync("working");

    void (async () => {
      try {
        await loadCatalog().catch(() => undefined);
        const before = useDhawq.getState();
        const priorOwner = before.accountOwner;
        const local = currentLibrary();

        const [cloud, cloudProfile] = await Promise.all([
          loadCloudLibrary(userId),
          loadCloudPublicProfile(userId),
        ]);
        if (!alive) return;

        const switchingAccounts = Boolean(priorOwner && priorOwner !== userId);
        const merged = switchingAccounts
          ? cloud ?? { swipes: {}, swipeOrder: [], lists: [] }
          : mergeLibraries(local, cloud);

        const googleName =
          (session?.user.user_metadata?.full_name as string | undefined) ?? "";
        const googleAvatar =
          (session?.user.user_metadata?.avatar_url as string | undefined) ?? "";

        useDhawq.setState({
          swipes: merged.swipes,
          swipeOrder: merged.swipeOrder,
          lists: merged.lists,
          // Weak onboarding passes belong to the device/session that saw them,
          // not to a different authenticated account.
          passed: switchingAccounts ? [] : before.passed,
          accountOwner: userId,
          onboardingSeen: merged.swipeOrder.length > 0 || before.onboardingSeen,
          publicProfile: {
            name: cloudProfile?.name || googleName,
            bio: cloudProfile?.bio ?? "",
            avatarUrl: cloudProfile?.avatarUrl || googleAvatar,
          },
        });
        useDhawq.getState().rebuildProfile();

        // A guest library or local corrections become cloud truth once merged.
        // On an account switch there is deliberately nothing from the previous
        // owner to upload.
        if (!switchingAccounts && (hasLocalLibrary(local) || cloud)) {
          await syncLocalToCloud(userId);
        }

        if (!alive) return;
        setSync("ok");
        setReconciledUser(userId);
      } catch (e) {
        if (!alive) return;
        setSync(e instanceof Error ? e.message : "sync failed");
      }
    })();

    return () => {
      alive = false;
    };
  }, [userId]);

  /**
   * Continuous sync of actual source rows.
   *
   * A burst is debounced into one network flush, but only changed swipe/list
   * ids are sent. The taste profile follows the same flush so its counters
   * cannot outrun the library rows they describe.
   */
  useEffect(() => {
    if (!userId || reconciledUser !== userId) return;
    const pendingSwipes = new Set<string>();
    const pendingLists = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const flush = async () => {
      timer = null;
      if (stopped) return;
      const swipeIds = [...pendingSwipes];
      const listIds = [...pendingLists];
      pendingSwipes.clear();
      pendingLists.clear();
      setSync("working");
      try {
        await syncSwipeIds(userId, swipeIds);
        await syncListIds(userId, listIds);
        await pushProfile(userId);
        if (!stopped) setSync("ok");
      } catch (e) {
        if (!stopped) setSync(e instanceof Error ? e.message : "sync failed");
      }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), 1200);
    };

    const unsub = useDhawq.subscribe((state, prev) => {
      if (state.swipes !== prev.swipes) {
        const ids = new Set([...Object.keys(state.swipes), ...Object.keys(prev.swipes)]);
        for (const id of ids) {
          if (state.swipes[id] !== prev.swipes[id]) pendingSwipes.add(id);
        }
      }

      if (state.lists !== prev.lists) {
        const before = new Map(prev.lists.map((l) => [l.id, l]));
        const after = new Map(state.lists.map((l) => [l.id, l]));
        for (const id of new Set([...before.keys(), ...after.keys()])) {
          if (before.get(id) !== after.get(id)) pendingLists.add(id);
        }
      }

      if (pendingSwipes.size || pendingLists.size || state.profile !== prev.profile) {
        schedule();
      }
    });

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [userId, reconciledUser]);

  const signInWithGoogle = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}${window.location.pathname}${window.location.search}`
            : undefined,
      },
    });
    if (authError) setError(authError.message);
    setBusy(false);
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      // Do not abandon the tail of a debounced sync and then let another
      // account replace the browser copy. A deliberate sign-out first flushes
      // the current account's complete local truth.
      if (userId && reconciledUser === userId) {
        await syncLocalToCloud(userId);
      }
      const { error: authError } = await supabase.auth.signOut();
      if (authError) throw authError;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not finish syncing before sign-out.");
    } finally {
      setBusy(false);
    }
  }, [userId, reconciledUser]);

  return {
    session,
    ready,
    enabled,
    sync,
    busy,
    error,
    notice,
    signInWithGoogle,
    signOut,
  };
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const value = useAccountController();
  return createElement(AccountContext.Provider, { value }, children);
}

export function useAccount(): AccountState {
  const value = useContext(AccountContext);
  if (!value) {
    throw new Error("useAccount must be used inside AccountProvider");
  }
  return value;
}
