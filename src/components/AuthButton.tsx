"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { syncLocalToCloud } from "@/lib/supabase/sync";
import { FloatInput, GlowButton, NeuButton } from "./ui";
import { LoginIcon } from "./ui/Icons";
import type { User } from "@supabase/supabase-js";

/** Sign-in block rendered inside the burger settings panel. */
export default function AuthButton() {
  const t = useTranslations();
  const [user, setUser] = useState<User | null>(null);
  const [formOpen, setFormOpen] = useState(false);
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

  if (!isSupabaseConfigured()) {
    return <p className="text-center text-xs text-ink-faint">{t("auth.notConfigured")}</p>;
  }

  if (user) {
    return (
      <NeuButton
        onClick={() => getSupabase()?.auth.signOut()}
        className="flex w-full items-center justify-center gap-2"
      >
        <LoginIcon size={18} />
        {t("auth.signOut")}
      </NeuButton>
    );
  }

  if (!formOpen) {
    return (
      <GlowButton onClick={() => setFormOpen(true)} className="w-full">
        <LoginIcon size={18} />
        {t("auth.signIn")}
      </GlowButton>
    );
  }

  if (sent) {
    return <p className="text-center text-sm text-accent">{t("auth.sent")}</p>;
  }

  return (
    <form
      className="flex flex-col gap-3"
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
      <p className="text-xs text-ink-dim">{t("auth.syncNote")}</p>
      {/* floating-label input — Uiverse.io by alexruix */}
      <FloatInput
        type="email"
        label={t("auth.email")}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        dir="ltr"
      />
      <GlowButton type="submit" className="w-full">
        {t("auth.signIn")}
      </GlowButton>
    </form>
  );
}
