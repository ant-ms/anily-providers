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

export interface ServerScoringRule {
  match: (serverName: string, serverId: string) => boolean;
  weight: number;
}

export interface QualityScoreOptions {
  providerWeights?: Record<string, number>;
  serverRules?: ServerScoringRule[];
}

export const DEFAULT_PROVIDER_WEIGHTS: Record<string, number> = {
  justanime: SCORE_WEIGHT_JUSTANIME,
  hianime: SCORE_WEIGHT_HIANIME,
};

export const DEFAULT_SERVER_RULES: ServerScoringRule[] = [
  {
    match: (name, id) =>
      name.includes("megaplay") || name.includes("mega") || id === "megaplay",
    weight: SCORE_WEIGHT_MEGAPLAY,
  },
  {
    match: (name, id) =>
      name.includes("zoko") || id === "zoko" || id === "zokoanime",
    weight: SCORE_WEIGHT_ZOKOANIME,
  },
  {
    match: (name) => name.includes("f5 - hq") || name.includes("no ads"),
    weight: PENALTY_THROTTLED_SERVERS,
  },
];

const RESOLUTION_RULES: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\b1080p\b/i, weight: SCORE_WEIGHT_1080P },
  { pattern: /\b720p\b/i, weight: SCORE_WEIGHT_720P },
  { pattern: /\b(hd|hq)\b/i, weight: SCORE_WEIGHT_GENERIC_HD },
];

export function getServiceScore(
  service: AvailableService,
  options?: QualityScoreOptions,
): number {
  let score = service.scoreBonus ?? 0;

  const providerWeights = options?.providerWeights ?? DEFAULT_PROVIDER_WEIGHTS;
  const pId = service.providerId.toLowerCase();
  const pName = service.providerName.toLowerCase();
  score += providerWeights[pId] ?? providerWeights[pName] ?? 0;

  const serverName = (service.serverName || "").toLowerCase();
  const serverId = (service.serverId || "").toLowerCase();
  const serverRules = options?.serverRules ?? DEFAULT_SERVER_RULES;

  for (const rule of serverRules) {
    if (rule.match(serverName, serverId)) {
      score += rule.weight;
      if (rule.weight > 0) break;
    }
  }

  const combined = `${serverName} ${pName}`;
  for (const resRule of RESOLUTION_RULES) {
    if (resRule.pattern.test(combined)) {
      score += resRule.weight;
      break;
    }
  }

  return score;
}
