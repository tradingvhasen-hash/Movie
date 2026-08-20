"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { BooksIcon, CardsIcon, SearchIcon, SparklesIcon } from "./ui/Icons";

/* labels inline so the shell renders in any context, including the 404 page */
const TABS = [
  { href: "/", label: "Swipe", Icon: CardsIcon },
  /**
   * `/seen` — the thirty-at-once grid — is gone entirely, page and component.
   *
   * It was built on a real piece of arithmetic: a grid asks thirty questions
   * per screen against the deck's one per gesture, and on paper that is 3,656
   * titles an hour against 1,667. The arithmetic was right and the product
   * judgement was wrong. The user opened it, looked at it, and closed it —
   * "every site has this page, it is boring, I got bored just looking at it".
   * Across 219 posters he tapped nothing.
   *
   * That is the whole differentiator being handed away. The deck is not slower
   * by accident; it is a game, and people finish games. A page is a chore, and
   * a faster chore is still a chore nobody does. The route still exists for
   * anyone who wants it — it is simply no longer offered.
   */
  /**
   * The escape hatch, promoted to the nav.
   *
   * A person knows the name of the film they watched; the engine has to guess
   * it out of 12,826. Typing it is the cheapest interaction in the product and
   * it was not reachable from anywhere.
   */
  { href: "/search", label: "Search", Icon: SearchIcon },
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
