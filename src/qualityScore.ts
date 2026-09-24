import type { AvailableService } from "./types.js";

/**
 * Reliability, speed, and quality weights for ranking available stream servers.
 *
 * Benchmark findings:
 * - MegaPlay (+12): 100% success rate, 50-200+ Mbps CDN throughput, pristine 1080p full HD.
 * - ZokoAnime (+8): High speed (~60-260 Mbps), <150ms start time, wide coverage across providers.
 * - Resolution bonuses: 1080p (+4), 720p (+2), generic HD/HQ (+1).
 * - Provider reliability: JustAnime (+3), HiAnime (+2).
 * - Throttled/unstable servers (e.g. AnimeHub F5-HQ / No Ads) penalized (-5) due to high segment latency/timeouts.
 */
export const SCORE_WEIGHT_MEGAPLAY = 12;
export const SCORE_WEIGHT_ZOKOANIME = 8;
export const SCORE_WEIGHT_1080P = 4;
export const SCORE_WEIGHT_720P = 2;
export const SCORE_WEIGHT_GENERIC_HD = 1;
export const SCORE_WEIGHT_JUSTANIME = 3;
export const SCORE_WEIGHT_HIANIME = 2;
export const PENALTY_THROTTLED_SERVERS = -5;

export function getServiceScore(service: AvailableService): number {
  const serverText = (service.serverName || "").toLowerCase();
  const providerText = (service.providerName || "").toLowerCase();
  const combined = `${serverText} ${providerText}`;
  let score = 0;

  // 1. Server-specific benchmarks
  if (serverText.includes("megaplay") || serverText.includes("mega")) {
    score += SCORE_WEIGHT_MEGAPLAY;
  } else if (serverText.includes("zoko")) {
    score += SCORE_WEIGHT_ZOKOANIME;
  }

  // 2. Penalize historically slow/throttled CDNs
  if (serverText.includes("f5 - hq") || serverText.includes("no ads")) {
    score += PENALTY_THROTTLED_SERVERS;
  }

  // 3. Provider stability
  if (providerText.includes("justanime")) {
    score += SCORE_WEIGHT_JUSTANIME;
  } else if (providerText.includes("hianime")) {
    score += SCORE_WEIGHT_HIANIME;
  }

  // 4. Resolution bonuses
  if (/\b1080p\b/i.test(combined)) {
    score += SCORE_WEIGHT_1080P;
  } else if (/\b720p\b/i.test(combined)) {
    score += SCORE_WEIGHT_720P;
  } else if (/\b(hd|hq)\b/i.test(combined)) {
    score += SCORE_WEIGHT_GENERIC_HD;
  }

  return score;
}
