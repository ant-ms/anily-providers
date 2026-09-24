import type {
  ProviderEpisodeList,
  ProviderSearchResult,
  StreamLanguage,
  StreamSource,
  SubtitleTrack,
} from "../types.js";
import { AbstractProvider, type ProviderOptions } from "./base.js";
import { getLogger } from "../utils/logger.js";
import { DEFAULT_USER_AGENT } from "../utils/headers.js";
import { deobfuscateOtakuBlob } from "../utils/cipher.js";

const BASE_URL = "https://hianime.at";
const DEFAULT_HEADERS = {
  "User-Agent": DEFAULT_USER_AGENT,
};

export class HiAnimeProvider extends AbstractProvider {
  readonly id = "hianime";
  readonly name = "HiAnime";

  private searchCache = new Map<string, ProviderSearchResult[]>();
  // Map identifier -> Map episodeNumber -> episodeId
  private episodeIdCache = new Map<string, Map<number, string>>();

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
    if (this.searchCache.has(cacheKey)) {
      return this.searchCache.get(cacheKey)!;
    }

    try {
      const url = `${BASE_URL}/search?keyword=${encodeURIComponent(cleanQuery)}`;
      const res = await this.fetchFn(url, {
        headers: DEFAULT_HEADERS,
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        log.warn(
          { status: res.status, query },
          "HiAnime search request failed",
        );
        return [];
      }

      const html = await res.text();
      const results: ProviderSearchResult[] = [];

      // HiAnime returns search results with items
      const items = html.split('class="flw-item');
      for (let i = 1; i < items.length; i++) {
        const chunk = items[i];
        const nameMatch = chunk.match(
          /<h3 class="film-name">\s*<a href="[^"]*\/([^"]+)"\s*title="([^"]+)"/,
        );
        if (!nameMatch) continue;

        const rawSlug = nameMatch[1];
        const name = nameMatch[2]
          .replace(/&#039;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&")
          .trim();

        const hasSub = chunk.includes("tick-sub");
        const hasDub = chunk.includes("tick-dub");
        const languages: StreamLanguage[] = [];
        if (hasSub || (!hasSub && !hasDub)) languages.push("sub");
        if (hasDub) languages.push("dub");

        results.push({
          identifier: rawSlug,
          name,
          languages,
        });
      }

      this.searchCache.set(cacheKey, results);
      return results;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ err: message, query }, "Error searching HiAnime");
      return [];
    }
  }

  async getEpisodes(
    identifier: string,
    lang: StreamLanguage,
  ): Promise<ProviderEpisodeList> {
    const log = getLogger();
    const animeId = identifier.split("-").pop() || identifier;

    try {
      const url = `${BASE_URL}/api/theme/episode/list/${animeId}`;
      const res = await this.fetchFn(url, {
        headers: {
          ...DEFAULT_HEADERS,
          Referer: `${BASE_URL}/watch/${identifier}`,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        return { episodes: [], servers: [] };
      }

      const data = (await res.json()) as { html?: string };
      const html = data.html || "";

      const epMatches = [
        ...html.matchAll(/data-number="([^"]+)"[^>]*data-id="([0-9]+)"/g),
      ];

      const epMap = new Map<number, string>();
      const episodes: number[] = [];

      for (const m of epMatches) {
        const epNum = parseFloat(m[1]);
        const epId = m[2];
        if (!isNaN(epNum)) {
          epMap.set(epNum, epId);
          episodes.push(epNum);
        }
      }

      this.episodeIdCache.set(identifier, epMap);

      episodes.sort((a, b) => a - b);

      return {
        episodes,
        servers: [{ id: "zoko", name: "HD - ZokoAnime" }],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(
        { err: message, identifier, lang },
        "Failed to get episodes from HiAnime",
      );
      return { episodes: [], servers: [] };
    }
  }

  async getStream(
    identifier: string,
    episode: number,
    lang: StreamLanguage,
    _server = "zoko",
  ): Promise<StreamSource | null> {
    const log = getLogger();
    let epMap = this.episodeIdCache.get(identifier);
    if (!epMap || !epMap.has(episode)) {
      await this.getEpisodes(identifier, lang);
      epMap = this.episodeIdCache.get(identifier);
    }

    const epId = epMap?.get(episode);
    if (!epId) {
      log.warn({ identifier, episode }, "Episode ID not found in cache");
      return null;
    }

    try {
      const serversUrl = `${BASE_URL}/api/theme/episode/servers?episodeId=${epId}`;
      const res = await this.fetchFn(serversUrl, {
        headers: {
          ...DEFAULT_HEADERS,
          Referer: `${BASE_URL}/watch/${identifier}`,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        log.warn(
          { status: res.status, epId },
          "HiAnime servers request failed",
        );
        return null;
      }

      const data = (await res.json()) as { html?: string };
      const html = data.html || "";

      const serverItems = [
        ...html.matchAll(
          /class="[^"]*server-item[^"]*"[^>]*data-type="([^"]*)"[^>]*data-server-name="([^"]*)"[^>]*data-hash="([^"]*)"/g,
        ),
      ];

      // Find matching server by language and server name
      const targetLang = lang.toLowerCase();
      let chosen = serverItems.find(
        (s) =>
          s[1].toLowerCase() === targetLang &&
          s[2].toLowerCase().includes("zoko"),
      );

      // Fallback: any server matching language with a hash
      if (!chosen) {
        chosen = serverItems.find(
          (s) => s[1].toLowerCase() === targetLang && s[3],
        );
      }

      if (!chosen || !chosen[3]) {
        log.warn(
          { identifier, episode, lang },
          "No valid server found on HiAnime",
        );
        return null;
      }

      const embedUrl = Buffer.from(chosen[3], "base64").toString("utf8");
      if (!embedUrl.startsWith("http")) {
        log.warn({ embedUrl }, "Decoded embed URL is invalid");
        return null;
      }

      const embedRes = await this.fetchFn(embedUrl, {
        headers: {
          ...DEFAULT_HEADERS,
          Referer: `${BASE_URL}/`,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!embedRes.ok) {
        log.warn(
          { status: embedRes.status, embedUrl },
          "Failed to fetch embed page",
        );
        return null;
      }

      const embedHtml = await embedRes.text();
      const pMatch = embedHtml.match(/window\.__P\s*=\s*["']([^"']+)["']/);
      if (!pMatch) {
        log.warn({ embedUrl }, "__P blob not found in embed page");
        return null;
      }

      const decodedJson = deobfuscateOtakuBlob(pMatch[1]);
      const config = JSON.parse(decodedJson) as {
        src?: string;
        subtitles?: Array<{
          lang: string;
          label: string;
          src: string;
          default?: boolean;
        }>;
      };

      if (!config.src) {
        log.warn({ config }, "Stream src not found in decoded embed config");
        return null;
      }

      const embedOrigin = new URL(embedUrl).origin;

      const subtitles: SubtitleTrack[] = (config.subtitles || [])
        .filter(
          (sub) =>
            sub.src && sub.lang && sub.lang.toLowerCase() !== "thumbnails",
        )
        .map((sub) => {
          const l = sub.lang.toLowerCase();
          return {
            label: sub.label || sub.lang,
            language: l.startsWith("eng") || l === "en" ? "en" : l,
            url: sub.src,
            default: Boolean(
              sub.default || l.includes("english") || l === "en",
            ),
          };
        });

      return {
        url: config.src,
        container: "hls",
        headers: {
          Referer: `${embedOrigin}/`,
        },
        serverName: "HD - ZokoAnime",
        subtitles,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(
        { err: message, identifier, episode, lang },
        "Failed to resolve HiAnime stream",
      );
      return null;
    }
  }
}
