"use client";

import { useEffect } from "react";

/**
 * Registers the offline worker, after the page has settled.
 *
 * On `load` rather than on mount: registration and the precache it triggers
 * compete for exactly the bandwidth the first card is waiting on, and the
 * whole point of the starter pack is that the first card does not wait. Saving
 * a repeat visit is not worth slowing the first one.
 *
 * Skipped entirely on the static export. That build is a demo served under a
 * base path from GitHub Pages, and a worker whose scope assumes the site is at
 * the root would claim clients it cannot serve — which is the failure mode that
 * makes people uninstall a site.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NEXT_PUBLIC_BASE_PATH) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* a browser that refuses this — private mode, a policy, an old engine —
           still has a perfectly working site. It is an enhancement, not a
           dependency, and a failed registration must be silent. */
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
