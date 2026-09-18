"use client";

import ErrorPanel from "@/components/ErrorPanel";

/**
 * The page-level boundary. The layout, the shell and the navigation keep
 * rendering above this, so the panel appears over a site that still visibly
 * exists — see the header of `ErrorPanel` for why that matters.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPanel error={error} reset={reset} />;
}
