import { notFound } from "next/navigation";
import LabScreen from "./LabScreen";

/**
 * THE TEST PAGE, WHICH IS NOT SHIPPED TO THE PUBLIC ANY MORE.
 *
 * `/lab` is a development instrument. It counts a session in blocks, imports
 * and exports raw state, and carries a button that erases a person's entire
 * library. It has been reachable by anyone on the internet who typed the
 * address, on the reasoning that nothing links to it.
 *
 * An unlinked URL is not a protection, it is an assumption — and the specific
 * thing being assumed here is that nobody will ever type six letters. What
 * actually needs to be true is that a destructive development tool is not
 * published, which is a deployment question rather than a routing one.
 *
 * So it 404s in production and runs everywhere else: `npm run dev`, a preview
 * deploy, or any deploy that sets `ENABLE_LAB=1` deliberately. The guard is
 * read at build time, so the component is not merely hidden — nothing that
 * reaches a production bundle can render it.
 *
 * The genuinely useful halves of this page — the block counter and the
 * library export — do not stay locked in here. Export moves to Settings as a
 * real feature, because a person has a right to their own data and finding it
 * should not require knowing a secret address.
 */
const LAB_ENABLED =
  process.env.NODE_ENV !== "production" || process.env.ENABLE_LAB === "1";

export const metadata = { title: "Lab" };

export default function LabPage() {
  if (!LAB_ENABLED) notFound();
  return <LabScreen />;
}
