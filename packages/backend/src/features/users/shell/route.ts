import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Result } from "@signalform/shared";
import {
  loadConfig,
  saveConfig,
} from "../../../infrastructure/config/index.js";
import type {
  AppConfig,
  UserProfile,
} from "../../../infrastructure/config/index.js";
import {
  addUser,
  findUserById,
  maskUsers,
  removeUser,
  renameUser,
  type UsersError,
} from "../core/service.js";
import { getActiveListenerId, setActiveListenerId } from "./active-listener.js";

const NameBodySchema = z.object({
  name: z.string(),
});

const ActiveBodySchema = z.object({
  userId: z.string().min(1),
});

const usersErrorStatus = (error: UsersError): 400 | 404 =>
  error.type === "USER_NOT_FOUND" ? 404 : 400;

/**
 * Validates a `{ name }` request body and loads the current config. Sends
 * the appropriate error response itself and returns `undefined` on failure
 * — shared by the create and rename routes below.
 */
const resolveNameBodyAndConfig = (
  request: FastifyRequest<{ readonly Body: unknown }>,
  reply: FastifyReply,
): { readonly name: string; readonly config: AppConfig } | undefined => {
  const validation = NameBodySchema.safeParse(request.body);
  if (!validation.success) {
    reply.code(400).send({ error: "Invalid request body" });
    return undefined;
  }

  const configResult = loadConfig();
  if (!configResult.ok) {
    reply.code(500).send({ error: "Failed to load configuration" });
    return undefined;
  }

  return { name: validation.data.name, config: configResult.value };
};

/**
 * Applies a users-list mutation result: sends the mapped error response on
 * failure, otherwise persists the updated config and returns it. Shared by
 * the create, rename, and delete routes below.
 */
const applyUsersMutation = (
  reply: FastifyReply,
  config: AppConfig,
  result: Result<readonly UserProfile[], UsersError>,
): AppConfig | undefined => {
  if (!result.ok) {
    reply
      .code(usersErrorStatus(result.error))
      .send({ error: result.error.message });
    return undefined;
  }

  const updatedConfig = { ...config, users: result.value };
  const saveResult = saveConfig(updatedConfig);
  if (!saveResult.ok) {
    reply.code(500).send({ error: "Failed to save configuration" });
    return undefined;
  }

  return updatedConfig;
};

export const createUsersRoute = (server: FastifyInstance): void => {
  server.get("/api/users", async (_request: FastifyRequest, reply) => {
    const configResult = loadConfig();
    if (!configResult.ok) {
      return reply.code(500).send({ error: "Failed to load configuration" });
    }

    const activeListenerId = getActiveListenerId();
    return reply.code(200).send({
      users: maskUsers(configResult.value.users),
      ...(activeListenerId !== undefined ? { activeListenerId } : {}),
    });
  });

  server.post<{ readonly Body: unknown }>(
    "/api/users",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const resolved = resolveNameBodyAndConfig(request, reply);
      if (resolved === undefined) {
        return reply;
      }

      const { name, config } = resolved;
      const id = randomUUID();
      const result = addUser(config.users, name, id);
      const updatedConfig = applyUsersMutation(reply, config, result);
      if (updatedConfig === undefined) {
        return reply;
      }

      return reply.code(201).send({ id, name: name.trim() });
    },
  );

  // Registered before /api/users/:id so the static segment cannot be
  // captured as an id parameter.
  server.put<{ readonly Body: unknown }>(
    "/api/users/active",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = ActiveBodySchema.safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send({ error: "Invalid request body" });
      }

      const configResult = loadConfig();
      if (!configResult.ok) {
        return reply.code(500).send({ error: "Failed to load configuration" });
      }

      const { userId } = validation.data;
      if (findUserById(configResult.value.users, userId) === undefined) {
        return reply.code(400).send({ error: `No user with id "${userId}"` });
      }

      setActiveListenerId(userId);
      return reply.code(204).send();
    },
  );

  server.put<{
    readonly Body: unknown;
    readonly Params: { readonly id: string };
  }>(
    "/api/users/:id",
    async (
      request: FastifyRequest<{
        readonly Body: unknown;
        readonly Params: { readonly id: string };
      }>,
      reply: FastifyReply,
    ) => {
      const resolved = resolveNameBodyAndConfig(request, reply);
      if (resolved === undefined) {
        return reply;
      }

      const { name, config } = resolved;
      const result = renameUser(config.users, request.params.id, name);
      const updatedConfig = applyUsersMutation(reply, config, result);
      if (updatedConfig === undefined) {
        return reply;
      }

      return reply.code(200).send({ id: request.params.id, name: name.trim() });
    },
  );

  server.delete<{ readonly Params: { readonly id: string } }>(
    "/api/users/:id",
    async (
      request: FastifyRequest<{ readonly Params: { readonly id: string } }>,
      reply: FastifyReply,
    ) => {
      const configResult = loadConfig();
      if (!configResult.ok) {
        return reply.code(500).send({ error: "Failed to load configuration" });
      }

      const config = configResult.value;
      const result = removeUser(config.users, request.params.id);
      const updatedConfig = applyUsersMutation(reply, config, result);
      if (updatedConfig === undefined) {
        return reply;
      }

      if (getActiveListenerId() === request.params.id) {
        setActiveListenerId(undefined);
      }

      return reply.code(204).send();
    },
  );
};
