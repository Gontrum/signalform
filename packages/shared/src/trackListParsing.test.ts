import { describe, expect, it } from "vitest";
import { parseTrackList } from "./trackListParsing.js";

describe("parseTrackList", () => {
  it("parses an Exportify-style CSV with ~20 columns, matching by header name not position", () => {
    const header =
      "Spotify ID,Artist IDs,Track Name,Album Name,Artist Name(s),Release Date,Duration (ms),Popularity,Added By,Added At,Genres,Danceability,Energy,Key,Loudness,Mode,Speechiness,Acousticness,Instrumentalness,Liveness,Valence,Tempo";
    const row =
      "abc123,def456,Stairway to Heaven,Led Zeppelin IV,Led Zeppelin,1971-11-08,482000,80,someone,2021-01-01,rock,0.3,0.4,0,1,1,0.03,0.5,0.6,0.1,0.2,80";
    const result = parseTrackList(`${header}\n${row}`);

    expect(result.tracks).toEqual([
      { artist: "Led Zeppelin", name: "Stairway to Heaven" },
    ]);
    expect(result.skippedLines).toBe(0);
  });

  it("keeps a quoted CSV artist with an embedded comma whole", () => {
    const csv = [
      "Artist Name(s),Track Name",
      '"Earth, Wind & Fire",September',
    ].join("\n");
    const result = parseTrackList(csv);

    expect(result.tracks).toEqual([
      { artist: "Earth, Wind & Fire", name: "September" },
    ]);
  });

  it("resolves a doubled quote inside a quoted CSV field to one literal quote", () => {
    const csv = [
      "Artist Name(s),Track Name",
      '"Say ""Yes""",Confirmation',
    ].join("\n");
    const result = parseTrackList(csv);

    expect(result.tracks).toEqual([
      { artist: 'Say "Yes"', name: "Confirmation" },
    ]);
  });

  it("recognizes a CSV header in mixed case", () => {
    const csv = ["ARTIST NAME,TRACK NAME", "Daft Punk,One More Time"].join(
      "\n",
    );
    const result = parseTrackList(csv);

    expect(result.tracks).toEqual([
      { artist: "Daft Punk", name: "One More Time" },
    ]);
  });

  it("recognizes a TuneMyMusic-shaped CSV", () => {
    const csv = [
      "Artist,Track name,Album",
      "Radiohead,Karma Police,OK Computer",
    ].join("\n");
    const result = parseTrackList(csv);

    expect(result.tracks).toEqual([
      { artist: "Radiohead", name: "Karma Police" },
    ]);
  });

  it("extracts title from #EXTINF lines and discards other m3u lines", () => {
    const m3u = [
      "#EXTM3U",
      "#EXTINF:312,Led Zeppelin - Stairway to Heaven",
      "/music/led-zeppelin/stairway.flac",
      "#EXTINF:180,Daft Punk - One More Time",
      "/music/daft-punk/one-more-time.flac",
    ].join("\n");
    const result = parseTrackList(m3u);

    expect(result.tracks).toEqual([
      { artist: "Led Zeppelin", name: "Stairway to Heaven" },
      { artist: "Daft Punk", name: "One More Time" },
    ]);
    expect(result.skippedLines).toBe(0);
  });

  it("parses a plain Artist - Title line", () => {
    const result = parseTrackList("Pink Floyd - Wish You Were Here");

    expect(result.tracks).toEqual([
      { artist: "Pink Floyd", name: "Wish You Were Here" },
    ]);
  });

  it("splits at the first separator, not the last, for a title containing a hyphen", () => {
    const result = parseTrackList("Neil Young - Cowgirl in the Sand - Live");

    expect(result.tracks).toEqual([
      { artist: "Neil Young", name: "Cowgirl in the Sand - Live" },
    ]);
  });

  it("recognizes an en dash as the separator", () => {
    const result = parseTrackList("Miles Davis – So What");

    expect(result.tracks).toEqual([{ artist: "Miles Davis", name: "So What" }]);
  });

  it("strips a '1. ' numbering prefix", () => {
    const result = parseTrackList("1. The Beatles - Let It Be");

    expect(result.tracks).toEqual([
      { artist: "The Beatles", name: "Let It Be" },
    ]);
  });

  it("strips a '01 - ' numbering prefix without corrupting the artist", () => {
    const result = parseTrackList("01 - Fleetwood Mac - Dreams");

    expect(result.tracks).toEqual([
      { artist: "Fleetwood Mac", name: "Dreams" },
    ]);
  });

  it("counts a line with no separator as skipped and produces no track", () => {
    const result = parseTrackList("just some random text with no separator");

    expect(result.tracks).toEqual([]);
    expect(result.skippedLines).toBe(1);
  });

  it("does not count blank lines interspersed between valid lines", () => {
    const result = parseTrackList(
      "Air - La Femme d'Argent\n\n\nMassive Attack - Teardrop\n",
    );

    expect(result.tracks).toEqual([
      { artist: "Air", name: "La Femme d'Argent" },
      { artist: "Massive Attack", name: "Teardrop" },
    ]);
    expect(result.skippedLines).toBe(0);
  });

  it("treats \\r\\n line endings the same as \\n", () => {
    const result = parseTrackList(
      "Air - La Femme d'Argent\r\nMassive Attack - Teardrop\r\n",
    );

    expect(result.tracks).toEqual([
      { artist: "Air", name: "La Femme d'Argent" },
      { artist: "Massive Attack", name: "Teardrop" },
    ]);
  });

  it("strips a leading BOM so it does not leak into the first artist", () => {
    const result = parseTrackList("﻿Air - La Femme d'Argent");

    expect(result.tracks).toEqual([
      { artist: "Air", name: "La Femme d'Argent" },
    ]);
    expect(result.tracks[0]?.artist.includes("﻿")).toBe(false);
  });

  it("deduplicates a track that reappears with different casing, keeping it once", () => {
    const result = parseTrackList(
      [
        "Air - La Femme d'Argent",
        "Massive Attack - Teardrop",
        "AIR - la femme d'argent",
      ].join("\n"),
    );

    expect(result.tracks).toEqual([
      { artist: "Air", name: "La Femme d'Argent" },
      { artist: "Massive Attack", name: "Teardrop" },
    ]);
  });

  it("keeps the first occurrence of a duplicate and preserves original order", () => {
    const result = parseTrackList(
      [
        "Portishead - Glory Box",
        "Massive Attack - Teardrop",
        "Portishead - glory box",
        "Air - La Femme d'Argent",
      ].join("\n"),
    );

    expect(result.tracks).toEqual([
      { artist: "Portishead", name: "Glory Box" },
      { artist: "Massive Attack", name: "Teardrop" },
      { artist: "Air", name: "La Femme d'Argent" },
    ]);
  });

  it("produces zero tracks and skips every line for fully unparseable text", () => {
    const result = parseTrackList("hello world\nno separator here either");

    expect(result.tracks).toEqual([]);
    expect(result.skippedLines).toBe(2);
  });

  it("returns an empty result for empty string input", () => {
    const result = parseTrackList("");

    expect(result.tracks).toEqual([]);
    expect(result.skippedLines).toBe(0);
  });
});
