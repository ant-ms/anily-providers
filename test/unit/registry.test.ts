import { describe, it, expect } from "vitest";
import { ProviderRegistry } from "../../src/registry.js";
import type {
  BaseProvider,
  ProviderSearchResult,
  StreamLanguage,
} from "../../src/types.js";

describe("ProviderRegistry (Unit)", () => {
  const createMockProvider = (
    id: string,
    name: string,
    servers: Array<{ id: string; name: string }>,
  ): BaseProvider => ({
    id,
    name,
    search: async (q: string): Promise<ProviderSearchResult[]> => [
      { identifier: `${id}-${q}`, name: q, languages: ["sub", "dub"] },
    ],
    getEpisodes: async () => ({
      episodes: [1, 2, 3],
      servers,
    }),
    getStream: async (identifier, episode, lang, server) => ({
      url: `https://${id}.example.com/${identifier}/${episode}.m3u8`,
      container: "hls",
      serverName: server,
    }),
  });

  it("registers and unregisters providers correctly", () => {
    const registry = new ProviderRegistry({ providers: [] });
    expect(registry.getAllProviders()).toHaveLength(0);

    const p1 = createMockProvider("p1", "P1", [{ id: "s1", name: "S1" }]);
    registry.register(p1);
    expect(registry.getAllProviders()).toHaveLength(1);
    expect(registry.getProvider("p1")).toBe(p1);

    expect(registry.unregister("p1")).toBe(true);
    expect(registry.getAllProviders()).toHaveLength(0);
  });

  it("checks availability across providers and sorts by quality score", async () => {
    const fastProvider = createMockProvider("justanime", "JustAnime", [
      { id: "megaplay", name: "1080p MegaPlay" },
    ]);
    const slowProvider = createMockProvider("animehub", "AnimeHub", [
      { id: "0", name: "F5 - HQ" },
    ]);

    const registry = new ProviderRegistry({
      providers: [slowProvider, fastProvider],
    });

    const services = await registry.checkAvailability(["Frieren"], 1);

    expect(services.length).toBeGreaterThan(0);
    // Highest quality score (MegaPlay) should be ranked first
    expect(services[0].serverName).toContain("MegaPlay");
    expect(services[services.length - 1].serverName).toContain("F5 - HQ");
  });

  it("resolves stream for specific provider", async () => {
    const p1 = createMockProvider("p1", "P1", [{ id: "s1", name: "S1" }]);
    const registry = new ProviderRegistry({ providers: [p1] });

    const stream = await registry.resolveStream(
      "p1",
      "frieren",
      1,
      "sub",
      "S1",
    );
    expect(stream).not.toBeNull();
    expect(stream?.url).toBe("https://p1.example.com/frieren/1.m3u8");
  });

  it("passes titleMatcherOptions to the title matcher during checkAvailability", async () => {
    let capturedOptions: unknown = null;
    const customMatcher = async (
      titles: string[],
      candidates: ProviderSearchResult[],
      opts?: unknown,
    ) => {
      capturedOptions = opts;
      return candidates[0];
    };

    const p1 = createMockProvider("p1", "P1", [{ id: "s1", name: "S1" }]);
    const registry = new ProviderRegistry({
      providers: [p1],
      titleMatcher: customMatcher,
    });

    const matcherOptions = { openRouterApiKey: "key-123" };
    await registry.checkAvailability(["Frieren"], 1, {
      titleMatcherOptions: matcherOptions,
    });

    expect(capturedOptions).toEqual(matcherOptions);
  });

  it("handles provider timeout gracefully without blocking fast providers", async () => {
    const fastProvider = createMockProvider("fast", "Fast", [
      { id: "s1", name: "Fast Server" },
    ]);

    const hangingProvider: BaseProvider = {
      id: "slow",
      name: "Slow",
      search: async () => {
        // Simulates stalled request
        await new Promise((resolve) => setTimeout(resolve, 500));
        return [{ identifier: "slow-id", name: "Frieren", languages: ["sub"] }];
      },
      getEpisodes: async () => ({
        episodes: [1],
        servers: [{ id: "s2", name: "Slow Server" }],
      }),
      getStream: async () => null,
    };

    const registry = new ProviderRegistry({
      providers: [fastProvider, hangingProvider],
    });

    // Run with 50ms timeout
    const services = await registry.checkAvailability(["Frieren"], 1, {
      timeoutMs: 50,
    });

    // Fast provider should have resolved, slow provider should have timed out
    expect(services.some((s) => s.providerId === "fast")).toBe(true);
    expect(services.some((s) => s.providerId === "slow")).toBe(false);
  });

  it("returns null when resolving with unknown provider", async () => {
    const registry = new ProviderRegistry({ providers: [] });
    const stream = await registry.resolveStream("unknown", "frieren", 1, "sub");
    expect(stream).toBeNull();
  });
});
