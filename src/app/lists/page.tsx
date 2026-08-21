"use client";

import { motion } from "framer-motion";
import ListsView from "@/components/ListsView";
import { FADE_UP, staggerContainer } from "@/lib/motion";

/**
 * Lists have a home inside the library now — they are a view of it, and a
 * fifth nav entry for a view of a page would have made every other tab a
 * smaller target. This route stays because links to it exist in the wild
 * (share pages, anything already sent to somebody) and a dead link is a worse
 * outcome than a second door.
 */
export default function ListsPage() {
  return (
    <motion.div
      variants={staggerContainer(0.05)}
      initial="hidden"
      animate="show"
      className="px-5 pb-28 pt-6"
    >
      <motion.h1 variants={FADE_UP} className="text-[26px] font-bold tracking-[-0.03em]">
        Lists
      </motion.h1>
      <div className="mt-5">
        <ListsView />
      </div>
    </motion.div>
  );
}
