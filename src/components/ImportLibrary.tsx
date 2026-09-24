"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { getLocalCatalog, loadCatalog } from "@/lib/catalog";
import { matchAll, readExport } from "@/lib/import/watchlist";
import { useDhawq } from "@/lib/store";
import type { SwipeAction, Title } from "@/lib/types";
import { useT } from "@/lib/i18n";

/**
 * THE OFFER THAT SHOULD HAVE BEEN ON THE FIRST SCREEN.
 *
 * The deck asks one film at a time. Measured on 60 real histories it takes
 * about 22 minutes to recover 411 films of 533, and the rate falls the whole
 * way — 71 titles per hundred cards at the start, 12 by the twelfth hundred.
 * Four attempts to fix that inside the ranking all failed.
 *
 * Every product in this category solves it a different way: Letterboxd, Trakt,
 * TV Time and Bingebase all import. Trakt's own announcement of its
 * IMDb/Letterboxd importer states the purpose as streamlining onboarding for
 * new users — which is this exact problem, named by somebody else, with an
 * answer that is not a better ranking.
 *
 * So a person who already keeps a library elsewhere is done in one second
 * rather than six thousand cards, and the deck goes back to what it is
 * genuinely good at: collecting opinions on titles the site already knows they
 * watched.
 *
 * Shown in onboarding *and* on /lab from one component, because the version
 * that only existed on a page nobody visits was not a feature.
 */
export default function ImportLibrary({
  compact = false,
  onDone,
}: {
  compact?: boolean;
  onDone?: (added: number) => void;
}) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (file: File) => {
    setBusy(true);
    setStatus(t("importLibrary.reading"));
    try {
      const text = await file.text();
      const rows = readExport(text);
      if (rows.length === 0) {
        setStatus(t("importLibrary.empty"));
        return;
      }
      setStatus(t("importLibrary.matching"));

      let matched: { title: Title; action: SwipeAction }[] = [];
      let unmatchedCount = 0;
      try {
        const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
        const res = await fetch(`${base}/api/import-match`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rows }),
        });
        if (!res.ok) throw new Error(`import ${res.status}`);
        const body = (await res.json()) as {
          matched?: { title: Title; action: SwipeAction }[];
          unmatchedCount?: number;
        };
        if (!Array.isArray(body.matched)) throw new Error("invalid import response");
        matched = body.matched;
        unmatchedCount = Number(body.unmatchedCount ?? 0);
      } catch {
        // Static demo/offline fallback keeps the old exact matcher.
        await loadCatalog();
        const catalog = getLocalCatalog().map((c: { title: Title }) => c.title);
        const local = matchAll(rows, catalog);
        matched = local.matched.map(({ title, action }) => ({ title, action }));
        unmatchedCount = local.unmatched.length;
      }

      const swipe = useDhawq.getState().swipe;
      const already = useDhawq.getState().swipes;
      let added = 0;
      for (let i = 0; i < matched.length; i++) {
        const m = matched[i];
        if (already[m.title.id]) continue;
        swipe(m.title, m.action);
        added++;
        // hand the frame back so a 2,000-row file does not lock the page
        if (i % 200 === 0) {
          setStatus(t("importLibrary.progress", { current: i, total: matched.length }));
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      setStatus(
        unmatchedCount > 0
          ? t("importLibrary.resultUnmatched", { added, unmatched: unmatchedCount })
          : t("importLibrary.result", { added })
      );
      onDone?.(added);
    } catch {
      setStatus(t("importLibrary.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? "" : "mt-6"}>
      <input
        ref={input}
        type="file"
        accept="text/csv,.csv,application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void run(f);
          e.target.value = "";
        }}
      />
      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        disabled={busy}
        onClick={() => input.current?.click()}
        className="w-full rounded-2xl border border-line bg-surface px-4 py-3.5 text-start transition-colors hover:border-ink-faint disabled:opacity-60"
      >
        <span className="block text-sm font-bold text-ink-strong">
          {busy ? t("importLibrary.working") : t("importLibrary.prompt")}
        </span>
        <span className="mt-0.5 block text-xs text-ink-faint">
          {t("importLibrary.hint")}
        </span>
      </motion.button>
      {status && (
        <p className="mt-2 px-1 text-xs font-semibold text-ink-dim" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
