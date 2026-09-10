import { describe, expect, it } from "vitest";
import { shouldRedirectToLogin } from "./route-guard";

describe("shouldRedirectToLogin", () => {
  it("redirects an unauthenticated visitor away from the library", () => {
    expect(shouldRedirectToLogin({ pathname: "/library", hasSession: false })).toBe(true);
  });

  it("does not redirect a signed-in user viewing the library", () => {
    expect(shouldRedirectToLogin({ pathname: "/library", hasSession: true })).toBe(false);
  });

  it("never redirects the login page itself, even without a session", () => {
    expect(shouldRedirectToLogin({ pathname: "/login", hasSession: false })).toBe(false);
  });

  it("never redirects the auth callback route", () => {
    expect(shouldRedirectToLogin({ pathname: "/auth/callback", hasSession: false })).toBe(false);
  });

  it("never redirects static/manifest assets needed to even render the login page", () => {
    expect(shouldRedirectToLogin({ pathname: "/manifest.json", hasSession: false })).toBe(false);
    expect(shouldRedirectToLogin({ pathname: "/sw.js", hasSession: false })).toBe(false);
    expect(shouldRedirectToLogin({ pathname: "/_next/static/chunk.js", hasSession: false })).toBe(
      false
    );
  });

  it("never redirects home-screen icons or iPad splash images, so iOS's Add to Home Screen fetch (unauthenticated) succeeds", () => {
    expect(shouldRedirectToLogin({ pathname: "/icon-192.png", hasSession: false })).toBe(false);
    expect(shouldRedirectToLogin({ pathname: "/icon-512.png", hasSession: false })).toBe(false);
    expect(shouldRedirectToLogin({ pathname: "/apple-touch-icon.png", hasSession: false })).toBe(
      false
    );
    expect(
      shouldRedirectToLogin({ pathname: "/splash/apple-splash-2048-2732.png", hasSession: false })
    ).toBe(false);
  });

  it("never redirects the next-pwa service worker's runtime chunk (content-hashed filename), so the browser doesn't try to execute a login-page redirect as JavaScript", () => {
    expect(
      shouldRedirectToLogin({ pathname: "/swe-worker-5c72df51bb1f6ee0.js", hasSession: false })
    ).toBe(false);
  });
});
