import { describe, it, expect } from "vitest";
import { normalizeArtist } from "./normalizeArtist.js";

describe("normalizeArtist", () => {
  it("lowercases input", () => {
    expect(normalizeArtist("Radiohead")).toBe("radiohead");
  });

  it("strips diacritics via NFD (Björk → bjork)", () => {
    expect(normalizeArtist("Björk")).toBe("bjork");
  });

  it("strips diacritics via NFD (Sigur Rós → sigur ros)", () => {
    expect(normalizeArtist("Sigur Rós")).toBe("sigur ros");
  });

  it("handles multi-word names", () => {
    expect(normalizeArtist("Pink Floyd")).toBe("pink floyd");
  });

  it("handles empty string", () => {
    expect(normalizeArtist("")).toBe("");
  });

  it("is idempotent — normalizing twice yields same result", () => {
    expect(normalizeArtist(normalizeArtist("Björk"))).toBe(
      normalizeArtist("Björk"),
    );
  });
});
