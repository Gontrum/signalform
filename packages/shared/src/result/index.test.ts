import { describe, it, expect } from "vitest";
import {
  ok,
  err,
  isOk,
  isErr,
  map,
  flatMap,
  mapErr,
  unwrap,
  unwrapOr,
  fromThrowable,
} from "./index.js";

describe("Result Type", () => {
  describe("Constructors", () => {
    it("ok() creates success Result", () => {
      const result = ok(42);
      expect(result).toEqual({ ok: true, value: 42 });
    });

    it("err() creates error Result", () => {
      const result = err("error message");
      expect(result).toEqual({ ok: false, error: "error message" });
    });
  });

  describe("Type Guards", () => {
    it("isOk() returns true for success Result", () => {
      const result = ok(42);
      expect(isOk(result)).toBe(true);
    });

    it("isOk() returns false for error Result", () => {
      const result = err("error");
      expect(isOk(result)).toBe(false);
    });

    it("isErr() returns true for error Result", () => {
      const result = err("error");
      expect(isErr(result)).toBe(true);
    });

    it("isErr() returns false for success Result", () => {
      const result = ok(42);
      expect(isErr(result)).toBe(false);
    });
  });

  describe("map()", () => {
    it("transforms success value", () => {
      const result = ok(42);
      const mapped = map(result, (x) => x * 2);
      expect(mapped).toEqual({ ok: true, value: 84 });
    });

    it("preserves error without calling function", () => {
      const result = err("error");
      const mapped = map(result, (x: number) => x * 2);
      expect(mapped).toEqual({ ok: false, error: "error" });
    });
  });

  describe("flatMap()", () => {
    it("chains success Results", () => {
      const result = ok(42);
      const chained = flatMap(result, (x) => ok(x * 2));
      expect(chained).toEqual({ ok: true, value: 84 });
    });

    it("chains to error Result", () => {
      const result = ok(42);
      const chained = flatMap(result, () => err("inner error"));
      expect(chained).toEqual({ ok: false, error: "inner error" });
    });

    it("preserves error without calling function", () => {
      const result = err("outer error");
      const chained = flatMap(result, (x: number) => ok(x * 2));
      expect(chained).toEqual({ ok: false, error: "outer error" });
    });
  });

  describe("mapErr()", () => {
    it("transforms error value", () => {
      const result = err("error");
      const mapped = mapErr(result, (e) => e.toUpperCase());
      expect(mapped).toEqual({ ok: false, error: "ERROR" });
    });

    it("preserves success without calling function", () => {
      const result = ok(42);
      const mapped = mapErr(result, (e: string) => e.toUpperCase());
      expect(mapped).toEqual({ ok: true, value: 42 });
    });
  });

  describe("unwrap()", () => {
    it("returns value on success", () => {
      const result = ok(42);
      expect(unwrap(result)).toBe(42);
    });

    it("throws on error", () => {
      const result = err("error");
      expect(() => unwrap(result)).toThrow("Called unwrap on an error Result");
    });
  });

  describe("unwrapOr()", () => {
    it("returns value on success", () => {
      const result = ok(42);
      expect(unwrapOr(result, 0)).toBe(42);
    });

    it("returns default on error", () => {
      const result = err("error");
      expect(unwrapOr(result, 0)).toBe(0);
    });
  });

  describe("fromThrowable()", () => {
    it("returns ok when function succeeds", () => {
      const result = fromThrowable(
        () => 42,
        () => "error",
      );
      expect(result).toEqual({ ok: true, value: 42 });
    });

    it("returns err when function throws", () => {
      const result = fromThrowable(
        () => {
          // eslint-disable-next-line functional/no-throw-statements -- test exercising fromThrowable's error path
          throw new Error("boom");
        },
        (error) => (error instanceof Error ? error.message : "unknown"),
      );

      expect(result).toEqual({ ok: false, error: "boom" });
    });
  });
});
