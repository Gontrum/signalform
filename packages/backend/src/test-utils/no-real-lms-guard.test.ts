import { describe, expect, it } from "vitest";
import { assertSafeTestLmsTarget } from "./no-real-lms-guard.js";

describe("assertSafeTestLmsTarget", () => {
  it("allows loopback addresses in all common input shapes", () => {
    const safeCases = [
      "localhost",
      "localhost:9000",
      "http://localhost:9000",
      "127.0.0.1",
      "127.0.0.1:9000",
      "http://127.0.0.1:9000",
      "[::1]:9000",
      "http://[::1]:9000",
    ] as const;

    safeCases.forEach((input) => {
      expect(() => assertSafeTestLmsTarget(input, "test")).not.toThrow();
    });
  });

  it("blocks private IPv4 addresses", () => {
    const privateCases = [
      "192.168.178.39",
      "192.168.178.39:9000",
      "http://192.168.178.39:9000",
      "10.0.0.20",
      "172.16.0.5",
    ] as const;

    privateCases.forEach((input) => {
      expect(() => assertSafeTestLmsTarget(input, "test")).toThrow(
        /Unsafe LMS target/,
      );
    });
  });

  it("blocks non-loopback hostnames", () => {
    expect(() =>
      assertSafeTestLmsTarget("http://lms.local:9000", "test"),
    ).toThrow(/Unsafe LMS target/);

    expect(() =>
      assertSafeTestLmsTarget("music.internal.example", "test"),
    ).toThrow(/Unsafe LMS target/);
  });

  it("blocks empty and invalid input", () => {
    expect(() => assertSafeTestLmsTarget("   ", "test")).toThrow(
      /Unsafe LMS target/,
    );
  });

  it("includes the input value and context label in the error message", () => {
    expect(() =>
      assertSafeTestLmsTarget(
        "http://192.168.1.10:9000",
        "my-integration-test",
      ),
    ).toThrowError(/192\.168\.1\.10/);

    expect(() =>
      assertSafeTestLmsTarget(
        "http://192.168.1.10:9000",
        "my-integration-test",
      ),
    ).toThrowError(/my-integration-test/);

    expect(() =>
      assertSafeTestLmsTarget(
        "http://192.168.1.10:9000",
        "my-integration-test",
      ),
    ).toThrowError(/loopback/);
  });
});
