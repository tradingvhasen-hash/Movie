"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import arMessages from "@/messages/ar.json";
import enMessages from "@/messages/en.json";

/**
 * Client-driven locale so language switching works on any hosting,
 * including fully static (GitHub Pages demo). On server-rendered hosting
 * the cookie keeps SSR in sync; on static hosting localStorage takes over
 * after hydration.
 */
type Locale = "ar" | "en";
const MESSAGES: Record<Locale, Record<string, unknown>> = {
  ar: arMessages,
  en: enMessages,
};

const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (l: Locale) => void;
}>({ locale: "ar", setLocale: () => {} });

export const useLocaleSwitch = () => useContext(LocaleContext);

export default function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // static hosting: SSR can't read the cookie, so apply the stored choice on mount
  useEffect(() => {
    const stored = window.localStorage.getItem("locale");
    if ((stored === "ar" || stored === "en") && stored !== initialLocale) {
      setLocaleState(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  function setLocale(l: Locale) {
    setLocaleState(l);
    window.localStorage.setItem("locale", l);
    document.cookie = `locale=${l};path=/;max-age=31536000;samesite=lax`;
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
