import { describe, it, expect } from "vitest";
import { probeStreamHealth } from "../../src/healthCheck.js";

describe("healthCheck", () => {
  it("returns false for null or empty url", async () => {
    expect(await probeStreamHealth({ url: "" })).toBe(false);
  });

  it("successfully probes HLS master -> variant -> segment", async () => {
    const masterM3u8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
variant.m3u8`;

    const variantM3u8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:4
#EXTINF:4.000,
segment_0.ts`;

    const dummyChunk = new Uint8Array([0x47, 0x40, 0x00, 0x10]).buffer; // TS sync byte

    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("master.m3u8")) {
        return new Response(masterM3u8, {
          status: 200,
          headers: { "content-type": "application/vnd.apple.mpegurl" },
        });
      }
      if (url.endsWith("variant.m3u8")) {
        return new Response(variantM3u8, {
          status: 200,
          headers: { "content-type": "application/vnd.apple.mpegurl" },
        });
      }
      if (url.endsWith("segment_0.ts")) {
        return new Response(dummyChunk, {
          status: 206,
          headers: { "content-type": "video/mp2t" },
        });
      }
      return new Response("Not found", { status: 404 });
    };

    const isHealthy = await probeStreamHealth(
      { url: "https://cdn.example.com/live/master.m3u8", container: "hls" },
      { fetchFn: mockFetch, timeoutMs: 1000 },
    );

    expect(isHealthy).toBe(true);
  });

  it("successfully probes direct HLS media playlist", async () => {
    const mediaM3u8 = `#EXTM3U
#EXT-X-VERSION:3
#EXTINF:2.0,
chunk.ts`;

    const dummyChunk = new Uint8Array([0x47, 0x40, 0x00, 0x10]).buffer;

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("stream.m3u8")) {
        return new Response(mediaM3u8, { status: 200 });
      }
      if (url.endsWith("chunk.ts")) {
        return new Response(dummyChunk, { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    };

    const isHealthy = await probeStreamHealth(
      { url: "https://cdn.example.com/stream.m3u8", container: "hls" },
      { fetchFn: mockFetch, timeoutMs: 1000 },
    );

    expect(isHealthy).toBe(true);
  });

  it("successfully probes direct MP4 video via range request", async () => {
    const dummyMp4Bytes = new Uint8Array(500);

    const mockFetch: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      if (headers.get("Range") === "bytes=0-4096") {
        return new Response(dummyMp4Bytes, {
          status: 206,
          headers: { "content-range": "bytes 0-499/500000" },
        });
      }
      // Initial probe without range header
      return new Response(null, { status: 200 });
    };

    const isHealthy = await probeStreamHealth(
      { url: "https://cdn.example.com/video.mp4", container: "mp4" },
      { fetchFn: mockFetch },
    );

    expect(isHealthy).toBe(true);
  });

  it("returns false when master manifest returns 404", async () => {
    const mockFetch: typeof fetch = async () =>
      new Response("Not Found", { status: 404 });

    const isHealthy = await probeStreamHealth(
      { url: "https://cdn.example.com/dead.m3u8", container: "hls" },
      { fetchFn: mockFetch },
    );

    expect(isHealthy).toBe(false);
  });

  it("returns false when media segment fetch returns error", async () => {
    const mediaM3u8 = `#EXTM3U\n#EXTINF:2.0,\nmissing_chunk.ts`;

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("stream.m3u8")) {
        return new Response(mediaM3u8, { status: 200 });
      }
      return new Response("Forbidden", { status: 403 });
    };

    const isHealthy = await probeStreamHealth(
      { url: "https://cdn.example.com/stream.m3u8", container: "hls" },
      { fetchFn: mockFetch },
    );

    expect(isHealthy).toBe(false);
  });
});
