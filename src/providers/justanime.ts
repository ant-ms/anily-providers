import type {
  ProviderEpisodeList,
  ProviderSearchResult,
  StreamLanguage,
  StreamSource,
  SubtitleTrack,
} from "../types.js";
import { AbstractProvider, type ProviderOptions } from "./base.js";
import { getLogger } from "../utils/logger.js";
import { getDefaultHeaders } from "../utils/headers.js";
import { BoundedCache } from "../utils/cache.js";

const API_BASE = "https://core.justanime.to/api";
const DEFAULT_HEADERS = getDefaultHeaders({
  Origin: "https://justanime.to",
  Referer: "https://justanime.to/",
});

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
    const log = getLogger();
    const cleanQuery = query
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleanQuery) return [];

    const cacheKey = cleanQuery.toLowerCase();
    const cached = this.searchCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const url = `${API_BASE}/search?query=${encodeURIComponent(cleanQuery)}`;
      const res = await this.fetchFn(url, {
        headers: DEFAULT_HEADERS,
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        log.warn(
          { status: res.status, query },
          "JustAnime search request failed",
        );
        return [];
      }

      const data = (await res.json()) as {
        results?: Array<{
          id: number;
          title?: { english?: string; romaji?: string };
          episodes?: number;
        }>;
      };

      const results: ProviderSearchResult[] = (data.results || []).map(
        (item) => {
          const eng = (item.title?.english || "").replace(/[’‘]/g, "'").trim();
          const rom = (item.title?.romaji || "").replace(/[’‘]/g, "'").trim();
          const lowerQ = cleanQuery.toLowerCase();
          const name =
            rom && rom.toLowerCase().includes(lowerQ)
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ err: message, query }, "Error searching JustAnime");
      return [];
    }
  }

  async getEpisodes(
    identifier: string,
    _lang: StreamLanguage,
  ): Promise<ProviderEpisodeList> {
    const log = getLogger();
    const servers = [
      { id: "megaplay", name: "HD - MegaPlay" },
      { id: "zokoanime", name: "HD - ZokoAnime" },
    ];

    const cached = this.episodesCache.get(identifier);
    if (cached) {
      return { episodes: cached, servers };
    }

    try {
      const url = `${API_BASE}/anime/${identifier}/episodes`;
      const res = await this.fetchFn(url, {
        headers: DEFAULT_HEADERS,
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        return { episodes: [], servers };
      }

      const data = (await res.json()) as {
        totalEpisodes?: number;
        episodes?: Array<{ number: number }>;
      };

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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(
        { err: message, identifier },
        "Failed to get episodes from JustAnime",
      );
      return { episodes: [], servers };
    }
  }

  async getStream(
    identifier: string,
    episode: number,
    lang: StreamLanguage,
    server = "megaplay",
  ): Promise<StreamSource | null> {
    const log = getLogger();
    const candidateServers = Array.from(
      new Set([server, "megaplay", "zokoanime"]),
    );

    for (const s of candidateServers) {
      try {
        const url = `${API_BASE}/watch/${identifier}/episode/${episode}/${s}`;
        const res = await this.fetchFn(url, {
          headers: DEFAULT_HEADERS,
          signal: AbortSignal.timeout(Math.min(this.timeoutMs, 6000)),
        });

        if (!res.ok) continue;

        const data = (await res.json()) as Record<
          string,
          {
            sources?: Array<{
              url: string;
              isM3U8?: boolean;
              quality?: string;
            }>;
            subtitles?: Array<{
              file: string;
              label?: string;
              kind?: string;
              default?: boolean;
            }>;
            headers?: Record<string, string>;
          }
        >;

        const langData = data[lang] || data.sub || data.dub;
        const source = langData?.sources?.[0];
        if (!source || !source.url) continue;

        const isHls =
          source.isM3U8 !== false &&
          (source.url.includes(".m3u8") || source.isM3U8 === true);
        const headers: Record<string, string> = { ...langData.headers };
        if (s === "zokoanime" && !headers.Referer) {
          headers.Referer = "https://zokoanime.video/";
        }

        const rawSubs = langData.subtitles;
        const subtitles: SubtitleTrack[] = (rawSubs || [])
          .filter((sub) => sub.file && sub.kind !== "thumbnails")
          .map((sub) => {
            const label = sub.label || "English";
            const lowerLabel = label.toLowerCase();
            let langCode = "en";
            if (lowerLabel.includes("spanish")) langCode = "es";
            else if (lowerLabel.includes("french")) langCode = "fr";
            else if (lowerLabel.includes("german")) langCode = "de";
            else if (lowerLabel.includes("italian")) langCode = "it";
            else if (lowerLabel.includes("portuguese")) langCode = "pt";
            else if (lowerLabel.includes("russian")) langCode = "ru";
            else if (lowerLabel.includes("arabic")) langCode = "ar";
            else if (lowerLabel.includes("japanese")) langCode = "ja";

            return {
              label,
              language: langCode,
              url: sub.file,
              default: Boolean(sub.default || lowerLabel.includes("english")),
            };
          });

        return {
          url: source.url,
          container: isHls ? "hls" : "mp4",
          headers,
          serverName: s === "megaplay" ? "HD - MegaPlay" : "HD - ZokoAnime",
          subtitles,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(
          { err: message, identifier, episode, server: s },
          "JustAnime server attempt failed",
        );
      }
    }

    return null;
  }
}
