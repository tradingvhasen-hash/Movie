import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// STATIC_EXPORT=1 builds the client-only demo for static hosting
// (GitHub Pages); the CI workflow strips the server routes first.
const isStaticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = isStaticExport
  ? {
      output: "export",
      basePath: process.env.BASE_PATH ?? "",
      images: { unoptimized: true },
    }
  : {
      images: {
        remotePatterns: [{ protocol: "https", hostname: "image.tmdb.org" }],
      },
    };

export default withNextIntl(nextConfig);
