import { getRequestConfig } from "next-intl/server";

export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
/* the product is English-only for now (user decision); the ar catalog and
   i18n plumbing stay in place for a future re-enable */
export const DEFAULT_LOCALE: Locale = "en";

export default getRequestConfig(async () => {
  const locale: Locale = DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
