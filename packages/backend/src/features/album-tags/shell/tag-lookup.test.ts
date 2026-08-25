import { describe, it, expect, beforeEach, vi } from "vitest";
import { err, ok, type TagDescriptor } from "@signalform/shared";
import {
  createDiscogsClient,
  type DiscogsClient,
} from "../../../adapters/discogs-client/index.js";
import { getTagCandidates } from "./tag-lookup.js";

type MockDiscogsClient = DiscogsClient & {
  readonly searchReleases: ReturnType<
    typeof vi.fn<DiscogsClient["searchReleases"]>
  >;
};

const createMockDiscogsClient = (): MockDiscogsClient => ({
  ...createDiscogsClient(),
  searchReleases: vi
    .fn<DiscogsClient["searchReleases"]>()
    .mockResolvedValue(ok({ results: [], totalItems: 0 })),
});

const tagWithId = (id: string): TagDescriptor => ({
  id,
  label: id.toUpperCase(),
  mode: "text",
  term: id,
});

describe("getTagCandidates", () => {
  let discogsClient: MockDiscogsClient;

  beforeEach(() => {
    discogsClient = createMockDiscogsClient();
  });

  it("passes the tag descriptor and the normalised text to the Discogs client", async () => {
    const tag = tagWithId("lookup-pass-through");

    await getTagCandidates(discogsClient, tag, "  The   Police  ");

    expect(discogsClient.searchReleases).toHaveBeenCalledWith({
      tag,
      text: "the police",
    });
  });

  it("omits text entirely when the request carries none", async () => {
    const tag = tagWithId("lookup-no-text");

    await getTagCandidates(discogsClient, tag, "");

    expect(discogsClient.searchReleases).toHaveBeenCalledWith({ tag });
  });

  it("returns candidates parsed from the results and the untouched totalItems", async () => {
    discogsClient.searchReleases.mockResolvedValue(
      ok({
        results: [
          { title: "Zapp - Zapp II", year: 1982 },
          { title: "no separator here", year: 1999 },
          { title: "Amerie - All I Have", year: 2002 },
        ],
        totalItems: 16005,
      }),
    );

    const result = await getTagCandidates(
      discogsClient,
      tagWithId("lookup-shape"),
      "",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.candidates).toEqual([
        { artist: "Zapp", title: "Zapp II", year: 1982 },
        { artist: "Amerie", title: "All I Have", year: 2002 },
      ]);
      expect(result.value.totalItems).toBe(16005);
    }
  });

  it("serves a repeat of the same tag and text from the cache", async () => {
    const tag = tagWithId("lookup-cache-hit");
    discogsClient.searchReleases.mockResolvedValue(
      ok({ results: [{ title: "Zapp - Zapp II", year: 1982 }], totalItems: 9 }),
    );

    const first = await getTagCandidates(discogsClient, tag, "sting");
    const second = await getTagCandidates(discogsClient, tag, "sting");

    expect(discogsClient.searchReleases).toHaveBeenCalledTimes(1);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.value).toEqual({
        candidates: [{ artist: "Zapp", title: "Zapp II", year: 1982 }],
        totalItems: 9,
      });
      expect(second.value).toEqual(first.value);
    }
  });

  it("treats text differing only in case and spacing as the same cache key", async () => {
    const tag = tagWithId("lookup-cache-normalised");

    await getTagCandidates(discogsClient, tag, "The  Police");
    await getTagCandidates(discogsClient, tag, "  the police  ");

    expect(discogsClient.searchReleases).toHaveBeenCalledTimes(1);
  });

  it("queries the normalised text, not the casing that arrived first", async () => {
    const tag = tagWithId("lookup-cache-key-matches-request");

    await getTagCandidates(discogsClient, tag, "Sting");
    await getTagCandidates(discogsClient, tag, "sting");

    expect(discogsClient.searchReleases).toHaveBeenCalledTimes(1);
    expect(discogsClient.searchReleases).toHaveBeenCalledWith({
      tag,
      text: "sting",
    });
  });

  it("never serves a cached tag-only result for a tag-plus-text request", async () => {
    const tag = tagWithId("lookup-two-coordinates");
    discogsClient.searchReleases.mockResolvedValue(
      ok({
        results: [
          { title: "Zapp - Zapp II", year: 1982 },
          { title: "Amerie - All I Have", year: 2002 },
          { title: "Madonna - The Immaculate Collection", year: 1990 },
        ],
        totalItems: 249,
      }),
    );
    await getTagCandidates(discogsClient, tag, "");

    discogsClient.searchReleases.mockResolvedValue(
      ok({
        results: [{ title: "Sting - The Soul Cages", year: 1991 }],
        totalItems: 41,
      }),
    );
    const narrowed = await getTagCandidates(discogsClient, tag, "sting");

    expect(discogsClient.searchReleases).toHaveBeenCalledTimes(2);
    expect(discogsClient.searchReleases).toHaveBeenLastCalledWith({
      tag,
      text: "sting",
    });
    expect(narrowed.ok).toBe(true);
    if (narrowed.ok) {
      expect(narrowed.value.candidates).toEqual([
        { artist: "Sting", title: "The Soul Cages", year: 1991 },
      ]);
      expect(narrowed.value.totalItems).toBe(41);
    }
  });

  it("keeps different tags with the same text apart", async () => {
    await getTagCandidates(
      discogsClient,
      tagWithId("lookup-tag-a"),
      "same text",
    );
    await getTagCandidates(
      discogsClient,
      tagWithId("lookup-tag-b"),
      "same text",
    );

    expect(discogsClient.searchReleases).toHaveBeenCalledTimes(2);
  });

  it("maps a Discogs failure to DiscogsUnavailable and never caches it", async () => {
    const tag = tagWithId("lookup-failure");
    discogsClient.searchReleases.mockResolvedValue(
      err({ type: "NetworkError", message: "Discogs unreachable" }),
    );

    const failed = await getTagCandidates(discogsClient, tag, "");
    expect(failed.ok).toBe(false);
    if (!failed.ok) {
      expect(failed.error).toEqual({
        type: "DiscogsUnavailable",
        message: "Discogs unreachable",
      });
    }

    discogsClient.searchReleases.mockResolvedValue(
      ok({
        results: [{ title: "Zapp - Zapp II", year: 1982 }],
        totalItems: 3,
      }),
    );
    const recovered = await getTagCandidates(discogsClient, tag, "");

    expect(discogsClient.searchReleases).toHaveBeenCalledTimes(2);
    expect(recovered.ok).toBe(true);
    if (recovered.ok) {
      expect(recovered.value.totalItems).toBe(3);
    }
  });
});
