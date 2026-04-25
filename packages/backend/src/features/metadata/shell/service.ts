import { ok, err, type Result } from "@signalform/shared";
import type {
  LmsClient,
  LmsConfig,
} from "../../../adapters/lms-client/index.js";
import { buildAlbumDetail, buildArtistDetail } from "../core/service.js";
import type {
  AlbumDetail,
  AlbumServiceError,
  ArtistDetail,
  ArtistServiceError,
} from "../core/types.js";

export const getAlbumDetail = async (
  albumId: string,
  lmsClient: LmsClient,
  config: LmsConfig,
): Promise<Result<AlbumDetail, AlbumServiceError>> => {
  const tracksResult = await lmsClient.getAlbumTracks(albumId);

  if (!tracksResult.ok) {
    return err({ type: "LmsError", message: tracksResult.error.message });
  }

  const tracks = tracksResult.value;

  if (tracks.length === 0) {
    return err({
      type: "NotFound",
      message: `Album ${albumId} not found or has no tracks`,
    });
  }

  const baseUrl = `http://${config.host}:${config.port}`;

  return ok(buildAlbumDetail(albumId, tracks, baseUrl));
};

export const getArtistDetail = async (
  artistId: string,
  lmsClient: LmsClient,
  config: LmsConfig,
): Promise<Result<ArtistDetail, ArtistServiceError>> => {
  // Fetch artist name and albums concurrently.
  // getArtistName uses the LMS artists command (authoritative name source).
  // getArtistAlbums uses the albums command — its artist tag may show "Diverse Interpreten"
  // for compilation albums, which is why we prefer the direct name lookup.
  const [nameResult, albumsResult] = await Promise.all([
    lmsClient.getArtistName(artistId),
    lmsClient.getArtistAlbums(artistId),
  ]);

  if (!albumsResult.ok) {
    return err({ type: "LmsError", message: albumsResult.error.message });
  }

  const albums = albumsResult.value;

  if (albums.length === 0) {
    return err({
      type: "NotFound",
      message: `Artist ${artistId} not found or has no albums`,
    });
  }

  const baseUrl = `http://${config.host}:${config.port}`;

  return ok(
    buildArtistDetail(
      artistId,
      nameResult.ok ? nameResult.value : null,
      albums,
      baseUrl,
    ),
  );
};
