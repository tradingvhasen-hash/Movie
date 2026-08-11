import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ar";

export default getRequestConfig(async () => {
  let locale: Locale = DEFAULT_LOCALE;

  // static export (GitHub Pages demo) has no request cookies; the client
  // LocaleProvider applies the user's stored choice after hydration
  if (process.env.STATIC_EXPORT !== "1") {
    const store = await cookies();
    const cookieLocale = store.get("locale")?.value;
    if (LOCALES.includes(cookieLocale as Locale)) locale = cookieLocale as Locale;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
