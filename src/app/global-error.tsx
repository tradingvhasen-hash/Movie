"use client";

import ErrorPanel from "@/components/ErrorPanel";

/**
 * The last line. This catches faults in the root layout itself, which is the
 * one case where nothing else is left rendering — so it has to supply its own
 * `<html>` and `<body>`, and the panel runs standalone rather than as an
 * overlay over an app that is no longer there.
 *
 * `lang`/`dir` are fixed here on purpose: the locale is resolved inside the
 * tree that has just failed, and guessing wrong is better than a second fault
 * inside the error handler.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" dir="ltr">
      <body style={{ margin: 0, minHeight: "100dvh" }}>
        <ErrorPanel error={error} reset={reset} standalone />
      </body>
    </html>
  );
}
