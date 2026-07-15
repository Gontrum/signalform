import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  loadConfig,
  saveConfig,
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
      const validation = NameBodySchema.safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send({ error: "Invalid request body" });
      }

      const configResult = loadConfig();
      if (!configResult.ok) {
        return reply.code(500).send({ error: "Failed to load configuration" });
      }

      const config = configResult.value;
      const id = randomUUID();
      const result = addUser(config.users, validation.data.name, id);
      if (!result.ok) {
        return reply
          .code(usersErrorStatus(result.error))
          .send({ error: result.error.message });
      }

      const saveResult = saveConfig({ ...config, users: result.value });
      if (!saveResult.ok) {
        return reply.code(500).send({ error: "Failed to save configuration" });
      }

      return reply.code(201).send({ id, name: validation.data.name.trim() });
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
      const validation = NameBodySchema.safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send({ error: "Invalid request body" });
      }

      const configResult = loadConfig();
      if (!configResult.ok) {
        return reply.code(500).send({ error: "Failed to load configuration" });
      }

      const config = configResult.value;
      const result = renameUser(
        config.users,
        request.params.id,
        validation.data.name,
      );
      if (!result.ok) {
        return reply
          .code(usersErrorStatus(result.error))
          .send({ error: result.error.message });
      }

      const saveResult = saveConfig({ ...config, users: result.value });
      if (!saveResult.ok) {
        return reply.code(500).send({ error: "Failed to save configuration" });
      }

      return reply
        .code(200)
        .send({ id: request.params.id, name: validation.data.name.trim() });
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
      if (!result.ok) {
        return reply
          .code(usersErrorStatus(result.error))
          .send({ error: result.error.message });
      }

      const saveResult = saveConfig({ ...config, users: result.value });
      if (!saveResult.ok) {
        return reply.code(500).send({ error: "Failed to save configuration" });
      }

      if (getActiveListenerId() === request.params.id) {
        setActiveListenerId(undefined);
      }

      return reply.code(204).send();
    },
  );
};
