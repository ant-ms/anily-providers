import { describe, it, expect } from "vitest";
import { HiAnimeProvider } from "../../src/providers/hianime.js";
import { obfuscateOtakuBlob } from "../../src/utils/cipher.js";

describe("HiAnimeProvider (Unit)", () => {
  it("searches and parses HTML results", async () => {
    const mockHtml = `
      <html>
        <div class="flw-item">
          <h3 class="film-name">
            <a href="/watch/frieren-beyond-journeys-end-481" title="Frieren: Beyond Journey's End"></a>
          </h3>
          <span class="tick-sub"></span>
          <span class="tick-dub"></span>
        </div>
      </html>
    `;

    const mockFetch: typeof fetch = async (url) => {
      expect(String(url)).toContain("/search?keyword=frieren");
      return new Response(mockHtml, { status: 200 });
    };

    const provider = new HiAnimeProvider({ fetchFn: mockFetch });
    const results = await provider.search("frieren");

    expect(results).toHaveLength(1);
    expect(results[0].identifier).toBe("frieren-beyond-journeys-end-481");
    expect(results[0].name).toBe("Frieren: Beyond Journey's End");
    expect(results[0].languages).toEqual(["sub", "dub"]);
  });

  it("parses episodes list and maps episode IDs", async () => {
    const mockEpisodesHtml = `
      <div class="episodes-ul">
        <a data-number="1" data-id="1001" title="Episode 1"></a>
        <a data-number="2" data-id="1002" title="Episode 2"></a>
      </div>
    `;

    const mockFetch: typeof fetch = async (url) => {
      expect(String(url)).toContain("/api/theme/episode/list/481");
      return new Response(JSON.stringify({ html: mockEpisodesHtml }), {
        status: 200,
      });
    };

    const provider = new HiAnimeProvider({ fetchFn: mockFetch });
    const { episodes, servers } = await provider.getEpisodes(
      "frieren-beyond-journeys-end-481",
      "sub",
    );

    expect(episodes).toEqual([1, 2]);
    expect(servers).toEqual([{ id: "zoko", name: "HD - ZokoAnime" }]);
  });

  it("resolves stream and deobfuscates embed config", async () => {
    const mockEpisodesHtml = `<a data-number="1" data-id="1001"></a>`;

    const embedUrl = "https://otaku-stream.example.com/embed/123";
    const base64EmbedUrl = Buffer.from(embedUrl).toString("base64");

    const mockServersHtml = `
      <div class="server-item" data-type="sub" data-server-name="zoko" data-hash="${base64EmbedUrl}"></div>
    `;

    const embedConfig = {
      src: "https://otaku-cdn.example.com/master.m3u8",
      subtitles: [
        {
          lang: "English",
          label: "English",
          src: "https://otaku-cdn.example.com/en.vtt",
          default: true,
        },
      ],
    };
    const obfuscatedBlob = obfuscateOtakuBlob(JSON.stringify(embedConfig));
    const mockEmbedHtml = `
      <html>
        <script>window.__P = "${obfuscatedBlob}";</script>
      </html>
    `;

    const mockFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes("/api/theme/episode/list/")) {
        return new Response(JSON.stringify({ html: mockEpisodesHtml }), {
          status: 200,
        });
      }
      if (u.includes("/api/theme/episode/servers?episodeId=1001")) {
        return new Response(JSON.stringify({ html: mockServersHtml }), {
          status: 200,
        });
      }
      if (u.startsWith(embedUrl)) {
        return new Response(mockEmbedHtml, { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    };

    const provider = new HiAnimeProvider({ fetchFn: mockFetch });
    const stream = await provider.getStream("frieren-481", 1, "sub");

    expect(stream).not.toBeNull();
    expect(stream?.url).toBe("https://otaku-cdn.example.com/master.m3u8");
    expect(stream?.container).toBe("hls");
    expect(stream?.headers?.Referer).toBe("https://otaku-stream.example.com/");
    expect(stream?.subtitles?.[0].language).toBe("en");
  });
});
