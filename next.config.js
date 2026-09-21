const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    // PDF files are large and user-specific; they must never be
    // precached into the service worker's static asset list.
    exclude: [/\.pdf$/],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // Surfaced in the ink debug HUD. Testing a fix on a stale deployment
    // wastes a whole round trip and looks exactly like the fix not
    // working, so the build has to be able to identify itself.
    NEXT_PUBLIC_BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 7),
  },
};

module.exports = withPWA(nextConfig);
