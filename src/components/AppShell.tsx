"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { BooksIcon, CardsIcon, SparklesIcon, UserIcon, UsersIcon } from "./ui/Icons";

/**
 * FIVE DESTINATIONS, AND WHY EACH ONE IS HERE.
 *
 * The bar had four: Swipe, Search, Discover, Library. Two changes, both from
 * the same principle — a tab is for a *place you go*, not for a thing you do.
 *
 * SEARCH IS GONE. Typing a name is not a destination; it is one of the ways
 * you add to your library, and it now lives inside the library as a single
 * field that looks in what you have watched first and in the whole catalog
 * second. A tab called "Search" was the product asking a question the person
 * had already answered by opening the app.
 *
 * PROFILE IS PROMOTED. It was reachable only from a small circle in the
 * library's header, which is a place nobody looks for their account — and the
 * user said so in exactly those terms. An account, a name and the settings are
 * a destination.
 *
 * TOGETHER IS NEW. "Two of us, what do we watch" is a different question from
 * "what should I watch", answered from different evidence, and it is the one
 * screen in this product a person opens *with somebody else in the room*.
 *
 * `/seen` — the thirty-at-once grid — remains gone, page and component. It
 * asked thirty questions per screen against the deck's one per gesture, which
 * on paper is twice the throughput; in practice the user opened it, looked at
 * it, and tapped nothing across 219 posters. A faster chore is still a chore.
 */
const TABS = [
  { href: "/", label: "Swipe", Icon: CardsIcon },
  { href: "/discover", label: "Discover", Icon: SparklesIcon },
  { href: "/together", label: "Together", Icon: UsersIcon },
  { href: "/library", label: "Library", Icon: BooksIcon },
  { href: "/profile", label: "You", Icon: UserIcon },
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
                  className={`relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] font-semibold ${
                    active ? "text-accent" : "text-ink-faint hover:text-ink-dim"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="tab-indicator"
                      className="absolute top-0 h-0.5 w-9 rounded-full bg-accent"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <motion.span
                    animate={{ scale: active ? 1.12 : 1, y: active ? -1 : 0 }}
                    whileTap={{ scale: 0.85 }}
                    transition={{ type: "spring", stiffness: 420, damping: 24 }}
                  >
                    <Icon size={20} strokeWidth={active ? 2.4 : 2} />
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
