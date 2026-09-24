import { describe, it, expect } from "vitest";
import {
  extractSeasonNumber,
  matchBestSearchResult,
  normalizeTitle,
} from "./titleMatcher.js";
import type { ProviderSearchResult } from "./types.js";

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
      expect(extractSeasonNumber("Kingdom 5th Season")).toBe(5);
      expect(extractSeasonNumber("Date A Live V")).toBe(5);
      expect(extractSeasonNumber("My Hero Academia Season 7")).toBe(7);
      expect(extractSeasonNumber("Sword Art Online Season I")).toBe(1);
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
        [candidates[1], candidates[2]],
      );
      expect(match?.identifier).toBe("frieren-s2");
    });

    it("safely handles empty targetTitles array without throwing", async () => {
      const match = await matchBestSearchResult([], candidates);
      expect(match).toBe(candidates[0]);
    });

    it("safely handles whitespace-only targetTitles without throwing", async () => {
      const match = await matchBestSearchResult(["", "   "], candidates);
      expect(match).toBe(candidates[0]);
    });

    it("supports custom LLM matcher injection", async () => {
      const customMatcher = async () => candidates[2];
      const match = await matchBestSearchResult(["Any Title"], candidates, {
        customLlmMatcher: customMatcher,
      });
      expect(match?.identifier).toBe("frieren-movie");
    });

    it("invokes OpenRouter fallback when apiKey is provided and matches candidate", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: "1" } }],
            }),
            { status: 200 },
          );

        const match = await matchBestSearchResult(
          ["Random Query"],
          candidates,
          {
            openRouterApiKey: "test-api-key",
          },
        );

        expect(match?.identifier).toBe("frieren-s2");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("handles OpenRouter fallback returning NONE or errors gracefully", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: "NONE" } }],
            }),
            { status: 200 },
          );

        const matchNone = await matchBestSearchResult(
          ["Sousou no Frieren"],
          candidates,
          { openRouterApiKey: "test-api-key" },
        );
        expect(matchNone?.identifier).toBe("frieren-s1");

        globalThis.fetch = async () =>
          new Response("Internal Server Error", { status: 500 });

        const matchError = await matchBestSearchResult(
          ["Sousou no Frieren Season 2"],
          candidates,
          { openRouterApiKey: "test-api-key" },
        );
        expect(matchError?.identifier).toBe("frieren-s2");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
