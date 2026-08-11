import Link from "next/link";
import { PopcornIcon } from "@/components/ui/Icons";

export default function NotFound() {
  return (
    <div className="rise-in flex flex-col items-center px-5 pt-24 text-center">
      <PopcornIcon size={44} strokeWidth={1.6} className="text-ink-faint" />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Page not found</h1>
      <p className="mt-2 text-sm text-ink-dim">
        This page doesn&apos;t exist — let&apos;s get you back to swiping.
      </p>
      <Link href="/" className="glow-btn mt-6 inline-block">
        <span>Back to swiping</span>
      </Link>
    </div>
  );
}
