import { describe, it, expect } from "vitest";
import { JustAnimeProvider } from "../../src/providers/justanime.js";
import { HiAnimeProvider } from "../../src/providers/hianime.js";
import { AnimeHubProvider } from "../../src/providers/animehub.js";
import { ProviderRegistry } from "../../src/registry.js";
import { probeStreamHealth } from "../../src/healthCheck.js";

describe("Live Provider Health & Upstream Verification", () => {
  describe("JustAnimeProvider (Live)", () => {
    const provider = new JustAnimeProvider();

    it("searches and finds Frieren", async () => {
      const results = await provider.search("Frieren");
      expect(results.length).toBeGreaterThan(0);
      const match = results.find((r) =>
        r.name.toLowerCase().includes("frieren"),
      );
      expect(match).toBeDefined();
      expect(match?.identifier).toBeDefined();
    }, 15000);

    it("retrieves episodes and servers for Frieren", async () => {
      const { episodes, servers } = await provider.getEpisodes("154587", "sub");
      expect(episodes.length).toBeGreaterThan(0);
      expect(episodes).toContain(1);
      expect(
        servers.some((s) => s.id === "megaplay" || s.id === "zokoanime"),
      ).toBe(true);
    }, 15000);

    it("resolves and health-probes live stream", async () => {
      const stream = await provider.getStream("154587", 1, "sub", "megaplay");
      expect(stream).not.toBeNull();
      expect(stream?.url).toContain("http");

      // Verify stream is actively delivering video segments
      const isHealthy = await probeStreamHealth(stream!, 4000);
      expect(isHealthy).toBe(true);
    }, 20000);
  });

  describe("HiAnimeProvider (Live)", () => {
    const provider = new HiAnimeProvider();

    it("searches and finds Frieren", async () => {
      const results = await provider.search("Frieren Beyond Journey's End");
      expect(results.length).toBeGreaterThan(0);
      const match = results.find((r) => r.identifier.includes("frieren"));
      expect(match).toBeDefined();
    }, 15000);

    it("retrieves episodes and servers", async () => {
      const { episodes, servers } = await provider.getEpisodes(
        "frieren-beyond-journeys-end-481",
        "sub",
      );
      expect(episodes.length).toBeGreaterThan(0);
      expect(episodes).toContain(1);
      expect(servers.length).toBeGreaterThan(0);
    }, 15000);

    it("resolves and health-probes live stream", async () => {
      const stream = await provider.getStream(
        "frieren-beyond-journeys-end-481",
        1,
        "sub",
      );
      expect(stream).not.toBeNull();
      expect(stream?.url).toContain(".m3u8");

      const isHealthy = await probeStreamHealth(stream!, 4000);
      expect(isHealthy).toBe(true);
    }, 20000);
  });

  describe("AnimeHubProvider (Live)", () => {
    const provider = new AnimeHubProvider();

    it("searches and finds Frieren", async () => {
      const results = await provider.search("Sousou no Frieren");
      expect(results.length).toBeGreaterThan(0);
      const match = results.find((r) => r.identifier.includes("frieren"));
      expect(match).toBeDefined();
    }, 15000);

    it("retrieves episodes and servers", async () => {
      const { episodes, servers } = await provider.getEpisodes(
        "sousou-no-frieren",
        "sub",
      );
      expect(episodes.length).toBeGreaterThan(0);
      expect(episodes).toContain(1);
      expect(servers.length).toBeGreaterThan(0);
    }, 15000);
  });

  describe("ProviderRegistry (Live End-to-End)", () => {
    it("aggregates and ranks available services across all providers", async () => {
      const registry = new ProviderRegistry();
      const services = await registry.checkAvailability(
        ["Sousou no Frieren", "Frieren: Beyond Journey's End"],
        1,
      );

      expect(services.length).toBeGreaterThan(0);

      // Verify top server is a high-speed CDN (MegaPlay or ZokoAnime)
      const topService = services[0];
      expect(topService.serverName.toLowerCase()).toMatch(/megaplay|zoko/);

      // Verify stream resolves from top service
      const stream = await registry.resolveStream(
        topService.providerId,
        topService.identifier,
        1,
        topService.language,
        topService.serverId,
      );
      expect(stream).not.toBeNull();
      expect(stream?.url).toBeDefined();
    }, 30000);
  });
});
