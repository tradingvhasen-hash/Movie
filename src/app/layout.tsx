import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Geist } from "next/font/google";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";
import AppShell from "@/components/AppShell";
import LocaleProvider from "@/components/LocaleProvider";

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const BASE_PATH = process.env.BASE_PATH ?? "";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return {
    title: { default: `${t("name")} — ${t("tagline")}`, template: `%s · ${t("name")}` },
    description: t("tagline"),
    manifest: `${BASE_PATH}/manifest.webmanifest`,
  };
}

export const viewport: Viewport = {
  themeColor: "#0b0b13",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = (await getLocale()) as "ar" | "en";
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      className={`${plexArabic.variable} ${geistSans.variable} h-full antialiased`}
    >
      <body className="min-h-dvh font-sans">
        <LocaleProvider initialLocale={locale}>
          <AppShell>{children}</AppShell>
        </LocaleProvider>
      </body>
    </html>
  );
}
