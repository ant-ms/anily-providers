import { describe, it, expect } from "vitest";
import { AnimeHubProvider } from "./animehub.js";

describe("AnimeHubProvider (Unit)", () => {
  it("searches and parses HTML results with sub/dub tags", async () => {
    const mockHtml = `
      <div class="item">
        <a href="/anime/sousou-no-frieren" class="poster"></a>
        <span class="sub">SUB</span>
        <a class="name">Sousou no Frieren</a>
      </div>
      <div class="item">
        <a href="/anime/sousou-no-frieren-dub" class="poster"></a>
        <span class="dub">DUB</span>
        <a class="name">Sousou no Frieren (Dub)</a>
      </div>
    `;

    const mockFetch: typeof fetch = async (url) => {
      expect(String(url)).toContain("/search?keyword=frieren");
      return new Response(mockHtml, { status: 200 });
    };

    const provider = new AnimeHubProvider({ fetchFn: mockFetch });
    const results = await provider.search("frieren");

    expect(results).toHaveLength(1);
    expect(results[0].identifier).toBe("sousou-no-frieren");
    expect(results[0].name).toBe("Sousou no Frieren");
    expect(results[0].languages).toEqual(["sub", "dub"]);
  });

  it("parses server tabs and episodes from ajax sv endpoint", async () => {
    const mockAjaxHtml = `
      <span class="tab" data-name="0">F5 - HQ</span>
      <span class="tab" data-name="10">No Ads 4</span>
      <a data-id="sousou-no-frieren/1">Episode 1</a>
      <a data-id="sousou-no-frieren/2">Episode 2</a>
    `;

    const mockFetch: typeof fetch = async (url) => {
      expect(String(url)).toContain("/ajax/film/sv?id=sousou-no-frieren");
      return new Response(JSON.stringify({ html: mockAjaxHtml }), {
        status: 200,
      });
    };

    const provider = new AnimeHubProvider({ fetchFn: mockFetch });
    const { episodes, servers } = await provider.getEpisodes(
      "sousou-no-frieren",
      "sub",
    );

    expect(episodes).toEqual([1, 2]);
    expect(servers).toEqual([
      { id: "0", name: "F5 - HQ" },
      { id: "10", name: "No Ads 4" },
    ]);
  });

  it("resolves stream through embed page and zrpart2 hs endpoint", async () => {
    const embedUrl = "https://embed.example.com/play/abc";
    const hsData = JSON.stringify({
      sources: "https://video-cdn.example.com/stream.m3u8",
    });

    const mockFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes("/ajax/episode/info?epr=sousou-no-frieren/1/0")) {
        return new Response(JSON.stringify({ target: embedUrl }), {
          status: 200,
        });
      }
      if (u === embedUrl) {
        return new Response(
          `<html><script>var zrpart2 = "secret-token-123";</script></html>`,
          {
            status: 200,
          },
        );
      }
      if (u.includes("/hs/secret-token-123?pl_usn=1")) {
        return new Response(`<div id="sources">${hsData}</div>`, {
          status: 200,
        });
      }
      return new Response("Not found", { status: 404 });
    };

    const provider = new AnimeHubProvider({ fetchFn: mockFetch });
    const stream = await provider.getStream("sousou-no-frieren", 1, "sub", "0");

    expect(stream).not.toBeNull();
    expect(stream?.url).toBe("https://video-cdn.example.com/stream.m3u8");
    expect(stream?.container).toBe("hls");
    expect(stream?.serverName).toBe("F5 - HQ");
  });

  it("resolves stream through modern iframe player with MAL stream embedding", async () => {
    const embedUrl = "https://play2.echovideo.ru/embed-3/xyz123";
    const iframeHtml = `
      <html>
        <body>
          <iframe id="playerIframe" src="https://megaplay.buzz/stream/mal/52991/1/sub"></iframe>
        </body>
      </html>
    `;

    const { obfuscateOtakuBlob } = await import("../utils/cipher.js");
    const payload = JSON.stringify({
      src: "https://hls.example.com/frieren/master.m3u8",
      subtitles: [
        {
          label: "English",
          lang: "en",
          src: "https://hls.example.com/frieren/en.vtt",
        },
      ],
    });
    const blob = obfuscateOtakuBlob(payload);
    const zokoHtml = `<html><script>window.__P = "${blob}";</script></html>`;

    const mockFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes("/ajax/episode/info?epr=sousou-no-frieren/1/0")) {
        return new Response(JSON.stringify({ target: embedUrl }), {
          status: 200,
        });
      }
      if (u === embedUrl) {
        return new Response(iframeHtml, { status: 200 });
      }
      if (u.includes("zokoanime.video/stream/mal/52991/1/sub")) {
        return new Response(zokoHtml, { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    };

    const provider = new AnimeHubProvider({ fetchFn: mockFetch });
    const stream = await provider.getStream("sousou-no-frieren", 1, "sub", "0");

    expect(stream).not.toBeNull();
    expect(stream?.url).toBe("https://hls.example.com/frieren/master.m3u8");
    expect(stream?.container).toBe("hls");
    expect(stream?.serverName).toBe("F5 - HQ");
    expect(stream?.subtitles).toHaveLength(1);
    expect(stream?.subtitles?.[0].language).toBe("en");
  });
});
