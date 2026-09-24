import type {
  AvailableService,
  BaseProvider,
  ProviderSearchResult,
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
            let matchedIdentifier: string | null = null;
            let matchedLanguages: StreamLanguage[] = ["sub"];

            const searches = await Promise.all(
              validTitles.map((title) =>
                provider
                  .search(title)
                  .catch(() => [] as ProviderSearchResult[]),
              ),
            );

            for (const searchResults of searches) {
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

            const sortedLanguages = Array.from(new Set(matchedLanguages)).sort(
              (a, b) => (a === "sub" ? -1 : 1),
            );

            await Promise.all(
              sortedLanguages.map(async (lang) => {
                const { episodes, servers } = await provider.getEpisodes(
                  matchedIdentifier!,
                  lang,
                );

                if (episodes.includes(episodeNumber)) {
                  for (const server of servers) {
                    results.push({
                      providerId: provider.id,
                      providerName: provider.name,
                      serverName: server.name,
                      serverId: server.id,
                      language: lang,
                      identifier: matchedIdentifier!,
                    });
                  }
                }
              }),
            );
          };

          if (options?.timeoutMs && options.timeoutMs > 0) {
            let timer: NodeJS.Timeout | undefined;
            const timeoutPromise = new Promise<void>((_, reject) => {
              timer = setTimeout(
                () =>
                  reject(
                    new Error(
                      `Provider check timed out after ${options.timeoutMs}ms`,
                    ),
                  ),
                options.timeoutMs,
              );
            });
            try {
              await Promise.race([providerCheck(), timeoutPromise]);
            } finally {
              if (timer) clearTimeout(timer);
            }
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

    results.sort((a, b) => {
      const scoreDiff = getServiceScore(b) - getServiceScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return 0;
    });

    return results;
  }

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
