import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// STATIC_EXPORT=1 builds the client-only demo for static hosting
// (GitHub Pages); the CI workflow strips the server routes first.
const isStaticExport = process.env.STATIC_EXPORT === "1";

const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = isStaticExport
  ? {
      output: "export",
      basePath,
      images: { unoptimized: true },
      // client code needs the prefix to fetch /catalog.json under a basePath
      env: { NEXT_PUBLIC_BASE_PATH: basePath },
    }
  : {
      images: {
        remotePatterns: [{ protocol: "https", hostname: "image.tmdb.org" }],
      },
      env: { NEXT_PUBLIC_BASE_PATH: "" },
    };

export default withNextIntl(nextConfig);
