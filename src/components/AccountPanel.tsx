"use client";

/**
 * SIGNING IN, ON THE ONE PAGE THAT IS ABOUT YOU.
 *
 * This used to sit at the top of the library, and it caused the flicker the
 * user reported there: it returned `null` until Supabase answered, then
 * rendered a whole panel, which shoved the filters and the search box down the
 * page a fifth of a second after they had already been drawn. He described it
 * as the search bar appearing, disappearing and appearing again — it never
 * disappeared, it moved.
 *
 * Two fixes, and only the second one is about the flicker. It moved to the
 * profile page, because a sign-in form is not what somebody came to the
 * library to look at. And nothing here reserves-then-fills any more: the page
 * that hosts it has no content below it to shove.
 *
 * ONLY GOOGLE. See `signInWithGoogle` for the reasoning; the short version is
 * that an email and a password is a free account for anybody with an
 * imagination, and the verification-code alternative runs out of free codes
 * before it runs out of users.
 */
import { motion } from "framer-motion";
import { useAccount } from "@/lib/supabase/useAccount";
import { FADE_UP } from "@/lib/motion";
import { GoogleIcon, LoginIcon } from "./ui/Icons";

export default function AccountPanel() {
  const { session, ready, enabled, busy, error, sync, signInWithGoogle, signOut } =
    useAccount();

  if (!enabled) {
    return (
      <motion.p variants={FADE_UP} className="text-sm text-ink-faint">
        Accounts are not configured for this deployment.
      </motion.p>
    );
  }

  /* a fixed-height placeholder, so nothing below ever moves when the answer
     arrives — the whole cause of the flicker this component used to create */
  if (!ready) {
    return <div className="h-[52px]" aria-hidden />;
  }

  if (session) {
    const name =
      (session.user.user_metadata?.full_name as string | undefined) ??
      session.user.email ??
      "Signed in";
    /**
     * ONE LINE THAT SAYS WHETHER THE BACKUP IS REAL.
     *
     * Signing in makes a promise — your history follows you to another device —
     * and until today nothing on this screen could tell you whether that
     * promise was being kept. Every sync call was wrapped in a bare `catch {}`,
     * which is correct for a dropped connection and dangerously wrong for a
     * permission that was never granted: you would sign in, see a clean screen,
     * swipe for a week, open the app elsewhere and find it empty.
     *
     * Silent while it works — a green tick is noise on a screen where success
     * is the expected state. Loud, and quoting the database verbatim, when it
     * does not.
     */
    const failing = sync !== "idle" && sync !== "ok" && sync !== "working";
    return (
      <motion.div variants={FADE_UP} className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate font-semibold">{name}</p>
            <p className="truncate text-xs text-ink-faint">{session.user.email}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="shrink-0 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink-dim transition-colors hover:text-ink disabled:opacity-40"
          >
            Sign out
          </button>
        </div>
        {failing && (
          <div className="rounded-2xl border border-danger/30 bg-danger/[0.06] px-4 py-3">
            <p className="text-[13px] font-semibold text-danger">
              Your history is not reaching the cloud
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-dim">
              Everything is safe on this device and nothing has been lost, but it
              will not appear on another one. The database said: {String(sync)}
            </p>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div variants={FADE_UP} className="flex flex-col gap-3">
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={busy}
        className="flex w-full items-center justify-center gap-3 rounded-2xl border border-line bg-surface px-5 py-3.5 font-semibold text-ink shadow-[0_2px_10px_rgb(var(--rgb-shadow)/0.06)] transition-all hover:shadow-[0_6px_18px_rgb(var(--rgb-shadow)/0.1)] active:scale-[0.98] disabled:opacity-50"
      >
        <GoogleIcon size={19} />
        Continue with Google
      </button>
      {error && (
        /* one of the two kinds of text that survived the sweep: this one says
           why something failed, and without it a tap that does nothing is a
           mystery rather than a problem */
        <p className="text-sm text-danger">{error}</p>
      )}
      <p className="flex items-center gap-2 text-xs text-ink-faint">
        <LoginIcon size={14} />
        Without an account everything stays on this device.
      </p>
    </motion.div>
  );
}
