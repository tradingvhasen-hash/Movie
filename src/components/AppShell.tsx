"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import AuthButton from "./AuthButton";
import { useLocaleSwitch } from "./LocaleProvider";
import { Burger, NeuButton } from "./ui";
import {
  BooksIcon,
  CardsIcon,
  ClapperIcon,
  FilmIcon,
  GlobeIcon,
  SparklesIcon,
} from "./ui/Icons";

const TABS = [
  { href: "/", key: "swipe", Icon: CardsIcon },
  { href: "/discover", key: "discover", Icon: SparklesIcon },
  { href: "/library", key: "library", Icon: BooksIcon },
  { href: "/lists", key: "lists", Icon: FilmIcon },
] as const;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const { locale, setLocale } = useLocaleSwitch();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const isSharePage = pathname.startsWith("/l/") || pathname.startsWith("/u/");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-bg/85 px-5 py-4 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2.5">
          <ClapperIcon size={24} className="text-accent" />
          <span className="bg-gradient-to-l from-accent to-accent-deep bg-clip-text text-xl font-extrabold text-transparent">
            {t("app.name")}
          </span>
        </Link>
        {/* burger ↔ X — Uiverse.io by Cevorob */}
        <Burger open={menuOpen} onToggle={setMenuOpen} label="menu" />
      </header>

      {/* settings panel */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          >
            <motion.div
              initial={{ y: -16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -16, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              className="neu-card mx-auto mt-20 flex w-[calc(100%-2.5rem)] max-w-sm flex-col gap-3 p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <NeuButton
                onClick={() => {
                  setLocale(locale === "ar" ? "en" : "ar");
                  setMenuOpen(false);
                }}
                className="flex w-full items-center justify-center gap-2"
              >
                <GlobeIcon size={18} />
                {t("app.language")}
              </NeuButton>
              <AuthButton />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 pb-24">{children}</main>

      {!isSharePage && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 backdrop-blur-lg">
          <div className="mx-auto flex max-w-5xl items-stretch justify-around">
            {TABS.map(({ href, key, Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition ${
                    active ? "text-accent" : "text-ink-faint hover:text-ink-dim"
                  }`}
                >
                  <Icon size={21} strokeWidth={active ? 2.4 : 2} />
                  {t(`nav.${key}`)}
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
