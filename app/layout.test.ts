import { describe, expect, it } from "vitest";
import { metadata, viewport } from "./layout";

describe("root layout metadata (iOS installability)", () => {
  it("declares the web app manifest", () => {
    expect(metadata.manifest).toBe("/manifest.json");
  });

  it("declares a dedicated 180x180 apple-touch-icon so iOS doesn't upscale a smaller icon", () => {
    expect(metadata.icons).toMatchObject({ apple: "/apple-touch-icon.png" });
  });

  it("marks the app as a capable standalone web app for iOS Safari's Add to Home Screen", () => {
    expect(metadata.appleWebApp).toMatchObject({ capable: true, title: "PaperReader" });
  });

  it("declares iPad splash screens so launch doesn't show a blank white flash", () => {
    const icons = metadata.icons as { other?: Array<{ rel?: string; media?: string; url: string | URL }> };
    expect(icons.other).toBeDefined();
    expect(icons.other!.length).toBeGreaterThan(0);
    for (const entry of icons.other!) {
      expect(entry.rel).toBe("apple-touch-startup-image");
      expect(entry.media).toBeTruthy();
    }
  });

  it("covers the safe area (notch/home indicator) in standalone mode on iPad", () => {
    expect(viewport.viewportFit).toBe("cover");
  });
});
