import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  loadConfig,
  saveConfig,
} from "../../../infrastructure/config/index.js";
import type { AppConfig } from "../../../infrastructure/config/index.js";
import { buildAuthUrl, buildSignature } from "../index.js";

const CompleteBodySchema = z.object({
  token: z.string().min(1),
});

type LastFmTokenResponse = {
  readonly token: string;
};

type LastFmSessionResponse = {
  readonly session: {
    readonly key: string;
    readonly name: string;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isLastFmTokenResponse = (
  value: unknown,
): value is LastFmTokenResponse => {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value["token"] === "string";
};

const isLastFmSessionResponse = (
  value: unknown,
): value is LastFmSessionResponse => {
  if (!isRecord(value)) {
    return false;
  }
  const session = value["session"];
  if (!isRecord(session)) {
    return false;
  }
  return (
    typeof session["key"] === "string" && typeof session["name"] === "string"
  );
};

export const createLastFmAuthRoute = (
  server: FastifyInstance,
  onConfigChange: (config: AppConfig) => void,
): void => {
  server.get(
    "/api/lastfm/auth/request",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const configResult = loadConfig();
      if (!configResult.ok) {
        return reply.code(500).send({ error: "Failed to load configuration" });
      }

      const config = configResult.value;
      const apiKey = config.lastFmApiKey;

      if (!apiKey) {
        return reply.code(400).send({ error: "No Last.fm API key configured" });
      }

      try {
        const response = await fetch(
          `https://ws.audioscrobbler.com/2.0/?method=auth.getToken&api_key=${encodeURIComponent(apiKey)}&format=json`,
          { signal: AbortSignal.timeout(10_000) },
        );

        if (!response.ok) {
          return reply
            .code(502)
            .send({ error: "Failed to obtain Last.fm auth token" });
        }

        const raw: unknown = await response.json();

        if (!isLastFmTokenResponse(raw)) {
          return reply
            .code(502)
            .send({ error: "Failed to obtain Last.fm auth token" });
        }

        const token = raw.token;
        const authUrl = buildAuthUrl(apiKey, token);

        return reply.code(200).send({ token, authUrl });
      } catch {
        return reply
          .code(502)
          .send({ error: "Failed to obtain Last.fm auth token" });
      }
    },
  );

  server.post<{ readonly Body: unknown }>(
    "/api/lastfm/auth/complete",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = CompleteBodySchema.safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send({ error: "Invalid request body" });
      }

      const configResult = loadConfig();
      if (!configResult.ok) {
        return reply.code(500).send({ error: "Failed to load configuration" });
      }

      const config = configResult.value;
      const apiKey = config.lastFmApiKey;
      const sharedSecret = config.lastFmSharedSecret;

      if (!apiKey || !sharedSecret) {
        return reply
          .code(400)
          .send({ error: "Last.fm API key and shared secret are required" });
      }

      const { token } = validation.data;
      const params = { method: "auth.getSession", api_key: apiKey, token };
      const sig = buildSignature(params, sharedSecret);

      try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=auth.getSession&api_key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}&api_sig=${encodeURIComponent(sig)}&format=json`;
        const response = await fetch(url, {
          signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
          return reply
            .code(502)
            .send({ error: "Failed to complete Last.fm authentication" });
        }

        const raw: unknown = await response.json();

        if (!isLastFmSessionResponse(raw)) {
          return reply
            .code(502)
            .send({ error: "Failed to complete Last.fm authentication" });
        }

        const { key: sessionKey, name: username } = raw.session;

        const updatedConfig: AppConfig = {
          ...config,
          lastFmSessionKey: sessionKey,
          lastFmUsername: username,
        };

        const saveResult = saveConfig(updatedConfig);
        if (!saveResult.ok) {
          return reply
            .code(500)
            .send({ error: "Failed to save configuration" });
        }

        onConfigChange(updatedConfig);

        return reply.code(200).send({ username });
      } catch {
        return reply
          .code(502)
          .send({ error: "Failed to complete Last.fm authentication" });
      }
    },
  );

  server.delete(
    "/api/lastfm/auth",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const configResult = loadConfig();
      if (!configResult.ok) {
        return reply.code(500).send({ error: "Failed to load configuration" });
      }

      const config = configResult.value;

      const updatedConfig: AppConfig = {
        ...config,
        lastFmSessionKey: undefined,
        scrobblingEnabled: false,
      };

      const saveResult = saveConfig(updatedConfig);
      if (!saveResult.ok) {
        return reply.code(500).send({ error: "Failed to save configuration" });
      }

      onConfigChange(updatedConfig);

      return reply.code(204).send();
    },
  );
};
