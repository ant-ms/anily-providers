export type StreamLanguage = "sub" | "dub";

export interface ProviderSearchResult {
  identifier: string;
  name: string;
  languages: StreamLanguage[];
}

export interface SubtitleTrack {
  id?: string;
  label: string;
  language: string;
  url: string;
  default?: boolean;
}

export interface StreamSource {
  url: string;
  resolution?: number;
  container?: "hls" | "mp4";
  headers?: Record<string, string>;
  serverName?: string;
  subtitles?: SubtitleTrack[];
}

export interface AvailableService {
  providerId: string;
  providerName: string;
  serverName: string;
  serverId: string;
  language: StreamLanguage;
  identifier: string;
}

export interface ProviderEpisodeList {
  episodes: number[];
  servers: Array<{ id: string; name: string }>;
}

export interface BaseProvider {
  readonly id: string;
  readonly name: string;
  search(query: string): Promise<ProviderSearchResult[]>;
  getEpisodes(
    identifier: string,
    lang: StreamLanguage,
  ): Promise<ProviderEpisodeList>;
  getStream(
    identifier: string,
    episode: number,
    lang: StreamLanguage,
    server?: string,
  ): Promise<StreamSource | null>;
}

export interface Logger {
  debug(data?: unknown, msg?: string): void;
  info(data?: unknown, msg?: string): void;
  warn(data?: unknown, msg?: string): void;
  error(data?: unknown, msg?: string): void;
}

export interface TitleMatcherOptions {
  openRouterApiKey?: string;
  openRouterModel?: string;
  customLlmMatcher?: (
    targetTitle: string,
    candidates: ProviderSearchResult[],
  ) => Promise<ProviderSearchResult | null>;
}

export type TitleMatcherFn = (
  targetTitles: string[],
  searchResults: ProviderSearchResult[],
  options?: TitleMatcherOptions,
) => Promise<ProviderSearchResult | null> | ProviderSearchResult | null;
