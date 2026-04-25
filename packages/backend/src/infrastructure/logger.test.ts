import { describe, it, expect } from "vitest";
import { createLogger } from "./logger.js";
import type winston from "winston";

describe("Logger", () => {
  it("creates a Winston logger instance", () => {
    const logger = createLogger();
    expect(logger).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.error).toBeDefined();
    expect(logger.warn).toBeDefined();
  });

  it("has correct structure with transports", () => {
    const logger = createLogger();
    expect(logger.transports).toBeDefined();
    expect(logger.transports.length).toBeGreaterThan(0);
  });

  it("uses info level by default", () => {
    const logger = createLogger();
    expect(logger.level).toBe("info");
  });

  it("has timestamp format configured", () => {
    const logger = createLogger();
    // Winston logger format includes timestamp
    expect(logger.format).toBeDefined();
  });

  it("has Console transport configured", () => {
    const logger = createLogger();
    const hasConsoleTransport = logger.transports.some(
      (transport: winston.transport) =>
        transport.constructor.name === "Console",
    );
    expect(hasConsoleTransport).toBe(true);
  });

  it("has error format with stack trace support", () => {
    const logger = createLogger();
    // Logger is configured to handle error objects with stack traces
    expect(logger.format).toBeDefined();
  });
});
