import { describe, it, expect } from "vitest";
import { normalizeForMatch } from "./normalize.js";

describe("normalizeForMatch", () => {
  it("makes a remaster suffix irrelevant", () => {
    expect(normalizeForMatch("Amused to Death (Remastered)")).toBe(
      "amused to death",
    );
    expect(normalizeForMatch("Amused To Death")).toBe("amused to death");
  });

  it("strips a bracketed remaster suffix", () => {
    expect(normalizeForMatch("The Soul Cages [2011 Remaster]")).toBe(
      "the soul cages",
    );
    expect(normalizeForMatch("The Soul Cages")).toBe("the soul cages");
  });

  it("strips stacked suffixes", () => {
    expect(
      normalizeForMatch("Wish You Were Here (Deluxe Edition) [2011 Remaster]"),
    ).toBe("wish you were here");
  });

  it("keeps a title that consists only of a bracketed part", () => {
    expect(normalizeForMatch("(Remastered)")).toBe("remastered");
  });

  it("removes diacritics", () => {
    expect(normalizeForMatch("Café del Mar")).toBe("cafe del mar");
  });

  it("turns punctuation into word boundaries and drops apostrophes", () => {
    expect(normalizeForMatch("Q.Sound")).toBe("q sound");
    expect(normalizeForMatch("Sgt. Pepper's Lonely  Hearts Club Band")).toBe(
      "sgt peppers lonely hearts club band",
    );
  });

  it("collapses whitespace and trims", () => {
    expect(normalizeForMatch("  The   Wall  ")).toBe("the wall");
  });
});
