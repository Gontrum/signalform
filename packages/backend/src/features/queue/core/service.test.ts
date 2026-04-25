import { describe, expect, it } from "vitest";
import {
  createRemoveQueueCommand,
  createReorderQueueCommand,
} from "./service.js";

describe("createRemoveQueueCommand", () => {
  it("returns remove command for a valid queue index", () => {
    const result = createRemoveQueueCommand(3);

    expect(result).toEqual({
      ok: true,
      value: {
        type: "remove",
        trackIndex: 3,
      },
    });
  });

  it("rejects negative queue indexes", () => {
    const result = createRemoveQueueCommand(-1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({
        type: "InvalidInput",
        message: "trackIndex must be a non-negative integer",
      });
    }
  });
});

describe("createReorderQueueCommand", () => {
  it("returns reorder command for valid indexes", () => {
    const result = createReorderQueueCommand(1, 4);

    expect(result).toEqual({
      ok: true,
      value: {
        type: "reorder",
        fromIndex: 1,
        toIndex: 4,
      },
    });
  });

  it("rejects identical source and destination indexes", () => {
    const result = createReorderQueueCommand(2, 2);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({
        type: "InvalidInput",
        message: "fromIndex and toIndex must be different",
      });
    }
  });

  it("rejects out-of-range destination indexes", () => {
    const result = createReorderQueueCommand(2, 10000);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({
        type: "InvalidInput",
        message: "toIndex must be a non-negative integer",
      });
    }
  });
});
