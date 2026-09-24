import type {
  AvailableService,
  BaseProvider,
  StreamLanguage,
  StreamSource,
  TitleMatcherFn,
  TitleMatcherOptions,
} from "./types.js";
import { getServiceScore } from "./qualityScore.js";
import { AnimeHubProvider } from "./providers/animehub.js";
import { HiAnimeProvider } from "./providers/hianime.js";
import { JustAnimeProvider } from "./providers/justanime.js";
import { matchBestSearchResult } from "./titleMatcher.js";
import { getLogger } from "./utils/logger.js";

export interface RegistryOptions {
  providers?: BaseProvider[];
  titleMatcher?: TitleMatcherFn;
}

export interface CheckAvailabilityOptions {
  titleMatcherOptions?: TitleMatcherOptions;
  timeoutMs?: number;
}

export class ProviderRegistry {
  private providers = new Map<string, BaseProvider>();
  private titleMatcher: TitleMatcherFn;

  constructor(options?: RegistryOptions) {
    this.titleMatcher = options?.titleMatcher ?? matchBestSearchResult;

    if (options?.providers) {
      for (const p of options.providers) {
        this.register(p);
      }
    } else {
      // Default built-in providers
      this.register(new AnimeHubProvider());
      this.register(new HiAnimeProvider());
      this.register(new JustAnimeProvider());
    }
  }

  register(provider: BaseProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregister(id: string): boolean {
    return this.providers.delete(id);
  }

  getProvider(id: string): BaseProvider | undefined {
    return this.providers.get(id);
  }

  getAllProviders(): BaseProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Check which providers and servers have the given episode available.
   */
  async checkAvailability(
    titles: string[],
    episodeNumber: number,
    options?: CheckAvailabilityOptions,
  ): Promise<AvailableService[]> {
    const log = getLogger();
    const validTitles = titles
      .map((t) => t?.trim())
      .filter((t): t is string => Boolean(t && t.length > 0));

    if (validTitles.length === 0) return [];

    const results: AvailableService[] = [];
    const providers = this.getAllProviders();

    await Promise.all(
      providers.map(async (provider) => {
        try {
          const providerCheck = async () => {
            // Find matching identifier in this provider
            let matchedIdentifier: string | null = null;
            let matchedLanguages: StreamLanguage[] = ["sub"];

            for (const title of validTitles) {
              const searchResults = await provider.search(title);
              if (searchResults.length > 0) {
                const match = await this.titleMatcher(
                  validTitles,
                  searchResults,
                  options?.titleMatcherOptions,
                );
                if (match) {
                  matchedIdentifier = match.identifier;
                  matchedLanguages = match.languages;
                  break;
                }
              }
            }

            if (!matchedIdentifier) return;

            // Check availability for each language supported, prioritizing sub then dub
            const sortedLanguages = Array.from(new Set(matchedLanguages)).sort(
              (a, b) => (a === "sub" ? -1 : 1),
            );

            for (const lang of sortedLanguages) {
              const { episodes, servers } = await provider.getEpisodes(
                matchedIdentifier,
                lang,
              );

              // Check if episode number exists in episodes list
              if (episodes.includes(episodeNumber)) {
                for (const server of servers) {
                  results.push({
                    providerId: provider.id,
                    providerName: provider.name,
                    serverName: server.name,
                    serverId: server.id,
                    language: lang,
                    identifier: matchedIdentifier,
                  });
                }
              }
            }
          };

          if (options?.timeoutMs && options.timeoutMs > 0) {
            await Promise.race([
              providerCheck(),
              new Promise<void>((_, reject) =>
                setTimeout(
                  () =>
                    reject(
                      new Error(
                        `Provider check timed out after ${options.timeoutMs}ms`,
                      ),
                    ),
                  options.timeoutMs,
                ),
              ),
            ]);
          } else {
            await providerCheck();
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          log.warn(
            { err: message, provider: provider.name },
            "Provider check failed",
          );
        }
      }),
    );

    // Prioritize fastest, verified reliable HD servers first
    results.sort((a, b) => {
      const scoreDiff = getServiceScore(b) - getServiceScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return 0;
    });

    return results;
  }

  /**
   * Resolve a stream for a specific service.
   */
  async resolveStream(
    providerId: string,
    identifier: string,
    episodeNumber: number,
    language: StreamLanguage,
    server?: string,
  ): Promise<StreamSource | null> {
    const log = getLogger();
    const provider = this.getProvider(providerId);
    if (!provider) {
      log.warn({ providerId }, "Provider not found");
      return null;
    }

    return await provider.getStream(
      identifier,
      episodeNumber,
      language,
      server,
    );
  }
}

export const registry = new ProviderRegistry();
