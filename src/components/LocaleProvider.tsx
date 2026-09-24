"use client";

import { useEffect } from "react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import arMessages from "@/messages/ar.json";
import { useDhawq } from "@/lib/store";
import { getLocale, isRtl, resolveLocale, setLocale, useLocale } from "@/lib/i18n";

/**
 * Applies the chosen language to the document.
 *
 * This file used to be four lines hard-coding `locale="en"`, which is the
 * whole reason a product called ذَوق shipped with no Arabic in it — see the
 * header of `src/lib/i18n.ts`.
 *
 * `lang` and `dir` are set here rather than on the server-rendered `<html>`
 * because the preference lives in local storage, which the server cannot read.
 * The markup ships as `lang="en" dir="ltr"` and is corrected on hydration. The
 * visible cost is one frame; the alternative is rendering nothing until the
 * language is known, which is a blank screen for everybody to spare Arabic
 * readers a flicker.
 */
export default function LocaleProvider({ children }: { children: React.ReactNode }) {
  const pref = useDhawq((s) => s.settings.locale);
  const locale = useLocale();

  useEffect(() => {
    const next = resolveLocale(pref);
    if (next !== getLocale()) setLocale(next);
    /* setLocale only touches the document when the value actually changes, so
       a first load that resolves to the SSR default still needs these set */
    document.documentElement.lang = next;
    document.documentElement.dir = isRtl(next) ? "rtl" : "ltr";
    if (pref === "ar" || pref === "en") {
      document.cookie = `dhawq-locale=${pref}; Path=/; Max-Age=31536000; SameSite=Lax`;
    } else {
      document.cookie = "dhawq-locale=; Path=/; Max-Age=0; SameSite=Lax";
    }
  }, [pref]);

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ar" ? arMessages : enMessages}
    >
      {children}
    </NextIntlClientProvider>
  );
}
