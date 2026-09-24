import { describe, it, expect } from "vitest";
import {
  extractSeasonNumber,
  matchBestSearchResult,
  normalizeTitle,
} from "../../src/titleMatcher.js";
import type { ProviderSearchResult } from "../../src/types.js";

describe("titleMatcher", () => {
  describe("normalizeTitle", () => {
    it("lowercases, normalizes apostrophes, and removes special chars", () => {
      expect(normalizeTitle("Sousou no Frieren: Beyond Journey's End")).toBe(
        "sousounofrierenbeyondjourneysend",
      );
      expect(normalizeTitle("Mushoku Tensei II: Isekai Ittara...")).toBe(
        "mushokutenseiiiisekaiittara",
      );
    });
  });

  describe("extractSeasonNumber", () => {
    it("extracts season numbers from various standard formats", () => {
      expect(extractSeasonNumber("Jujutsu Kaisen Season 2")).toBe(2);
      expect(extractSeasonNumber("Attack on Titan S3")).toBe(3);
      expect(extractSeasonNumber("Re:Zero 2nd Season")).toBe(2);
      expect(extractSeasonNumber("Overlord IV")).toBe(4);
      expect(extractSeasonNumber("Boku no Hero Academia 3rd Season")).toBe(3);
      expect(extractSeasonNumber("Frieren")).toBeNull();
    });
  });

  describe("matchBestSearchResult", () => {
    const candidates: ProviderSearchResult[] = [
      {
        identifier: "frieren-s1",
        name: "Sousou no Frieren",
        languages: ["sub", "dub"],
      },
      {
        identifier: "frieren-s2",
        name: "Sousou no Frieren Season 2",
        languages: ["sub"],
      },
      {
        identifier: "frieren-movie",
        name: "Sousou no Frieren Movie",
        languages: ["sub"],
      },
    ];

    it("returns null on empty candidates", async () => {
      expect(await matchBestSearchResult(["Frieren"], [])).toBeNull();
    });

    it("returns single candidate directly", async () => {
      expect(await matchBestSearchResult(["Frieren"], [candidates[0]])).toBe(
        candidates[0],
      );
    });

    it("finds exact normalized match", async () => {
      const match = await matchBestSearchResult(
        ["Sousou no Frieren"],
        candidates,
      );
      expect(match?.identifier).toBe("frieren-s1");
    });

    it("correctly matches Season 2 when requested", async () => {
      const match = await matchBestSearchResult(
        ["Sousou no Frieren 2nd Season", "Frieren Season 2"],
        candidates,
      );
      expect(match?.identifier).toBe("frieren-s2");
    });

    it("penalizes movies when looking for TV series", async () => {
      const match = await matchBestSearchResult(
        ["Sousou no Frieren"],
        [candidates[1], candidates[2]], // S2 vs Movie (no S1 candidate)
      );
      // Even though S2 has season penalty, movie has special penalty (-40)
      expect(match?.identifier).toBe("frieren-s2");
    });

    it("supports custom LLM matcher injection", async () => {
      const customMatcher = async () => candidates[2]; // returns movie explicitly
      const match = await matchBestSearchResult(["Any Title"], candidates, {
        customLlmMatcher: customMatcher,
      });
      expect(match?.identifier).toBe("frieren-movie");
    });
  });
});
