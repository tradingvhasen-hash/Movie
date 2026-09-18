import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// STATIC_EXPORT=1 builds the client-only demo for static hosting
// (GitHub Pages); the CI workflow strips the server routes first.
const isStaticExport = process.env.STATIC_EXPORT === "1";

const basePath = process.env.BASE_PATH ?? "";

/**
 * Which build a bundle came from, so an error report identifies a version.
 *
 * Render sets RENDER_GIT_COMMIT on every deploy; locally there is a git
 * checkout to ask. Neither is guaranteed — a tarball build has no git dir —
 * so this must never throw, and "dev" is a perfectly good answer.
 */
function buildId(): string {
  const fromHost = process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromHost) return fromHost.slice(0, 7);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = require("node:child_process");
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

const NEXT_PUBLIC_BUILD = buildId();

const nextConfig: NextConfig = isStaticExport
  ? {
      output: "export",
      basePath,
      images: { unoptimized: true },
      // client code needs the prefix to fetch /catalog.json under a basePath
      env: { NEXT_PUBLIC_BASE_PATH: basePath, NEXT_PUBLIC_BUILD },
    }
  : {
      images: {
        remotePatterns: [{ protocol: "https", hostname: "image.tmdb.org" }],
      },
      env: { NEXT_PUBLIC_BASE_PATH: "", NEXT_PUBLIC_BUILD },
    };

export default withNextIntl(nextConfig);
