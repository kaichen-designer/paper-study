import { describe, expect, it } from "vitest";
import { metadata } from "./layout";

describe("root layout metadata (iOS installability)", () => {
  it("declares the web app manifest", () => {
    expect(metadata.manifest).toBe("/manifest.json");
  });

  it("declares an apple-touch-icon so iOS uses a real icon, not manifest icons it ignores", () => {
    expect(metadata.icons).toMatchObject({ apple: "/icon-192.png" });
  });

  it("marks the app as a capable standalone web app for iOS Safari's Add to Home Screen", () => {
    expect(metadata.appleWebApp).toMatchObject({ capable: true, title: "PaperReader" });
  });
});
