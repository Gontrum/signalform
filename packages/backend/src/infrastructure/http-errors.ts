/**
 * Shared HTTP error helpers for Fastify route handlers.
 *
 * Imperative shell utilities — may use Fastify types but no I/O of their own.
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { LmsError } from "../adapters/lms-client/index.js";
import {
  mapLmsErrorToHttpStatus,
  mapLmsErrorToErrorType,
} from "../features/playback/core/error-mappers.js";

/**
 * Map an LmsError to an HTTP response.
 *
 * Centralises the repeated pattern:
 *   statusCode = mapLmsErrorToHttpStatus(error)
 *   errorType  = mapLmsErrorToErrorType(error)
 *   log + send { error, message }
 *
 * @param reply        - Fastify reply
 * @param request      - Fastify request (for structured logging)
 * @param error        - The LmsError to report
 * @param getMessage   - Domain-specific user-friendly message getter
 * @param logMessage   - Short label for the log entry
 * @param extraContext - Optional extra fields added to the log object
 */
export const sendLmsError = (
  reply: FastifyReply,
  request: FastifyRequest,
  error: LmsError,
  getMessage: (e: LmsError) => string,
  logMessage: string,
  extraContext?: Record<string, unknown>,
): ReturnType<FastifyReply["send"]> => {
  const statusCode = mapLmsErrorToHttpStatus(error);
  const errorType = mapLmsErrorToErrorType(error);
  const message = getMessage(error);

  request.log.error(
    {
      ...extraContext,
      lmsErrorType: error.type,
      lmsErrorMessage: error.message,
      httpStatus: statusCode,
      errorType,
    },
    logMessage,
  );

  return reply.code(statusCode).send({ error: errorType, message });
};
