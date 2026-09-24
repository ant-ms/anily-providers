export * from "./types.js";

export { AbstractProvider, type ProviderOptions } from "./providers/base.js";
export { AnimeHubProvider } from "./providers/animehub.js";
export { HiAnimeProvider } from "./providers/hianime.js";
export { JustAnimeProvider } from "./providers/justanime.js";

export {
  ProviderRegistry,
  registry,
  type RegistryOptions,
  type CheckAvailabilityOptions,
} from "./registry.js";

export {
  getServiceScore,
  SCORE_WEIGHT_MEGAPLAY,
  SCORE_WEIGHT_ZOKOANIME,
  SCORE_WEIGHT_1080P,
  SCORE_WEIGHT_720P,
  SCORE_WEIGHT_GENERIC_HD,
  SCORE_WEIGHT_JUSTANIME,
  SCORE_WEIGHT_HIANIME,
  PENALTY_THROTTLED_SERVERS,
  DEFAULT_PROVIDER_WEIGHTS,
  DEFAULT_SERVER_RULES,
  type ServerScoringRule,
  type QualityScoreOptions,
} from "./qualityScore.js";

export { probeStreamHealth, type ProbeOptions } from "./healthCheck.js";

export {
  matchBestSearchResult,
  callOpenRouterFallback,
  extractSeasonNumber,
  normalizeTitle,
  type TitleMatcherOptions,
} from "./titleMatcher.js";

export { deobfuscateOtakuBlob, obfuscateOtakuBlob } from "./utils/cipher.js";
export { DEFAULT_USER_AGENT, getDefaultHeaders } from "./utils/headers.js";
export { setLogger, getLogger, nullLogger } from "./utils/logger.js";
export { BoundedCache, type CacheOptions } from "./utils/cache.js";
export { decodeHtmlEntities } from "./utils/html.js";
export {
  parseSubtitles,
  normalizeLanguageCode,
  type RawSubtitle,
} from "./utils/subtitles.js";
