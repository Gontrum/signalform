import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { LmsClient } from "../../../adapters/lms-client/index.js";
import type { LastFmClient } from "../../../adapters/lastfm-client/index.js";
import { buildArtistRadioSeeds } from "../core/service.js";
import { normalizeArtist } from "../../../infrastructure/normalizeArtist.js";

const StartArtistRadioBodySchema = z.object({
  artistName: z.string().trim().min(1, "Artist name is required"),
});

export const createArtistRadioRoute = (
  fastify: FastifyInstance,
  lmsClient: LmsClient,
  lastFmClient: LastFmClient,
): void => {
  fastify.post<{ readonly Body: unknown }>(
    "/api/artist-radio/start",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const bodyValidation = StartArtistRadioBodySchema.safeParse(request.body);
      if (!bodyValidation.success) {
        return reply
          .code(400)
          .send({ message: "Artist name is required", code: "INVALID_INPUT" });
      }

      const { artistName } = bodyValidation.data;

      const [artistTopTracksResult, similarArtistsResult] = await Promise.all([
        lastFmClient.getArtistTopTracks(artistName, 4),
        lastFmClient.getSimilarArtists(artistName, 8),
      ]);

      if (!artistTopTracksResult.ok && !similarArtistsResult.ok) {
        return reply.code(503).send({
          message: "last.fm not reachable",
          code: "LASTFM_UNAVAILABLE",
        });
      }

      const seedArtistTopTracks = artistTopTracksResult.ok
        ? artistTopTracksResult.value
        : [];
      const similarArtists = similarArtistsResult.ok
        ? similarArtistsResult.value
        : [];

      const similarArtistTopTracksEntries = await Promise.all(
        similarArtists.map(async (a) => {
          const r = await lastFmClient.getArtistTopTracks(a.name, 2);
          return [a.name, r.ok ? r.value : []] as const;
        }),
      );
      const similarArtistTopTracks = new Map(similarArtistTopTracksEntries);

      const seeds = buildArtistRadioSeeds(
        seedArtistTopTracks,
        artistName,
        similarArtists,
        similarArtistTopTracks,
      );

      if (seeds.length === 0) {
        return reply.code(404).send({
          message: "No tracks found for this artist",
          code: "NOT_FOUND",
        });
      }

      const searchResults = await Promise.all(
        seeds.map(async (seed) => {
          const query =
            seed.name !== "" ? `${seed.artist} ${seed.name}` : seed.artist;
          const result = await lmsClient.search(query);
          if (!result.ok) {
            return undefined;
          }
          const norm = normalizeArtist(seed.artist);
          const match = result.value.tracks.find((t) => {
            const r = normalizeArtist(t.artist);
            return r.includes(norm) || norm.includes(r);
          });
          if (match !== undefined) {
            return match.url;
          }
          return undefined;
        }),
      );

      const playableUrls = [
        ...new Set(
          searchResults.filter(
            (u): u is string => typeof u === "string" && u.length > 0,
          ),
        ),
      ].slice(0, 12);

      if (playableUrls.length === 0) {
        return reply.code(404).send({
          message: "No playable tracks found in library",
          code: "NOT_FOUND",
        });
      }

      const firstUrl = playableUrls[0];
      if (firstUrl === undefined) {
        return reply.code(404).send({
          message: "No playable tracks found in library",
          code: "NOT_FOUND",
        });
      }

      const playResult = await lmsClient.play(firstUrl);
      if (!playResult.ok) {
        return reply.code(503).send({
          message: "LMS not reachable",
          code: "LMS_UNREACHABLE",
        });
      }

      await Promise.all(
        playableUrls.slice(1).map((url) => lmsClient.addToQueue(url)),
      );

      return reply
        .code(200)
        .send({ artistName, tracksAdded: playableUrls.length });
    },
  );
};
