import { describe, it, expect } from "vitest";
import { ZokoAnimeProvider } from "../../src/providers/zokoanime.js";
import { JustAnimeProvider } from "../../src/providers/justanime.js";
import { HiAnimeProvider } from "../../src/providers/hianime.js";
import { AnimeHubProvider } from "../../src/providers/animehub.js";
import { ProviderRegistry } from "../../src/registry.js";
import { probeStreamHealth } from "../../src/healthCheck.js";

describe("Live Provider Health & Upstream Verification", () => {
  describe("ZokoAnimeProvider (Live)", () => {
    const provider = new ZokoAnimeProvider();

    it("searches and finds Frieren", async () => {
      const results = await provider.search("Frieren");
      expect(results.length).toBeGreaterThan(0);
      const match = results.find((r) =>
        r.name.toLowerCase().includes("frieren"),
      );
      expect(match).toBeDefined();
      expect(match?.identifier).toContain("mal:");
    }, 15000);

    it("retrieves episodes and servers for Frieren", async () => {
      const { episodes, servers } = await provider.getEpisodes(
        "mal:52991",
        "sub",
      );
      expect(episodes.length).toBeGreaterThan(0);
      expect(episodes).toContain(1);
      expect(servers.some((s) => s.id === "zoko")).toBe(true);
    }, 15000);

    it("resolves and health-probes live stream", async () => {
      const stream = await provider.getStream("mal:52991", 1, "sub");
      expect(stream).not.toBeNull();
      expect(stream?.url).toContain(".m3u8");

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

    it("resolves and health-probes live stream", async () => {
      const stream = await provider.getStream(
        "sousou-no-frieren",
        1,
        "sub",
        "0",
      );
      expect(stream).not.toBeNull();
      expect(stream?.url).toContain(".m3u8");

      const isHealthy = await probeStreamHealth(stream!, 4000);
      expect(isHealthy).toBe(true);
    }, 20000);
  });

  describe("ProviderRegistry (Live End-to-End)", () => {
    it("aggregates and ranks available services across all providers for Frieren", async () => {
      const registry = new ProviderRegistry();
      const services = await registry.checkAvailability(
        ["Sousou no Frieren", "Frieren: Beyond Journey's End"],
        1,
      );

      expect(services.length).toBeGreaterThan(0);

      const topService = services[0];
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

    it("resolves working stream for Sasaki and Miyano across episodes 1 and 2", async () => {
      const registry = new ProviderRegistry();
      const servicesEp1 = await registry.checkAvailability(
        ["Sasaki and Miyano", "Sasaki to Miyano"],
        1,
      );
      expect(servicesEp1.length).toBeGreaterThan(0);

      const servicesEp2 = await registry.checkAvailability(
        ["Sasaki and Miyano", "Sasaki to Miyano"],
        2,
      );
      expect(servicesEp2.length).toBeGreaterThan(0);

      const topService = servicesEp2[0];
      const stream = await registry.resolveStream(
        topService.providerId,
        topService.identifier,
        2,
        topService.language,
        topService.serverId,
      );
      expect(stream).not.toBeNull();
      expect(stream?.url).toContain(".m3u8");
      expect(await probeStreamHealth(stream!, 4000)).toBe(true);
    }, 30000);

    it("resolves working stream for Sora wa Akai Kawa no Hotori with multiple providers", async () => {
      const registry = new ProviderRegistry();
      const services = await registry.checkAvailability(
        ["Sora wa Akai Kawa no Hotori", "Red River"],
        1,
      );

      // Verify that more than a single provider is returned
      const providerIds = new Set(services.map((s) => s.providerId));
      expect(providerIds.size).toBeGreaterThan(1);

      const topService = services[0];
      const stream = await registry.resolveStream(
        topService.providerId,
        topService.identifier,
        1,
        topService.language,
        topService.serverId,
      );
      expect(stream).not.toBeNull();
      expect(stream?.url).toContain(".m3u8");
      expect(await probeStreamHealth(stream!, 4000)).toBe(true);
    }, 30000);
  });
});
