"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { syncLocalToCloud } from "@/lib/supabase/sync";
import type { User } from "@supabase/supabase-js";

export default function AuthButton() {
  const t = useTranslations();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "SIGNED_IN" && session?.user) {
        void syncLocalToCloud(session.user.id);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured()) return null;

  if (user) {
    return (
      <button
        onClick={() => getSupabase()?.auth.signOut()}
        className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-ink-dim transition hover:text-ink"
      >
        {t("auth.signOut")}
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-brand px-3.5 py-1.5 text-sm font-bold text-black"
      >
        {t("auth.signIn")}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm rounded-3xl border border-line bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold">{t("auth.signIn")}</h3>
            <p className="mt-1 text-xs text-ink-dim">{t("auth.syncNote")}</p>
            {sent ? (
              <p className="mt-4 rounded-xl bg-like/10 px-4 py-3 text-sm text-like">
                ✉️ ✓
              </p>
            ) : (
              <form
                className="mt-4 flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const supabase = getSupabase();
                  if (!supabase || !email.trim()) return;
                  await supabase.auth.signInWithOtp({
                    email: email.trim(),
                    options: { emailRedirectTo: window.location.origin },
                  });
                  setSent(true);
                }}
              >
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="flex-1 rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm outline-none focus:border-brand/60"
                  dir="ltr"
                />
                <button className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-black">
                  →
                </button>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </>
  );
}
