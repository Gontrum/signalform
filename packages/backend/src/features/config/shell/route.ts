import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  loadConfig,
  saveConfig,
} from "../../../infrastructure/config/index.js";
import type { AppConfig } from "../../../infrastructure/config/index.js";
import { maskConfig, mergeConfigUpdate } from "../core/service.js";

const ConfigUpdateSchema = z.object({
  lmsHost: z.string().min(1).optional(),
  lmsPort: z.coerce.number().int().min(1).max(65535).optional(),
  playerId: z.string().min(1).optional(),
  lastFmApiKey: z.string().optional(),
  fanartApiKey: z.string().optional(),
  language: z.enum(["en", "de"]).optional(),
});

export const createConfigRoute = (
  server: FastifyInstance,
  onConfigSaved?: (newConfig: AppConfig) => void,
): void => {
  server.get(
    "/api/config",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const result = loadConfig();
      if (!result.ok) {
        server.log.error(
          { event: "config_api_get_failed", error: result.error },
          "Failed to load config",
        );
        return reply.code(500).send({
          message: "Failed to load configuration",
          code: "CONFIG_ERROR",
        });
      }

      server.log.info({ event: "config_api_get" }, "Config read via API");
      return reply.code(200).send(maskConfig(result.value));
    },
  );

  server.put<{ readonly Body: unknown }>(
    "/api/config",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = ConfigUpdateSchema.safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send({
          message: "Invalid config fields",
          code: "VALIDATION_ERROR",
          details: validation.error.issues,
        });
      }

      const existing = loadConfig();
      if (!existing.ok) {
        return reply.code(500).send({
          message: "Failed to load existing config",
          code: "CONFIG_ERROR",
        });
      }

      const merged = mergeConfigUpdate(existing.value, validation.data);

      const saveResult = saveConfig(merged);
      if (!saveResult.ok) {
        server.log.error(
          { event: "config_api_update_failed", error: saveResult.error },
          "Failed to save config",
        );
        return reply.code(500).send({
          message: "Failed to save configuration",
          code: "SAVE_ERROR",
        });
      }

      server.log.info(
        {
          event: "config_api_update",
          lmsHost: merged.lmsHost,
          lmsPort: merged.lmsPort,
          playerId: merged.playerId,
          language: merged.language,
        },
        "Config updated via API",
      );

      onConfigSaved?.(merged);

      return reply.code(200).send(maskConfig(merged));
    },
  );
};
