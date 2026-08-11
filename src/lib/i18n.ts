import messages from "@/messages/en.json";

/**
 * Minimal typed string lookup. The app is English-only for now, so this
 * replaces the request-scoped i18n runtime (which cannot resolve during
 * static prerendering) while keeping the message JSON structure intact —
 * re-enabling multi-language later means swapping this file back out.
 */
type Dict = { [key: string]: string | Dict };

function lookup(path: string): string {
  let node: string | Dict = messages as Dict;
  for (const part of path.split(".")) {
    if (typeof node === "string") return path;
    node = node[part];
    if (node === undefined) return path;
  }
  return typeof node === "string" ? node : path;
}

/** `t("swipe.liked")` — supports `{name}` placeholders */
export function t(key: string, values?: Record<string, string | number>): string {
  const raw = lookup(key);
  if (!values) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match
  );
}

/** The active locale — fixed to English while the app is single-language. */
export const locale = "en" as const;
export type AppLocale = "ar" | "en";
