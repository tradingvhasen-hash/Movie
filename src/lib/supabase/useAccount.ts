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

  return { session, ready, enabled, busy, error, notice, signUp, signIn, signOut };
}
