/**
 * LMS Execute Infrastructure
 *
 * Defines the ExecuteCommand type, ExecuteDeps type contract,
 * and the makeExecuteCommand / makeExecuteCommandWithRetry factories.
 * All domain factory functions depend on ExecuteDeps.
 */

import { ok, err, type Result } from "@signalform/shared";
import { z } from "zod";
import type {
  LmsConfig,
  LmsCommand,
  LmsRequest,
  LmsResponse,
  LmsError,
} from "./types.js";
import { withRetry } from "./retry.js";

export const isRecord = (
  value: unknown,
): value is Readonly<Record<string, unknown>> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isAbortSignal = (value: unknown): value is AbortSignal => {
  return (
    isRecord(value) &&
    "aborted" in value &&
    "addEventListener" in value &&
    typeof value["addEventListener"] === "function"
  );
};

const parseLmsError = (value: unknown): LmsResponse<unknown>["error"] => {
  if (value === null) {
    return null;
  }

  if (
    isRecord(value) &&
    typeof value["code"] === "number" &&
    typeof value["message"] === "string"
  ) {
    return {
      code: value["code"],
      message: value["message"],
    };
  }

  return null;
};

const parseLmsEnvelope = (
  value: unknown,
): Result<LmsResponse<unknown>, LmsError> => {
  if (!isRecord(value) || !("result" in value)) {
    return err({
      type: "JsonParseError",
      message: "Invalid LMS response envelope",
    });
  }

  return ok({
    result: value["result"],
    id: typeof value["id"] === "number" ? value["id"] : 0,
    error: parseLmsError(value["error"]),
  });
};

export type LmsResultParser<T> = (value: unknown) => Result<T, LmsError>;

export const createLmsResultParser = <T>(
  schema: z.ZodType<T>,
): LmsResultParser<T> => {
  return (value: unknown): Result<T, LmsError> => {
    const parseResult = schema.safeParse(value);
    if (!parseResult.success) {
      return err({
        type: "JsonParseError",
        message: "Invalid LMS result payload",
      });
    }

    return ok(parseResult.data);
  };
};

/**
 * Type alias for a function that executes a single LMS JSON-RPC command.
 * Generic over T — the expected result payload shape.
 */
export type ExecuteCommand = {
  (
    command: LmsCommand,
    abortSignal?: AbortSignal,
  ): Promise<Result<unknown, LmsError>>;
  <T>(
    command: LmsCommand,
    parser: LmsResultParser<T>,
    abortSignal?: AbortSignal,
  ): Promise<Result<T, LmsError>>;
};

/**
 * Dependency bundle injected into all domain factory functions.
 * Downstream modules (search, playback, queue, …) receive ExecuteDeps
 * and must not access config, fetch, or retry logic directly.
 */
export type ExecuteDeps = {
  readonly executeCommand: ExecuteCommand;
  readonly executeCommandWithRetry: ExecuteCommand;
  readonly config: LmsConfig;
};

/**
 * Creates the executeCommand function bound to the given config.
 * Handles timeout, abort-signal chaining, JSON-RPC framing, and error mapping.
 */
export const makeExecuteCommand = (config: LmsConfig): ExecuteCommand => {
  const baseUrl = `http://${config.host}:${config.port}/jsonrpc.js`;

  const mapFetchError = (error: unknown): LmsError => {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        type: "TimeoutError",
        message: "LMS connection timeout (5s)",
      };
    }

    return {
      type: "NetworkError",
      message:
        error instanceof Error ? error.message : "Network request failed",
    };
  };

  const parseEnvelopeResult = async (
    response: Response,
  ): Promise<Result<LmsResponse<unknown>, LmsError>> => {
    return await response
      .json()
      .then<Result<LmsResponse<unknown>, LmsError>>((value: unknown) =>
        parseLmsEnvelope(value),
      )
      .catch<Result<LmsResponse<unknown>, LmsError>>((error: unknown) =>
        err({
          type:
            error instanceof SyntaxError ? "JsonParseError" : "NetworkError",
          message:
            error instanceof SyntaxError
              ? "Invalid JSON in LMS response"
              : error instanceof Error
                ? error.message
                : "Network request failed",
        }),
      );
  };

  /**
   * Execute JSON-RPC command on LMS.
   * @param command - LMS command tuple
   * @param abortSignal - Optional external abort signal (e.g. enrichment timeout)
   * @returns Result with response data or error
   */
  async function executeCommand(
    command: LmsCommand,
    abortSignal?: AbortSignal,
  ): Promise<Result<unknown, LmsError>>;
  async function executeCommand<T>(
    command: LmsCommand,
    parser: LmsResultParser<T>,
    abortSignal?: AbortSignal,
  ): Promise<Result<T, LmsError>>;
  async function executeCommand<T>(
    command: LmsCommand,
    parserOrAbortSignal?: AbortSignal | LmsResultParser<T>,
    maybeAbortSignal?: AbortSignal,
  ): Promise<Result<unknown, LmsError> | Result<T, LmsError>> {
    const parser =
      typeof parserOrAbortSignal === "function"
        ? parserOrAbortSignal
        : undefined;
    const abortSignal =
      parser !== undefined
        ? maybeAbortSignal
        : isAbortSignal(parserOrAbortSignal)
          ? parserOrAbortSignal
          : undefined;

    // Create AbortController with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);

    // Chain external signal: when caller aborts (e.g. enrichment 200ms cap fires),
    // propagate immediately to cancel the underlying fetch (M1 fix — no dangling requests).
    if (abortSignal !== undefined) {
      abortSignal.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        controller.abort();
      });
    }

    const request: LmsRequest = {
      method: "slim.request",
      params: [config.playerId, command],
      id: 1,
    };

    const responseResult = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
      .then<Result<Response, LmsError>>((response) => ok(response))
      .catch<Result<Response, LmsError>>((error: unknown) =>
        err(mapFetchError(error)),
      );

    clearTimeout(timeoutId);

    if (!responseResult.ok) {
      return responseResult;
    }

    const envelopeResult = await parseEnvelopeResult(responseResult.value);
    if (!envelopeResult.ok) {
      return envelopeResult;
    }

    const jsonResponse = envelopeResult.value;

    if (jsonResponse.error) {
      return err({
        type: "LmsApiError",
        code: jsonResponse.error.code,
        message: jsonResponse.error.message,
      });
    }

    if (parser === undefined) {
      return ok(jsonResponse.result);
    }

    return parser(jsonResponse.result);
  }

  return executeCommand;
};

/**
 * Creates the executeCommandWithRetry function.
 * Wraps executeCommand with exponential backoff retry on NetworkError / TimeoutError.
 * Backoff: 1s → 2s → 4s, max 3 attempts (base delay configurable via config.retryBaseDelayMs).
 */
export const makeExecuteCommandWithRetry = (
  executeCommand: ExecuteCommand,
  config: LmsConfig,
): ExecuteCommand => {
  function executeCommandWithRetry(
    command: LmsCommand,
    abortSignal?: AbortSignal,
  ): Promise<Result<unknown, LmsError>>;
  function executeCommandWithRetry<T>(
    command: LmsCommand,
    parser: LmsResultParser<T>,
    abortSignal?: AbortSignal,
  ): Promise<Result<T, LmsError>>;
  function executeCommandWithRetry<T>(
    command: LmsCommand,
    parserOrAbortSignal?: AbortSignal | LmsResultParser<T>,
    maybeAbortSignal?: AbortSignal,
  ): Promise<Result<unknown, LmsError> | Result<T, LmsError>> {
    return withRetry(
      () => {
        if (typeof parserOrAbortSignal === "function") {
          return executeCommand(command, parserOrAbortSignal, maybeAbortSignal);
        }

        return executeCommand(command, parserOrAbortSignal);
      },
      {
        maxAttempts: 3,
        baseDelayMs: config.retryBaseDelayMs ?? 1000,
      },
    );
  }

  return executeCommandWithRetry;
};
