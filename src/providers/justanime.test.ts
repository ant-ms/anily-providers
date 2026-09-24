import { describe, it, expect } from "vitest";
import { JustAnimeProvider } from "./justanime.js";

describe("JustAnimeProvider (Unit)", () => {
  it("searches and parses anime results correctly", async () => {
    const mockApiResponse = {
      results: [
        {
          id: 154587,
          title: {
            english: "Frieren: Beyond Journey's End",
            romaji: "Sousou no Frieren",
          },
          episodes: 28,
        },
        {
          id: 99999,
          title: {
            english: "",
            romaji: "Sousou no Frieren Mini Anime",
          },
          episodes: 12,
        },
      ],
    };

    let fetchCount = 0;
    const mockFetch: typeof fetch = async (url) => {
      fetchCount++;
      expect(String(url)).toContain("/search?query=frieren");
      return new Response(JSON.stringify(mockApiResponse), { status: 200 });
    };

    const provider = new JustAnimeProvider({ fetchFn: mockFetch });
    const results = await provider.search("frieren");

    expect(results).toHaveLength(2);
    expect(results[0].identifier).toBe("154587");
    expect(results[0].name).toBe("Sousou no Frieren");
    expect(results[0].languages).toEqual(["sub", "dub"]);

    const cachedResults = await provider.search("frieren");
    expect(cachedResults).toEqual(results);
    expect(fetchCount).toBe(1);
  });

  it("handles empty or failed search gracefully", async () => {
    const mockFetch: typeof fetch = async () =>
      new Response("Internal Error", { status: 500 });
    const provider = new JustAnimeProvider({ fetchFn: mockFetch });

    expect(await provider.search("")).toEqual([]);
    expect(await provider.search("frieren")).toEqual([]);
  });

  it("parses episodes list with fallback to totalEpisodes", async () => {
    const mockFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes("/anime/100/episodes")) {
        return new Response(
          JSON.stringify({
            episodes: [{ number: 1 }, { number: 2 }, { number: 3 }],
          }),
          { status: 200 },
        );
      }
      if (u.includes("/anime/200/episodes")) {
        return new Response(
          JSON.stringify({
            totalEpisodes: 5,
          }),
          { status: 200 },
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const provider = new JustAnimeProvider({ fetchFn: mockFetch });

    const ep1 = await provider.getEpisodes("100", "sub");
    expect(ep1.episodes).toEqual([1, 2, 3]);
    expect(ep1.servers.map((s) => s.id)).toEqual(["megaplay", "zokoanime"]);

    const ep2 = await provider.getEpisodes("200", "sub");
    expect(ep2.episodes).toEqual([1, 2, 3, 4, 5]);
  });

  it("resolves stream and maps subtitles correctly", async () => {
    const mockStreamResponse = {
      sub: {
        sources: [
          {
            url: "https://cdn.example.com/master.m3u8",
            isM3U8: true,
            quality: "1080p",
          },
        ],
        subtitles: [
          {
            file: "https://cdn.example.com/en.vtt",
            label: "English",
            default: true,
          },
          { file: "https://cdn.example.com/es.vtt", label: "Spanish" },
          { file: "https://cdn.example.com/fr.vtt", label: "French" },
          { file: "https://cdn.example.com/thumb.vtt", kind: "thumbnails" },
        ],
        headers: {
          Referer: "https://zokoanime.video/",
        },
      },
    };

    const mockFetch: typeof fetch = async (url) => {
      expect(String(url)).toContain("/watch/154587/episode/1/megaplay");
      return new Response(JSON.stringify(mockStreamResponse), { status: 200 });
    };

    const provider = new JustAnimeProvider({ fetchFn: mockFetch });
    const stream = await provider.getStream("154587", 1, "sub", "megaplay");

    expect(stream).not.toBeNull();
    expect(stream?.url).toBe("https://cdn.example.com/master.m3u8");
    expect(stream?.container).toBe("hls");
    expect(stream?.serverName).toContain("MegaPlay");

    expect(stream?.subtitles).toHaveLength(3);
    expect(stream?.subtitles?.[0]).toEqual({
      label: "English",
      language: "en",
      url: "https://cdn.example.com/en.vtt",
      default: true,
    });
    expect(stream?.subtitles?.[1].language).toBe("es");
    expect(stream?.subtitles?.[2].language).toBe("fr");
  });
});
