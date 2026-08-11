"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { BooksIcon, CardsIcon, SparklesIcon } from "./ui/Icons";

const TABS = [
  { href: "/", key: "swipe", Icon: CardsIcon },
  { href: "/discover", key: "discover", Icon: SparklesIcon },
  { href: "/library", key: "library", Icon: BooksIcon },
] as const;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();

  const isSharePage = pathname.startsWith("/l/") || pathname.startsWith("/u/");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col">
      <main className="flex-1">{children}</main>

      {!isSharePage && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur-lg">
          <div className="mx-auto flex max-w-5xl items-stretch justify-around">
            {TABS.map(({ href, key, Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors duration-300 ${
                    active ? "text-accent" : "text-ink-faint hover:text-ink-dim"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="tab-indicator"
                      className="absolute top-0 h-0.5 w-10 rounded-full bg-accent"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
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
