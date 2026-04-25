/**
 * Tests for isTidalAlbumId — shared Tidal album ID detection utility.
 *
 * Story 9.2 (AC6): Single authoritative implementation in packages/shared.
 * Replaces duplicated logic from:
 *   - packages/frontend/src/views/AlbumDetailView.vue
 *   - packages/backend/src/features/playback/route.ts
 *
 * Live probe 2026-03-17: All verified Tidal album ID formats documented below.
 */

import { describe, it, expect } from "vitest";
import { isTidalAlbumId } from "./tidalUtils.js";

describe("isTidalAlbumId", () => {
  // ── TRUE cases: Tidal browse album IDs ──────────────────────────────────

  describe("dot-separated numeric IDs (regex /^\\d+(\\.\\d+)+$/)", () => {
    it('returns true for Tidal favorites album "4.0"', () => {
      expect(isTidalAlbumId("4.0")).toBe(true);
    });

    it('returns true for Tidal favorites album "4.1"', () => {
      expect(isTidalAlbumId("4.1")).toBe(true);
    });

    it('returns true for Tidal artist album "6.0.1.0"', () => {
      expect(isTidalAlbumId("6.0.1.0")).toBe(true);
    });

    it('returns true for Tidal artist album "6.0.1.4"', () => {
      expect(isTidalAlbumId("6.0.1.4")).toBe(true);
    });

    it('returns true for Tidal featured album "1.0.1.0"', () => {
      expect(isTidalAlbumId("1.0.1.0")).toBe(true);
    });

    it('returns true for Tidal recommendation album "0.1.0" (item_id:0 area, verified 2026-03-17)', () => {
      expect(isTidalAlbumId("0.1.0")).toBe(true);
    });

    it('returns true for Tidal recommendation album "0.4.3" (item_id:0.4 — Albums you\'ll like)', () => {
      expect(isTidalAlbumId("0.4.3")).toBe(true);
    });

    it('returns true for Tidal genre album "8.1.1.0" (item_id:8.1.1 — Pop Albums, verified 2026-03-17)', () => {
      expect(isTidalAlbumId("8.1.1.0")).toBe(true);
    });

    it("returns true for two-segment ID", () => {
      expect(isTidalAlbumId("99.0")).toBe(true);
    });

    it("returns true for deeply nested ID", () => {
      expect(isTidalAlbumId("1.2.3.4.5")).toBe(true);
    });
  });

  describe('search-artist album IDs with "7_" prefix (Story 8.9 AC1)', () => {
    it('returns true for "7_sabrina carpenter.2.0.1.4" (verified live probe 2026-03-17)', () => {
      expect(isTidalAlbumId("7_sabrina carpenter.2.0.1.4")).toBe(true);
    });

    it('returns true for "7_coldplay.2.0.1.4"', () => {
      expect(isTidalAlbumId("7_coldplay.2.0.1.4")).toBe(true);
    });

    it('returns true for any "7_" prefix ID', () => {
      expect(isTidalAlbumId("7_query.2.0.1.0")).toBe(true);
    });

    it('returns false for "7_" alone (prefix with no query content — not a valid LMS browse ID)', () => {
      expect(isTidalAlbumId("7_")).toBe(false);
    });
  });

  // ── FALSE cases: Local and other non-Tidal IDs ──────────────────────────

  describe("local album IDs (LMS numeric integers)", () => {
    it('returns false for local album "92" (pure integer)', () => {
      expect(isTidalAlbumId("92")).toBe(false);
    });

    it('returns false for local album "42"', () => {
      expect(isTidalAlbumId("42")).toBe(false);
    });

    it('returns false for local album "1" (single digit)', () => {
      expect(isTidalAlbumId("1")).toBe(false);
    });

    it('returns false for local album "0" (zero)', () => {
      expect(isTidalAlbumId("0")).toBe(false);
    });

    it('returns false for "4" (no dot — local library ID, not Tidal "4.0")', () => {
      expect(isTidalAlbumId("4")).toBe(false);
    });
  });

  describe("non-ID strings", () => {
    it("returns false for empty string", () => {
      expect(isTidalAlbumId("")).toBe(false);
    });

    it('returns false for Tidal track URL "tidal://58990486.flc" (not a browse album ID)', () => {
      expect(isTidalAlbumId("tidal://58990486.flc")).toBe(false);
    });

    it('returns false for local file URL "file:///music/track.flac"', () => {
      expect(isTidalAlbumId("file:///music/track.flac")).toBe(false);
    });

    it('returns false for "local-album"', () => {
      expect(isTidalAlbumId("local-album")).toBe(false);
    });

    it('returns false for "artist::album" composite key (used in search service for grouping)', () => {
      expect(isTidalAlbumId("coldplay::parachutes")).toBe(false);
    });

    it('returns false for ".4.0" (no leading digit)', () => {
      expect(isTidalAlbumId(".4.0")).toBe(false);
    });
  });
});
