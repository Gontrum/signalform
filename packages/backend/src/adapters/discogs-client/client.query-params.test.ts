import { describe, it, expect } from "vitest";
import type { TagDescriptor } from "@signalform/shared";
import { buildQueryParams } from "./client.js";

const TEXT_TAG: TagDescriptor = {
  id: "qsound",
  label: "QSound",
  mode: "text",
  term: "qsound",
};

const FORMAT_TAG: TagDescriptor = {
  id: "sacd",
  label: "SACD",
  mode: "format",
  term: "SACD",
};

describe("buildQueryParams", () => {
  it("maps a format tag without text to format alone", () => {
    expect(buildQueryParams({ tag: FORMAT_TAG })).toStrictEqual({
      format: "SACD",
    });
  });

  it("maps a format tag with text to format plus a separate q", () => {
    expect(buildQueryParams({ tag: FORMAT_TAG, text: "sting" })).toStrictEqual({
      format: "SACD",
      q: "sting",
    });
  });

  it("maps a text tag without text to the term as q and no format", () => {
    expect(buildQueryParams({ tag: TEXT_TAG })).toStrictEqual({ q: "qsound" });
  });

  it("maps a text tag with text to term and text joined in one q", () => {
    expect(buildQueryParams({ tag: TEXT_TAG, text: "sting" })).toStrictEqual({
      q: "qsound sting",
    });
  });

  it("collapses leading, trailing and doubled whitespace in the joined q", () => {
    expect(
      buildQueryParams({ tag: TEXT_TAG, text: "  sting   nothing  " }),
    ).toStrictEqual({ q: "qsound sting nothing" });
  });

  it("produces no q at all for a format tag whose text is whitespace only", () => {
    expect(buildQueryParams({ tag: FORMAT_TAG, text: "   " })).toStrictEqual({
      format: "SACD",
    });
  });
});
