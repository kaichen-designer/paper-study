import type { Metadata, Viewport } from "next";
import "./globals.css";

// iPad launch/splash screens (apple-touch-startup-image). Generated with:
//   npx pwa-asset-generator public/icon-512.png public/splash --splash-only \
//     --opaque true --type png --background "#ffffff" --padding "20%"
// Device sizes sourced from pwa-asset-generator's Apple fallback table; re-run
// the command above (and re-derive the media queries below) if Apple ships a
// new iPad screen size.
const iPadSplashScreens: Array<{ url: string; rel: string; media: string }> = [
  { width: 1024, height: 1366 }, // iPad Pro 12.9" / iPad Air 13"
  { width: 834, height: 1194 }, // iPad Pro 11" / iPad Pro 10.5"
  { width: 768, height: 1024 }, // iPad Pro 9.7" / iPad Air 9.7" / iPad 9.7" / iPad mini 7.9"
  { width: 820, height: 1180 }, // iPad Air 11" / iPad Air 10.9" / iPad 11"
  { width: 834, height: 1112 }, // iPad Air 10.5"
  { width: 810, height: 1080 }, // iPad 10.2"
  { width: 744, height: 1133 }, // iPad mini 8.3"
].flatMap(({ width, height }) => [
  {
    url: `/splash/apple-splash-${width * 2}-${height * 2}.png`,
    rel: "apple-touch-startup-image",
    media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)`,
  },
  {
    url: `/splash/apple-splash-${height * 2}-${width * 2}.png`,
    rel: "apple-touch-startup-image",
    media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)`,
  },
]);

export const metadata: Metadata = {
  title: "Paper Reading PWA",
  description: "Personal paper reader with translation and notes",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
    other: iPadSplashScreens,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PaperReader",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
