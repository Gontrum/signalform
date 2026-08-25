import { describe, expect, it } from "vitest";
import { findTag, TAG_VOCABULARY, type TagQueryMode } from "./tags.js";

describe("findTag", () => {
  it("resolves a format tag to its Discogs term", () => {
    const tag = findTag("sacd");

    expect(tag?.mode).toBe("format");
    expect(tag?.term).toBe("SACD");
    expect(tag?.label).toBe("SACD");
  });

  it("resolves a text tag case-insensitively", () => {
    const tag = findTag("QSound");

    expect(tag?.id).toBe("qsound");
    expect(tag?.mode).toBe("text");
    expect(tag?.term).toBe("qsound");
  });

  it("ignores surrounding whitespace from the query parameter", () => {
    expect(findTag("  qsound  ")).toBe(findTag("qsound"));
    expect(findTag("  qsound  ")?.mode).toBe("text");
  });

  it("returns undefined for a term outside the curated vocabulary", () => {
    expect(findTag("binaural")).toBeUndefined();
  });

  it("returns undefined for an empty id", () => {
    expect(findTag("")).toBeUndefined();
    expect(findTag("   ")).toBeUndefined();
  });

  it("resolves every vocabulary id back to its own descriptor", () => {
    const resolved = TAG_VOCABULARY.map((tag) => ({
      id: tag.id,
      exact: findTag(tag.id) === tag,
      upperCased: findTag(tag.id.toUpperCase()) === tag,
      padded: findTag(` ${tag.id} `) === tag,
    }));

    expect(resolved).toEqual(
      TAG_VOCABULARY.map((tag) => ({
        id: tag.id,
        exact: true,
        upperCased: true,
        padded: true,
      })),
    );
  });
});

describe("TAG_VOCABULARY", () => {
  it("has unique ids", () => {
    const ids = TAG_VOCABULARY.map((tag) => tag.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("carries a known query mode and a non-empty term for every entry", () => {
    const modes: readonly TagQueryMode[] = ["format", "text"];

    const shapes = TAG_VOCABULARY.map((tag) => ({
      id: tag.id,
      knownMode: modes.includes(tag.mode),
      hasTerm: tag.term.trim() !== "",
      hasLabel: tag.label.trim() !== "",
    }));

    expect(shapes).toEqual(
      TAG_VOCABULARY.map((tag) => ({
        id: tag.id,
        knownMode: true,
        hasTerm: true,
        hasLabel: true,
      })),
    );
  });

  it("maps each id to the expected label, mode, and term", () => {
    const actual = TAG_VOCABULARY.map(({ id, label, mode, term }) => ({
      id,
      label,
      mode,
      term,
    }));

    expect(actual).toEqual([
      { id: "sacd", label: "SACD", mode: "format", term: "SACD" },
      { id: "hdcd", label: "HDCD", mode: "format", term: "HDCD" },
      {
        id: "quadraphonic",
        label: "Quadraphonic",
        mode: "format",
        term: "Quadraphonic",
      },
      {
        id: "multichannel",
        label: "Multichannel",
        mode: "format",
        term: "Multichannel",
      },
      {
        id: "ambisonic",
        label: "Ambisonic",
        mode: "format",
        term: "Ambisonic",
      },
      { id: "qsound", label: "QSound", mode: "text", term: "qsound" },
      {
        id: "dolby-atmos",
        label: "Dolby Atmos",
        mode: "text",
        term: "dolby atmos",
      },
      {
        id: "half-speed-mastered",
        label: "Half-Speed Mastered",
        mode: "text",
        term: "half-speed mastered",
      },
      {
        id: "mobile-fidelity",
        label: "Mobile Fidelity",
        mode: "text",
        term: "mobile fidelity",
      },
    ]);
  });
});
