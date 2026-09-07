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
});
