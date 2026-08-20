"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "./client";
import { loadCloudProfile, syncLocalToCloud, pushProfile } from "./sync";
import { useDhawq } from "@/lib/store";

/**
 * Account state, and the one rule that governs it: **a swipe is never lost.**
 *
 * Everything works signed out. Local storage is the source of truth on the
 * device, the cloud is a copy, and the copy is only allowed to replace the
 * local taste when it is demonstrably richer (see `loadCloudProfile`). Sign-in
 * on a fresh device restores a history; sign-in on a device that has been
 * swiping offline keeps what is in front of the user and pushes it up.
 *
 * Nothing here throws into the UI. If the cloud is unreachable the app keeps
 * working exactly as it does today, which is the behaviour that has shipped
 * since the beginning.
 */

export type AccountState = {
  /** null while starting up, then the session or null for signed out */
  session: Session | null;
  ready: boolean;
  /** cloud configured at build time? false on the static demo */
  enabled: boolean;
  busy: boolean;
  error: string | null;
  notice: string | null;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

export function useAccount(): AccountState {
  const enabled = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /* ── follow the session ── */
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /* ── on sign-in: reconcile the two histories, once ── */
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      try {
        const cloud = await loadCloudProfile(userId);
        if (!alive) return;
        if (cloud) {
          // the cloud holds the longer history — adopt it
          useDhawq.setState({ profile: cloud });
        } else {
          // nothing there, or thinner than what is here — push ours up
          await syncLocalToCloud(userId);
        }
      } catch {
        /* offline is not an error the user needs to see */
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  /* ── keep the cloud current, without blocking a swipe ──
     Subscribing to totalSwipes rather than the profile object means one write
     per swipe at most, and the write is fire-and-forget. */
  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useDhawq.subscribe((state, prev) => {
      if (state.profile.totalSwipes === prev.profile.totalSwipes) return;
      if (timer) clearTimeout(timer);
      // a burst of swipes becomes one write
      timer = setTimeout(() => void pushProfile(userId).catch(() => {}), 4000);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [userId]);

  const run = useCallback(
    async (fn: () => Promise<{ error: { message: string } | null }>, ok?: string) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      const { error: err } = await fn();
      setBusy(false);
      if (err) setError(err.message);
      else if (ok) setNotice(ok);
    },
    []
  );

  /**
   * GOOGLE, AND ONLY GOOGLE.
   *
   * Email and password are gone by the user's decision, and his reasoning is
   * sound enough to record: an address with a password behind it is a free
   * account for anybody with an imagination, and every fake one costs storage
   * and pollutes any number derived from "how many people use this". The
   * alternative — a verification code by email — he has already tried, and the
   * free tier of that service runs out of codes long before it runs out of
   * users.
   *
   * A Google account is a real person's existing identity, which is the whole
   * point: nothing to verify, nothing to remember, no password to leak, and no
   * recovery flow to build. It also arrives carrying a name and an avatar,
   * which the profile page needs and would otherwise have to ask for.
   *
   * REQUIRES ONE MANUAL STEP that cannot be done from code: Google has to be
   * enabled in Supabase → Authentication → Providers, with a client id and
   * secret from the Google Cloud console. Until that is done this call returns
   * a plain error rather than failing silently, which is why `error` is shown
   * on the profile page.
   */
  const signInWithGoogle = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    await run(() =>
      supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          // come back to where they were, not to the home page: someone who
          // signed in from a shared list must land back on that list
          redirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}${window.location.pathname}${window.location.search}`
              : undefined,
        },
      })
    );
  }, [run]);

  const signUp = useCallback(
    async (email: string, password: string) => {
      const supabase = getSupabase();
      if (!supabase) return;
      await run(
        () => supabase.auth.signUp({ email, password }),
        // Supabase may or may not require confirmation depending on project
        // settings; saying so plainly beats a silent nothing-happened.
        "Check your inbox if a confirmation is required — otherwise you are in."
      );
    },
    [run]
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const supabase = getSupabase();
      if (!supabase) return;
      await run(() => supabase.auth.signInWithPassword({ email, password }));
    },
    [run]
  );

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signOut();
    setBusy(false);
    // deliberately NOT clearing local storage: signing out is not "forget me",
    // and someone who signs out on a shared device still owns their swipes on
    // their own device.
  }, []);

  return {
    session,
    ready,
    enabled,
    busy,
    error,
    notice,
    signInWithGoogle,
    signUp,
    signIn,
    signOut,
  };
}
