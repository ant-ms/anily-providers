import { describe, it, expect } from "vitest";
import { ZokoAnimeProvider } from "./zokoanime.js";
import { obfuscateOtakuBlob } from "../utils/cipher.js";

describe("ZokoAnimeProvider (Unit)", () => {
  it("searches AniList GraphQL and formats results", async () => {
    const mockGraphQLResponse = {
      data: {
        Page: {
          media: [
            {
              id: 126288,
              idMal: 44055,
              title: {
                english: "Sasaki and Miyano",
                romaji: "Sasaki to Miyano",
                native: "佐々木と宮野",
              },
              episodes: 12,
            },
          ],
        },
      },
    };

    const mockFetch: typeof fetch = async (url) => {
      expect(String(url)).toContain("graphql.anilist.co");
      return new Response(JSON.stringify(mockGraphQLResponse), { status: 200 });
    };

    const provider = new ZokoAnimeProvider({ fetchFn: mockFetch });
    const results = await provider.search("sasaki to miyano");

    expect(results).toHaveLength(1);
    expect(results[0].identifier).toBe("mal:44055");
    expect(results[0].name).toBe("Sasaki and Miyano");
    expect(results[0].languages).toEqual(["sub", "dub"]);
  });

  it("retrieves episodes and servers", async () => {
    const mockFetch: typeof fetch = async (url) => {
      return new Response(
        JSON.stringify({
          data: { Media: { episodes: 12 } },
        }),
        { status: 200 },
      );
    };

    const provider = new ZokoAnimeProvider({ fetchFn: mockFetch });
    const { episodes, servers } = await provider.getEpisodes(
      "mal:44055",
      "sub",
    );

    expect(episodes).toHaveLength(12);
    expect(episodes[0]).toBe(1);
    expect(episodes[11]).toBe(12);
    expect(servers).toEqual([{ id: "zoko", name: "HD - ZokoAnime" }]);
  });

  it("resolves and deobfuscates stream correctly", async () => {
    const payload = JSON.stringify({
      src: "https://hls.example.com/sasaki/master.m3u8",
      subtitles: [
        {
          label: "English",
          lang: "en",
          src: "https://hls.example.com/sasaki/en.vtt",
          default: true,
        },
      ],
    });
    const blob = obfuscateOtakuBlob(payload);
    const mockHtml = `<html><script>window.__P = "${blob}";</script></html>`;

    const mockFetch: typeof fetch = async (url) => {
      expect(String(url)).toContain("zokoanime.video/stream/mal/44055/1/sub");
      return new Response(mockHtml, { status: 200 });
    };

    const provider = new ZokoAnimeProvider({ fetchFn: mockFetch });
    const stream = await provider.getStream("mal:44055", 1, "sub");

    expect(stream).not.toBeNull();
    expect(stream?.url).toBe("https://hls.example.com/sasaki/master.m3u8");
    expect(stream?.container).toBe("hls");
    expect(stream?.serverName).toBe("HD - ZokoAnime");
    expect(stream?.subtitles).toHaveLength(1);
    expect(stream?.subtitles?.[0].language).toBe("en");
  });
});
