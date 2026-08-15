"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { BooksIcon, GridIcon, CardsIcon, SparklesIcon } from "./ui/Icons";

/* labels inline so the shell renders in any context, including the 404 page */
const TABS = [
  { href: "/", label: "Swipe", Icon: CardsIcon },
  // the fast lane: thirty questions a screen instead of one a gesture
  { href: "/seen", label: "Seen it?", Icon: GridIcon },
  { href: "/discover", label: "Discover", Icon: SparklesIcon },
  { href: "/library", label: "Library", Icon: BooksIcon },
] as const;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isSharePage = pathname.startsWith("/l/") || pathname.startsWith("/u/");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col">
      <main className="flex-1">{children}</main>

      {!isSharePage && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur-lg">
          <div className="mx-auto flex max-w-5xl items-stretch justify-around">
            {TABS.map(({ href, label, Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${
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
                  <motion.span
                    animate={{ scale: active ? 1.12 : 1, y: active ? -1 : 0 }}
                    whileTap={{ scale: 0.85 }}
                    transition={{ type: "spring", stiffness: 420, damping: 24 }}
                  >
                    <Icon size={21} strokeWidth={active ? 2.4 : 2} />
                  </motion.span>
                  {label}
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
