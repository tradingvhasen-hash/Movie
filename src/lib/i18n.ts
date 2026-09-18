"use client";

import { useEffect, useState } from "react";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

/**
 * TWO LANGUAGES, ONE OF WHICH WAS WRITTEN AND NEVER CONNECTED.
 *
 * `src/messages/ar.json` has held 76 real Arabic translations for months. The
 * `ar` locale was declared in `i18n/request.ts`. `next-intl` was installed and
 * wired. And `LocaleProvider` was hard-coded to `locale="en"`, this file's
 * `locale` was `"en" as const`, and the served page said
 * `<html lang="en" dir="ltr">` with not one Arabic character in it.
 *
 * So a product named ذَوق, whose catalog was deliberately rebuilt to hold
 * 1,503 Arabic and 1,803 Turkish titles, greeted an Arabic speaker in English,
 * left to right. The translations existed the whole time. Nothing was loading
 * them.
 *
 * WHAT DOES NOT FLIP WITH THE TEXT: THE GESTURE. Right stays ❤️ in Arabic.
 * Swiping is motor memory, not reading — it is not a sentence and it has no
 * direction to mirror. A person who has learned that right means "I liked it"
 * must not have that retrained by changing the language of the labels. Layout
 * mirrors; the hand does not.
 */

type Dict = { [key: string]: string | Dict };

export const LOCALES = ["ar", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];

/** "auto" resolves from the device on first run and is the default */
export type LocalePreference = AppLocale | "auto";

const CATALOGS: Record<AppLocale, Dict> = { en: en as Dict, ar: ar as Dict };

export const RTL_LOCALES = new Set<AppLocale>(["ar"]);
export const isRtl = (l: AppLocale) => RTL_LOCALES.has(l);

/**
 * What the device asks for, if the person has expressed no preference.
 *
 * Checked against every entry in `navigator.languages`, not just the first,
 * because a phone set to English with Arabic second belongs to someone who
 * reads both — and of the two, this product is the Arabic one.
 */
export function deviceLocale(): AppLocale {
  if (typeof navigator === "undefined") return "en";
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of tags) {
    const base = (tag ?? "").toLowerCase().split("-")[0];
    if (base === "ar") return "ar";
    if (base === "en") return "en";
  }
  return "en";
}

export function resolveLocale(pref: LocalePreference | undefined): AppLocale {
  if (pref === "ar" || pref === "en") return pref;
  return deviceLocale();
}

function lookup(catalog: Dict, path: string): string | null {
  let node: string | Dict | undefined = catalog;
  for (const part of path.split(".")) {
    if (typeof node === "string" || node === undefined) return null;
    node = node[part];
  }
  return typeof node === "string" ? node : null;
}

/**
 * `translate("ar", "swipe.liked")` — supports `{name}` placeholders.
 *
 * Falls back to English rather than to the key. A missing Arabic string should
 * show the English sentence, which a bilingual audience can read, instead of
 * `lists.emptyTitle`, which nobody can.
 */
export function translate(
  locale: AppLocale,
  key: string,
  values?: Record<string, string | number>
): string {
  const raw = lookup(CATALOGS[locale], key) ?? lookup(CATALOGS.en, key) ?? key;
  if (!values) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match
  );
}

/* ── the live locale ───────────────────────────────────────────────────────
 * Kept at module scope with subscribers rather than in React context, because
 * `t()` is called from plain functions as well as components and the call
 * sites should not all have to become hooks to read a language.
 */
let current: AppLocale = "en";
const listeners = new Set<() => void>();

export function getLocale(): AppLocale {
  return current;
}

export function setLocale(next: AppLocale): void {
  if (next === current) return;
  current = next;
  if (typeof document !== "undefined") {
    document.documentElement.lang = next;
    document.documentElement.dir = isRtl(next) ? "rtl" : "ltr";
  }
  for (const fn of listeners) fn();
}

/** Re-renders the calling component whenever the language changes. */
export function useLocale(): AppLocale {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return current;
}

/**
 * The translator, bound to the live language.
 *
 *     const t = useT();
 *     <h1>{t("nav.swipe")}</h1>
 */
export function useT(): (key: string, values?: Record<string, string | number>) => string {
  const locale = useLocale();
  return (key, values) => translate(locale, key, values);
}

/**
 * Non-reactive translation, for code outside the render tree. A component
 * using this will not re-render on a language change, so prefer `useT`.
 */
export function t(key: string, values?: Record<string, string | number>): string {
  return translate(current, key, values);
}

/**
 * The direction a piece of *content* should be laid out in.
 *
 * Always `auto` for anything that came from the catalog. A list of titles in
 * this product routinely mixes `الفيل الأزرق` with `The Big Lebowski`, and a
 * fixed direction puts the punctuation, the digits and the year of one of them
 * on the wrong side. `auto` asks the browser to decide per string, which is
 * the only thing that can be right for a catalog spanning 39 languages.
 */
export const CONTENT_DIR = "auto" as const;

/** @deprecated read `useLocale()`; kept so older call sites still compile */
export const locale = "en" as const;
