// Core types
export * from "./types.js";

// Providers
export { AbstractProvider, type ProviderOptions } from "./providers/base.js";
export { AnimeHubProvider } from "./providers/animehub.js";
export { HiAnimeProvider } from "./providers/hianime.js";
export { JustAnimeProvider } from "./providers/justanime.js";

// Registry
export {
  ProviderRegistry,
  registry,
  type RegistryOptions,
  type CheckAvailabilityOptions,
} from "./registry.js";

// Quality scoring
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
} from "./qualityScore.js";

// Health check probe
export { probeStreamHealth, type ProbeOptions } from "./healthCheck.js";

// Title matching & season parsing
export {
  matchBestSearchResult,
  callOpenRouterFallback,
  extractSeasonNumber,
  normalizeTitle,
  type TitleMatcherOptions,
} from "./titleMatcher.js";

// Utilities
export { deobfuscateOtakuBlob, obfuscateOtakuBlob } from "./utils/cipher.js";
export { DEFAULT_USER_AGENT, getDefaultHeaders } from "./utils/headers.js";
export { setLogger, getLogger, nullLogger } from "./utils/logger.js";
export { BoundedCache, type CacheOptions } from "./utils/cache.js";
export { decodeHtmlEntities } from "./utils/html.js";
