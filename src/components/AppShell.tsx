"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import AuthButton from "./AuthButton";

const TABS = [
  { href: "/", key: "swipe", icon: "🃏" },
  { href: "/discover", key: "discover", icon: "✨" },
  { href: "/library", key: "library", icon: "📚" },
  { href: "/lists", key: "lists", icon: "🎞️" },
] as const;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const isSharePage = pathname.startsWith("/l/") || pathname.startsWith("/u/");

  function toggleLocale() {
    const next = locale === "ar" ? "en" : "ar";
    document.cookie = `locale=${next};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col">
      <header className="sticky top-0 z-40 flex items-center justify-between px-5 py-4 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl">🎬</span>
          <span className="bg-gradient-to-l from-brand to-amber-200 bg-clip-text text-xl font-extrabold text-transparent">
            {t("app.name")}
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <AuthButton />
          <button
            onClick={toggleLocale}
            className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-ink-dim transition hover:text-ink"
          >
            {t("app.language")}
          </button>
        </div>
      </header>

      <main className="flex-1 pb-24">{children}</main>

      {!isSharePage && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/85 backdrop-blur-lg">
          <div className="mx-auto flex max-w-5xl items-stretch justify-around">
            {TABS.map((tab) => {
              const active =
                tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition ${
                    active ? "text-brand" : "text-ink-faint hover:text-ink-dim"
                  }`}
                >
                  <span className="text-xl">{tab.icon}</span>
                  {t(`nav.${tab.key}`)}
                </Link>
              );
            })}
          </div>
          <div className="h-[env(safe-area-inset-bottom)]" />
        </nav>
      )}
    </div>
  );
}
