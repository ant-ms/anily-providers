import type {
  ProviderEpisodeList,
  ProviderSearchResult,
  StreamLanguage,
  StreamSource,
} from "../types.js";
import { AbstractProvider, type ProviderOptions } from "./base.js";
import { getDefaultHeaders } from "../utils/headers.js";
import { BoundedCache } from "../utils/cache.js";
import { parseSubtitles, type RawSubtitle } from "../utils/subtitles.js";

const API_BASE = "https://core.justanime.to/api";
const DEFAULT_HEADERS = getDefaultHeaders({
  Origin: "https://justanime.to",
  Referer: "https://justanime.to/",
});

interface JustAnimeSearchItem {
  id: number;
  title?: { english?: string; romaji?: string };
  episodes?: number;
}

interface JustAnimeEpisodesResponse {
  totalEpisodes?: number;
  episodes?: Array<{ number: number }>;
}

interface JustAnimeStreamData {
  sources?: Array<{
    url: string;
    isM3U8?: boolean;
    quality?: string;
  }>;
  subtitles?: RawSubtitle[];
  headers?: Record<string, string>;
}

export class JustAnimeProvider extends AbstractProvider {
  readonly id = "justanime";
  readonly name = "JustAnime";

  private searchCache = new BoundedCache<string, ProviderSearchResult[]>({
    maxSize: 300,
    ttlMs: 10 * 60 * 1000,
  });
  private episodesCache = new BoundedCache<string, number[]>({
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

    const data = await this.fetchJson<{ results?: JustAnimeSearchItem[] }>(
      `${API_BASE}/search?query=${encodeURIComponent(cleanQuery)}`,
      { headers: DEFAULT_HEADERS },
    );

    const results: ProviderSearchResult[] = (data?.results || []).map(
      (item) => {
        const eng = (item.title?.english || "").replace(/[’‘]/g, "'").trim();
        const rom = (item.title?.romaji || "").replace(/[’‘]/g, "'").trim();
        const name =
          rom && rom.toLowerCase().includes(cacheKey)
            ? rom
            : eng || rom || `Anime ${item.id}`;

        return {
          identifier: String(item.id),
          name,
          languages: ["sub", "dub"],
        };
      },
    );

    this.searchCache.set(cacheKey, results);
    return results;
  }

  async getEpisodes(
    identifier: string,
    _lang: StreamLanguage,
  ): Promise<ProviderEpisodeList> {
    const servers = [
      { id: "megaplay", name: "HD - MegaPlay" },
      { id: "zokoanime", name: "HD - ZokoAnime" },
    ];

    const cached = this.episodesCache.get(identifier);
    if (cached) return { episodes: cached, servers };

    const data = await this.fetchJson<JustAnimeEpisodesResponse>(
      `${API_BASE}/anime/${identifier}/episodes`,
      { headers: DEFAULT_HEADERS },
    );

    if (!data) return { episodes: [], servers };

    let episodes: number[] = [];
    if (data.episodes && data.episodes.length > 0) {
      episodes = data.episodes
        .map((e) => e.number)
        .filter((n) => typeof n === "number");
    } else if (data.totalEpisodes && data.totalEpisodes > 0) {
      episodes = Array.from({ length: data.totalEpisodes }, (_, i) => i + 1);
    }

    episodes.sort((a, b) => a - b);
    this.episodesCache.set(identifier, episodes);
    return { episodes, servers };
  }

  async getStream(
    identifier: string,
    episode: number,
    lang: StreamLanguage,
    server = "megaplay",
  ): Promise<StreamSource | null> {
    const candidateServers = Array.from(
      new Set([server, "megaplay", "zokoanime"]),
    );

    for (const s of candidateServers) {
      const data = await this.fetchJson<Record<string, JustAnimeStreamData>>(
        `${API_BASE}/watch/${identifier}/episode/${episode}/${s}`,
        {
          headers: DEFAULT_HEADERS,
          timeoutMs: Math.min(this.timeoutMs, 6000),
        },
      );

      if (!data) continue;

      const langData = data[lang] || data.sub || data.dub;
      const source = langData?.sources?.[0];
      if (!source?.url) continue;

      const isHls =
        source.isM3U8 !== false &&
        (source.url.includes(".m3u8") || source.isM3U8 === true);

      const headers: Record<string, string> = { ...langData.headers };
      if (s === "zokoanime" && !headers.Referer) {
        headers.Referer = "https://zokoanime.video/";
      }

      return {
        url: source.url,
        container: isHls ? "hls" : "mp4",
        headers,
        serverName: s === "megaplay" ? "HD - MegaPlay" : "HD - ZokoAnime",
        subtitles: parseSubtitles(langData.subtitles),
      };
    }

    return null;
  }
}
