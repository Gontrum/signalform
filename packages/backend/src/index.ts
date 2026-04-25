import { createServer } from "./server.js";
import { createLogger } from "./infrastructure/logger.js";

const logger = createLogger();

// Catch unhandled rejections and exceptions before they silently kill the process.
// Node 15+ exits on unhandledRejection by default — log it first so we know what crashed.
process.on("unhandledRejection", (reason: unknown) => {
  logger.error("Unhandled promise rejection — process will exit", {
    event: "unhandled_rejection",
    reason: reason instanceof Error ? reason.stack : String(reason),
  });
  process.exit(1);
});

process.on("uncaughtException", (err: Error) => {
  logger.error("Uncaught exception — process will exit", {
    event: "uncaught_exception",
    error: err.stack,
  });
  process.exit(1);
});

const start = async (): Promise<void> => {
  const port = parseInt(process.env["PORT"] ?? "3001", 10);

  return createServer()
    .then(async (server) => {
      await server.listen({ port, host: "0.0.0.0" });
      logger.info("Backend server started", {
        event: "server.started",
        url: `http://localhost:${port}`,
      });
    })
    .catch((err: unknown) => {
      logger.error("Backend server failed to start", {
        event: "server.start_failed",
        error: err instanceof Error ? err.stack : String(err),
      });
      process.exit(1);
    });
};

void start();
