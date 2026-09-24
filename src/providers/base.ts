import type {
  BaseProvider,
  ProviderEpisodeList,
  ProviderSearchResult,
  StreamLanguage,
  StreamSource,
} from "../types.js";
import { getLogger } from "../utils/logger.js";

export interface ProviderOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export interface FetchRequestOptions extends RequestInit {
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

  protected sanitizeQuery(query: string): string {
    return (query || "")
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  protected async fetchJson<T>(
    url: string,
    options?: FetchRequestOptions,
  ): Promise<T | null> {
    const log = getLogger();
    const timeout = options?.timeoutMs ?? this.timeoutMs;
    const { timeoutMs: _, signal, ...init } = options || {};

    try {
      const res = await this.fetchFn(url, {
        ...init,
        signal: signal ?? AbortSignal.timeout(timeout),
      });

      if (!res.ok) {
        log.warn(
          { status: res.status, url, provider: this.name },
          "HTTP request failed",
        );
        return null;
      }

      return (await res.json()) as T;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(
        { err: message, url, provider: this.name },
        "HTTP JSON fetch error",
      );
      return null;
    }
  }

  protected async fetchText(
    url: string,
    options?: FetchRequestOptions,
  ): Promise<string | null> {
    const log = getLogger();
    const timeout = options?.timeoutMs ?? this.timeoutMs;
    const { timeoutMs: _, signal, ...init } = options || {};

    try {
      const res = await this.fetchFn(url, {
        ...init,
        signal: signal ?? AbortSignal.timeout(timeout),
      });

      if (!res.ok) {
        log.warn(
          { status: res.status, url, provider: this.name },
          "HTTP request failed",
        );
        return null;
      }

      return await res.text();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(
        { err: message, url, provider: this.name },
        "HTTP text fetch error",
      );
      return null;
    }
  }
}
