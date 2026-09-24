import { describe, it, expect } from "vitest";
import {
  getServiceScore,
  SCORE_WEIGHT_MEGAPLAY,
  SCORE_WEIGHT_ZOKOANIME,
  SCORE_WEIGHT_1080P,
  SCORE_WEIGHT_720P,
  SCORE_WEIGHT_GENERIC_HD,
  SCORE_WEIGHT_JUSTANIME,
  SCORE_WEIGHT_HIANIME,
  PENALTY_THROTTLED_SERVERS,
} from "./qualityScore.js";
import type { AvailableService } from "./types.js";

describe("qualityScore", () => {
  it("prioritizes MegaPlay over ZokoAnime", () => {
    const megaService: AvailableService = {
      providerId: "justanime",
      providerName: "JustAnime",
      serverId: "megaplay",
      serverName: "MegaPlay",
      language: "sub",
      identifier: "1",
    };

    const zokoService: AvailableService = {
      providerId: "justanime",
      providerName: "JustAnime",
      serverId: "zokoanime",
      serverName: "ZokoAnime",
      language: "sub",
      identifier: "1",
    };

    expect(getServiceScore(megaService)).toBeGreaterThan(
      getServiceScore(zokoService),
    );
  });

  it("penalizes throttled servers (F5 - HQ, No Ads)", () => {
    const f5Service: AvailableService = {
      providerId: "animehub",
      providerName: "AnimeHub",
      serverId: "0",
      serverName: "F5 - HQ",
      language: "sub",
      identifier: "1",
    };

    const noAdsService: AvailableService = {
      providerId: "animehub",
      providerName: "AnimeHub",
      serverId: "10",
      serverName: "No Ads 4",
      language: "sub",
      identifier: "1",
    };

    const normalService: AvailableService = {
      providerId: "animehub",
      providerName: "AnimeHub",
      serverId: "1",
      serverName: "Server 1",
      language: "sub",
      identifier: "1",
    };

    expect(getServiceScore(f5Service)).toBeLessThan(
      getServiceScore(normalService),
    );
    expect(getServiceScore(noAdsService)).toBeLessThan(
      getServiceScore(normalService),
    );
  });

  it("awards resolution bonuses correctly (1080p > 720p > HD)", () => {
    const s1080: AvailableService = {
      providerId: "test",
      providerName: "Test",
      serverId: "1",
      serverName: "1080p Stream",
      language: "sub",
      identifier: "1",
    };

    const s720: AvailableService = {
      providerId: "test",
      providerName: "Test",
      serverId: "1",
      serverName: "720p Stream",
      language: "sub",
      identifier: "1",
    };

    const sHd: AvailableService = {
      providerId: "test",
      providerName: "Test",
      serverId: "1",
      serverName: "HD Stream",
      language: "sub",
      identifier: "1",
    };

    const sNone: AvailableService = {
      providerId: "test",
      providerName: "Test",
      serverId: "1",
      serverName: "Stream",
      language: "sub",
      identifier: "1",
    };

    expect(getServiceScore(s1080)).toBeGreaterThan(getServiceScore(s720));
    expect(getServiceScore(s720)).toBeGreaterThan(getServiceScore(sHd));
    expect(getServiceScore(sHd)).toBeGreaterThan(getServiceScore(sNone));
  });

  it("awards provider reliability bonuses (JustAnime > HiAnime)", () => {
    const justAnime: AvailableService = {
      providerId: "justanime",
      providerName: "JustAnime",
      serverId: "1",
      serverName: "Server",
      language: "sub",
      identifier: "1",
    };

    const hiAnime: AvailableService = {
      providerId: "hianime",
      providerName: "HiAnime",
      serverId: "1",
      serverName: "Server",
      language: "sub",
      identifier: "1",
    };

    const unknown: AvailableService = {
      providerId: "other",
      providerName: "Other",
      serverId: "1",
      serverName: "Server",
      language: "sub",
      identifier: "1",
    };

    expect(getServiceScore(justAnime)).toBe(SCORE_WEIGHT_JUSTANIME);
    expect(getServiceScore(hiAnime)).toBe(SCORE_WEIGHT_HIANIME);
    expect(getServiceScore(unknown)).toBe(0);
  });

  it("supports scoreBonus and custom rule overrides", () => {
    const customService: AvailableService = {
      providerId: "custom-provider",
      providerName: "Custom",
      serverId: "fast-mirror",
      serverName: "Fast Mirror",
      language: "sub",
      identifier: "1",
      scoreBonus: 15,
    };

    expect(getServiceScore(customService)).toBe(15);

    const withCustomRules = getServiceScore(customService, {
      providerWeights: { "custom-provider": 10 },
      serverRules: [
        {
          match: (name) => name.includes("fast"),
          weight: 5,
        },
      ],
    });

    expect(withCustomRules).toBe(15 + 10 + 5);
  });
});
