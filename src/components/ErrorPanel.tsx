"use client";

import { useEffect, useState } from "react";
import { BRAND, BUILD } from "@/lib/brand";

/**
 * WHAT A PERSON SEES WHEN SOMETHING BREAKS.
 *
 * Before this, the answer was a blank white page. No message, no button, no
 * indication the site still existed — and behind it the person's library was
 * completely intact, which they had no way of knowing. Silence is the worst
 * possible error interface: it is indistinguishable from the product having
 * been deleted.
 *
 * Three things this does that a plain "something went wrong" page does not.
 *
 * IT DOES NOT WIPE THE SCREEN. In the App Router an `error.tsx` replaces only
 * its own segment, so the shell, the navigation and the surrounding page stay
 * rendered underneath. This deliberately renders as a panel over that rather
 * than as a full-page takeover, because a visible app with a problem reads as
 * a problem, and an empty viewport reads as a loss.
 *
 * IT SAYS THE DATA IS SAFE, because it almost always is — the library lives in
 * this browser and a render fault does not touch it. That sentence is the one
 * the person actually needs.
 *
 * IT CARRIES AN IDENTIFIER. A report of "it broke" is not actionable; `DQ-7H2K`
 * on build `a1b2c3d` is. The id is derived from the error itself, so the same
 * fault always produces the same code and two reports can be recognised as one.
 */

/** short, stable, readable aloud — derived from the message, not random */
function errorId(error: Error): string {
  const source = `${error.name}:${error.message}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  /* base32 without the characters people mishear: I, L, O, U, 0, 1 */
  const alphabet = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
  let out = "";
  for (let i = 0; i < 4; i++) {
    out = alphabet[h % alphabet.length] + out;
    h = Math.floor(h / alphabet.length);
  }
  return `DQ-${out}`;
}

export default function ErrorPanel({
  error,
  reset,
  /** global-error replaces the whole document, so it cannot overlay anything */
  standalone = false,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  standalone?: boolean;
}) {
  const id = errorId(error);
  const [copied, setCopied] = useState(false);

  /**
   * Logged rather than sent. There is no error-reporting service configured on
   * this project, and wiring one would mean choosing a vendor and a privacy
   * position in an error handler. What matters first is that the detail exists
   * somewhere a person can reach — the console, and the copy button below.
   *
   * Nothing here touches the library: the report is the fault and the build,
   * never what the person has watched.
   */
  useEffect(() => {
    console.error(`[${id}] build=${BUILD}`, error);
  }, [id, error]);

  const report = [
    `${id}`,
    `build: ${BUILD}`,
    `error: ${error.name}: ${error.message}`,
    error.digest ? `digest: ${error.digest}` : "",
    `page: ${typeof location !== "undefined" ? location.pathname : "?"}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        insetInlineStart: 0,
        insetInlineEnd: 0,
        bottom: 0,
        zIndex: 60,
        display: "flex",
        justifyContent: "center",
        padding: "16px",
        /* no backdrop on a panel: the working app behind it is the reassurance */
        background: standalone ? "var(--color-bg, #0f1216)" : "transparent",
        ...(standalone ? { top: 0, alignItems: "center" } : null),
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "26rem",
          borderRadius: "var(--radius-card, 24px)",
          border: "1px solid var(--color-line, #e3e8ef)",
          background: "var(--color-surface, #fff)",
          color: "var(--color-ink, #1d1d1f)",
          boxShadow: "0 18px 50px rgb(var(--rgb-shadow, 29 41 61) / 0.28)",
          padding: "20px",
          fontFamily: "var(--font-sans, system-ui, sans-serif)",
        }}
      >
        <p style={{ margin: 0, fontWeight: 600, fontSize: "1rem" }}>
          Something broke — your library is safe
        </p>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: "0.875rem",
            color: "var(--color-ink-dim, #6e7381)",
            lineHeight: 1.5,
          }}
        >
          Everything you have marked is still stored on this device. Nothing was
          lost.
        </p>

        <div style={{ display: "flex", gap: "8px", marginTop: "16px", flexWrap: "wrap" }}>
          {reset && (
            <button onClick={reset} style={primary}>
              Try again
            </button>
          )}
          <a href="/" style={secondary}>
            Home
          </a>
          <a href="/settings" style={secondary}>
            Back up my library
          </a>
        </div>

        <button
          onClick={() => {
            navigator.clipboard?.writeText(report).then(
              () => setCopied(true),
              () => setCopied(false)
            );
          }}
          style={{
            ...quiet,
            marginTop: "14px",
          }}
          title={report}
        >
          {copied ? "copied" : `${id} · ${BUILD.slice(0, 7)} — copy details`}
        </button>

        {standalone && (
          <p
            style={{
              margin: "14px 0 0",
              fontSize: "0.75rem",
              color: "var(--color-ink-faint, #9aa1ad)",
            }}
          >
            {BRAND}
          </p>
        )}
      </div>
    </div>
  );
}

const base: React.CSSProperties = {
  borderRadius: "999px",
  padding: "9px 16px",
  fontSize: "0.875rem",
  fontWeight: 500,
  cursor: "pointer",
  border: "1px solid transparent",
  textDecoration: "none",
  display: "inline-block",
};

const primary: React.CSSProperties = {
  ...base,
  background: "var(--color-accent, #0ea5e9)",
  color: "var(--color-on-accent, #fff)",
};

const secondary: React.CSSProperties = {
  ...base,
  background: "transparent",
  borderColor: "var(--color-line, #e3e8ef)",
  color: "var(--color-ink, #1d1d1f)",
};

const quiet: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  fontSize: "0.75rem",
  color: "var(--color-ink-faint, #9aa1ad)",
  cursor: "pointer",
  fontFamily: "ui-monospace, monospace",
};
