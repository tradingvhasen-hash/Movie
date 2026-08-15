"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GlowButton } from "./ui";
import { useAccount } from "@/lib/supabase/useAccount";
import { useDhawq } from "@/lib/store";
import { FADE_UP, SPRING_SNAPPY } from "@/lib/motion";

/**
 * Sign in, so a taste outlives a browser.
 *
 * Deliberately small and deliberately optional. Everything in this app works
 * signed out and always will — the local store is the source of truth on the
 * device and this only adds a copy that survives clearing the browser or
 * moving to a phone. On the static demo build there is no cloud configured and
 * this renders nothing at all rather than a button that cannot work.
 *
 * Email and password rather than a magic link: a link needs deliverable mail
 * on a free tier where the built-in sender is rate limited to a handful an
 * hour, and the first thing a new account does here is fail to arrive.
 */
export default function AccountPanel() {
  const { session, ready, enabled, busy, error, notice, signUp, signIn, signOut } =
    useAccount();
  const totalSwipes = useDhawq((s) => s.profile.totalSwipes);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (!enabled || !ready) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "in") await signIn(email.trim(), password);
    else await signUp(email.trim(), password);
  };

  if (session) {
    return (
      <motion.div
        variants={FADE_UP}
        className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/60 px-4 py-3"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{session.user.email}</p>
          <p className="mt-0.5 text-xs text-ink-dim">
            {totalSwipes > 0
              ? `${totalSwipes} swipes saved to your account`
              : "Saved to your account"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={busy}
          className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-dim transition-colors hover:text-ink disabled:opacity-50"
        >
          Sign out
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div variants={FADE_UP} className="mt-5">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface/60 px-4 py-3 text-left transition-colors hover:border-accent/40"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Keep your library</span>
            <span className="mt-0.5 block text-xs text-ink-dim">
              Sign in so your taste survives this browser
            </span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-accent">Sign in</span>
        </button>
      ) : (
        <motion.form
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING_SNAPPY}
          onSubmit={submit}
          className="rounded-2xl border border-line bg-surface/60 p-4"
        >
          <div className="flex items-center gap-4 text-sm font-semibold">
            {(["in", "up"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={
                  mode === m ? "text-accent" : "text-ink-faint hover:text-ink-dim"
                }
              >
                {m === "in" ? "Sign in" : "Create account"}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto text-xs font-medium text-ink-faint hover:text-ink-dim"
            >
              Close
            </button>
          </div>

          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-4 w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent"
          />
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="mt-2 w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent"
          />

          <div className="mt-4">
            <GlowButton type="submit" disabled={busy}>
              {busy ? "…" : mode === "in" ? "Sign in" : "Create account"}
            </GlowButton>
          </div>

          <AnimatePresence>
            {(error || notice) && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className={`mt-3 text-xs ${error ? "text-rose-400" : "text-ink-dim"}`}
              >
                {error ?? notice}
              </motion.p>
            )}
          </AnimatePresence>

          {totalSwipes > 0 && (
            <p className="mt-3 text-xs text-ink-faint">
              Your {totalSwipes} swipes on this device will be kept and uploaded.
            </p>
          )}
        </motion.form>
      )}
    </motion.div>
  );
}
