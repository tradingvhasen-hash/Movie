"use client";

import { motion } from "framer-motion";
import { BASE, EASE_OUT } from "@/lib/motion";

/**
 * WHY THE PAGE NO LONGER BLINKS WHEN YOU CHANGE TABS.
 *
 * This faded every page in from `opacity: 0` over 400ms. On a tab bar — where
 * the destination is one tap away and the person is already looking at where
 * it will appear — that reads as the described glitch: the screen goes blank,
 * then comes back. A transition is supposed to explain a relationship between
 * two states, and "everything vanished for a fifth of a second" explains
 * nothing.
 *
 * Native tab bars do not cross-fade between tabs at all; they swap instantly
 * and let the *content* settle. So this now starts at 0.6 rather than 0 — the
 * page is legible the entire time — travels 6px instead of 12, and takes the
 * BASE duration rather than nearly twice it. The eye reads it as the page
 * arriving, which it is, instead of as the page having been away.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0.6, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: BASE, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
