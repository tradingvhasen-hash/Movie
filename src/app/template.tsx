"use client";

/**
 * Route changes are deliberately immediate.
 *
 * This used to animate every new page from opacity 0.6 and y=6. On a tab bar
 * that does not read as polish; it makes every destination feel late. The
 * screens themselves already animate the pieces that need explanation, so the
 * route shell does no extra work and never delays a tab change.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return children;
}
