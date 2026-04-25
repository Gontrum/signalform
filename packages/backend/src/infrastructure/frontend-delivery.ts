import path from "node:path";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { FastifyInstance, FastifyReply } from "fastify";
import fastifyStatic from "@fastify/static";

const FRONTEND_DIST_SEGMENTS = ["..", "..", "..", "frontend", "dist"] as const;
const STATIC_PREFIXES = [
  "/assets/",
  "/favicon.ico",
  "/icon-192.png",
  "/icon-512.png",
  "/icon.svg",
  "/manifest.json",
  "/offline.html",
  "/registerSW.js",
  "/sw.js",
  "/workbox-",
] as const;
const RESERVED_PREFIXES = [
  "/api",
  "/health",
  "/socket.io",
  "/__vite_ping",
] as const;

const frontendDeliveryDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ...FRONTEND_DIST_SEGMENTS,
);

const resolveFrontendDistPath = (): string => {
  return (
    process.env["SIGNALFORM_FRONTEND_DIST_PATH"] || frontendDeliveryDirectory
  );
};

const sendAppShell = (reply: FastifyReply): FastifyReply => {
  return reply
    .header("Cache-Control", "no-store")
    .type("text/html; charset=utf-8")
    .sendFile("index.html");
};

const isReservedRoute = (url: string): boolean => {
  return RESERVED_PREFIXES.some((prefix) => {
    return url === prefix || url.startsWith(`${prefix}/`);
  });
};

const isStaticAssetRequest = (url: string): boolean => {
  return STATIC_PREFIXES.some((prefix) => {
    return url === prefix || url.startsWith(prefix);
  });
};

const getFrontendDistPath = (): string => resolveFrontendDistPath();

const hasFrontendBuild = async (): Promise<boolean> => {
  return access(resolveFrontendDistPath())
    .then(() => true)
    .catch(() => false);
};

export const registerFrontendDelivery = async (
  server: FastifyInstance,
): Promise<boolean> => {
  const distPath = getFrontendDistPath();
  const distExists = await hasFrontendBuild();

  if (!distExists) {
    server.log.info(
      {
        event: "frontend.delivery.skipped",
        frontendDistPath: distPath,
      },
      "Skipping built frontend delivery because dist output is missing",
    );
    return false;
  }

  await server.register(async (frontendServer) => {
    await frontendServer.register(fastifyStatic, {
      root: distPath,
      wildcard: false,
      decorateReply: true,
      serveDotFiles: false,
    });

    frontendServer.setNotFoundHandler(async (request, reply) => {
      if (isReservedRoute(request.url)) {
        reply.callNotFound();
        return;
      }

      if (isStaticAssetRequest(request.url)) {
        reply.callNotFound();
        return;
      }

      return sendAppShell(reply);
    });
  });

  server.log.info(
    {
      event: "frontend.delivery.registered",
      frontendDistPath: distPath,
    },
    "Serving built frontend shell from backend runtime",
  );

  return true;
};
