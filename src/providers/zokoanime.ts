import type {
  ProviderEpisodeList,
  ProviderSearchResult,
  StreamLanguage,
  StreamSource,
} from "../types.js";
import { AbstractProvider, type ProviderOptions } from "./base.js";
import { getDefaultHeaders } from "../utils/headers.js";
import { deobfuscateOtakuBlob } from "../utils/cipher.js";
import { BoundedCache } from "../utils/cache.js";
import { parseSubtitles, type RawSubtitle } from "../utils/subtitles.js";

const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co";
const ZOKO_BASE_URL = "https://zokoanime.video";
const DEFAULT_HEADERS = getDefaultHeaders({
  Referer: `${ZOKO_BASE_URL}/`,
  Origin: ZOKO_BASE_URL,
});

interface AniListMedia {
  id: number;
  idMal?: number | null;
  title: {
    english?: string | null;
    romaji?: string | null;
    native?: string | null;
  };
  episodes?: number | null;
}

interface ZokoEmbedConfig {
  src?: string;
  subtitles?: RawSubtitle[];
}

export class ZokoAnimeProvider extends AbstractProvider {
  readonly id = "zokoanime";
  readonly name = "ZokoAnime";

  private searchCache = new BoundedCache<string, ProviderSearchResult[]>({
    maxSize: 300,
    ttlMs: 10 * 60 * 1000,
  });

  private episodeCache = new BoundedCache<string, number[]>({
    maxSize: 300,
    ttlMs: 30 * 60 * 1000,
  });

  constructor(options?: ProviderOptions) {
    super(options);
  }

  async search(query: string): Promise<ProviderSearchResult[]> {
    const cleanQuery = this.sanitizeQuery(query);
    if (!cleanQuery) return [];

    const cacheKey = cleanQuery.toLowerCase();
    const cached = this.searchCache.get(cacheKey);
    if (cached) return cached;

    const gqlQuery = `
      query ($search: String) {
        Page(page: 1, perPage: 8) {
          media(search: $search, type: ANIME) {
            id
            idMal
            title {
              english
              romaji
              native
            }
            episodes
          }
        }
      }
    `;

    const data = await this.fetchJson<{
      data?: { Page?: { media?: AniListMedia[] } };
    }>(ANILIST_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: gqlQuery,
        variables: { search: cleanQuery },
      }),
    });

    const mediaList = data?.data?.Page?.media || [];
    const results: ProviderSearchResult[] = [];

    for (const item of mediaList) {
      const malId = item.idMal;
      const anilistId = item.id;
      const identifier = malId ? `mal:${malId}` : `anilist:${anilistId}`;

      const name =
        item.title.english ||
        item.title.romaji ||
        item.title.native ||
        `Anime ${anilistId}`;

      results.push({
        identifier,
        name,
        languages: ["sub", "dub"],
      });

      if (typeof item.episodes === "number" && item.episodes > 0) {
        const eps = Array.from({ length: item.episodes }, (_, i) => i + 1);
        this.episodeCache.set(identifier, eps);
      }
    }

    this.searchCache.set(cacheKey, results);
    return results;
  }

  async getEpisodes(
    identifier: string,
    _lang: StreamLanguage,
  ): Promise<ProviderEpisodeList> {
    const servers = [{ id: "zoko", name: "HD - ZokoAnime" }];

    const cached = this.episodeCache.get(identifier);
    if (cached) {
      return { episodes: cached, servers };
    }

    const [source, idStr] = identifier.includes(":")
      ? identifier.split(":")
      : ["mal", identifier];
    const numId = parseInt(idStr, 10);

    if (!isNaN(numId)) {
      const gqlQuery =
        source === "mal"
          ? `query ($id: Int) { Media(idMal: $id, type: ANIME) { episodes } }`
          : `query ($id: Int) { Media(id: $id, type: ANIME) { episodes } }`;

      const data = await this.fetchJson<{
        data?: { Media?: { episodes?: number | null } };
      }>(ANILIST_GRAPHQL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ query: gqlQuery, variables: { id: numId } }),
      });

      const totalEpisodes = data?.data?.Media?.episodes;
      if (typeof totalEpisodes === "number" && totalEpisodes > 0) {
        const eps = Array.from({ length: totalEpisodes }, (_, i) => i + 1);
        this.episodeCache.set(identifier, eps);
        return { episodes: eps, servers };
      }
    }

    // Default fallback if episode count is unknown/ongoing: 1..24
    const fallbackEps = Array.from({ length: 24 }, (_, i) => i + 1);
    this.episodeCache.set(identifier, fallbackEps);
    return { episodes: fallbackEps, servers };
  }

  async getStream(
    identifier: string,
    episode: number,
    lang: StreamLanguage,
    _server = "zoko",
  ): Promise<StreamSource | null> {
    const [source, idStr] = identifier.includes(":")
      ? identifier.split(":")
      : ["mal", identifier];

    const targetUrl = `${ZOKO_BASE_URL}/stream/${source}/${idStr}/${episode}/${lang}`;

    const html = await this.fetchText(targetUrl, {
      headers: DEFAULT_HEADERS,
      timeoutMs: this.timeoutMs,
    });

    if (!html) return null;

    const pMatch = html.match(/window\.__P\s*=\s*["']([^"']+)["']/);
    if (!pMatch) return null;

    try {
      const decodedJson = deobfuscateOtakuBlob(pMatch[1]);
      const config = JSON.parse(decodedJson) as ZokoEmbedConfig;
      if (!config?.src) return null;

      return {
        url: config.src,
        container: "hls",
        headers: {
          Referer: `${ZOKO_BASE_URL}/`,
        },
        serverName: "HD - ZokoAnime",
        subtitles: parseSubtitles(config.subtitles),
      };
    } catch {
      return null;
    }
  }
}
