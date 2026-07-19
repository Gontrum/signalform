import { describe, expect, it } from "vitest";
import { unwrap } from "@signalform/shared";
import { parsePlaylistName } from "./service.js";

describe("parsePlaylistName", () => {
  it("accepts a plain valid name", () => {
    expect(unwrap(parsePlaylistName("My Mix"))).toBe("My Mix");
  });

  it("trims surrounding whitespace", () => {
    expect(unwrap(parsePlaylistName("  My Mix  "))).toBe("My Mix");
  });

  it("accepts a name at the 200-character limit", () => {
    const name = "a".repeat(200);
    expect(unwrap(parsePlaylistName(name))).toBe(name);
  });

  it("accepts 200 real characters surrounded by whitespace (trimmed to 200)", () => {
    const name = "a".repeat(200);
    expect(unwrap(parsePlaylistName("  " + name + "  "))).toBe(name);
  });

  it.each([
    ["an empty string", ""],
    ["a whitespace-only string", "   "],
    ["a tab/newline-only string", "\t\n "],
  ])("rejects %s", (_label, input) => {
    const result = parsePlaylistName(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("cannot be empty");
    }
  });

  it("rejects a name longer than 200 characters", () => {
    const result = parsePlaylistName("a".repeat(201));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("cannot exceed");
    }
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["a boolean", true],
    ["an object", { name: "x" }],
  ])("rejects non-string input: %s", (_label, input) => {
    const result = parsePlaylistName(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("must be a string");
    }
  });
});
