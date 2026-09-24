import type {
  BaseProvider,
  ProviderEpisodeList,
  ProviderSearchResult,
  StreamLanguage,
  StreamSource,
} from "../types.js";

export interface ProviderOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export abstract class AbstractProvider implements BaseProvider {
  abstract readonly id: string;
  abstract readonly name: string;

  protected fetchFn: typeof fetch;
  protected timeoutMs: number;

  constructor(options?: ProviderOptions) {
    this.fetchFn = options?.fetchFn ?? globalThis.fetch;
    this.timeoutMs = options?.timeoutMs ?? 8000;
  }

  abstract search(query: string): Promise<ProviderSearchResult[]>;
  abstract getEpisodes(
    identifier: string,
    lang: StreamLanguage,
  ): Promise<ProviderEpisodeList>;
  abstract getStream(
    identifier: string,
    episode: number,
    lang: StreamLanguage,
    server?: string,
  ): Promise<StreamSource | null>;
}
