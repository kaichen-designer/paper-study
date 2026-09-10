const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/auth/callback",
  "/_next",
  "/manifest.json",
  "/sw.js",
  "/workbox-",
  "/swe-worker-",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/splash/",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Decides whether an incoming request should be redirected to /login.
 * Kept as a pure function (no NextRequest/NextResponse) so it is
 * independently testable outside the Next.js middleware runtime.
 */
export function shouldRedirectToLogin({
  pathname,
  hasSession,
}: {
  pathname: string;
  hasSession: boolean;
}): boolean {
  if (isPublicPath(pathname)) {
    return false;
  }
  return !hasSession;
}
