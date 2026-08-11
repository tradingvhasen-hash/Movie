"use client";

import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";

/**
 * English-only for now (user decision). The provider stays so a future
 * language re-enable only touches this file and i18n/request.ts.
 */
export default function LocaleProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}
