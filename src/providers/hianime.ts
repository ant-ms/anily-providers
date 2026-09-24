import * as cheerio from "cheerio";
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
import { decodeHtmlEntities } from "../utils/html.js";
import { parseSubtitles, type RawSubtitle } from "../utils/subtitles.js";

const BASE_URL = "https://hianime.at";
const DEFAULT_HEADERS = getDefaultHeaders();

interface HiAnimeEmbedConfig {
  src?: string;
  subtitles?: RawSubtitle[];
}

export class HiAnimeProvider extends AbstractProvider {
  readonly id = "hianime";
  readonly name = "HiAnime";

  private searchCache = new BoundedCache<string, ProviderSearchResult[]>({
    maxSize: 300,
    ttlMs: 10 * 60 * 1000,
  });
  private episodeIdCache = new BoundedCache<string, Map<number, string>>({
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

    const html = await this.fetchText(
      `${BASE_URL}/search?keyword=${encodeURIComponent(cleanQuery)}`,
      { headers: DEFAULT_HEADERS },
    );

    if (!html) return [];

    const $ = cheerio.load(html);
    const results: ProviderSearchResult[] = [];

    $(".flw-item").each((_, el) => {
      const item = $(el);
      const link = item.find("h3.film-name a");
      const href = link.attr("href");
      const titleAttr = link.attr("title");
      if (!href || !titleAttr) return;

      const rawSlug = href.replace(/^.*\/([^/]+)$/, "$1");
      const name = decodeHtmlEntities(titleAttr).trim();

      const hasSub = item.find(".tick-sub").length > 0;
      const hasDub = item.find(".tick-dub").length > 0;
      const languages: StreamLanguage[] = [];
      if (hasSub || (!hasSub && !hasDub)) languages.push("sub");
      if (hasDub) languages.push("dub");

      results.push({
        identifier: rawSlug,
        name,
        languages,
      });
    });

    this.searchCache.set(cacheKey, results);
    return results;
  }

  async getEpisodes(
    identifier: string,
    _lang: StreamLanguage,
  ): Promise<ProviderEpisodeList> {
    const animeId = identifier.split("-").pop() || identifier;
    const data = await this.fetchJson<{ html?: string }>(
      `${BASE_URL}/api/theme/episode/list/${animeId}`,
      {
        headers: {
          ...DEFAULT_HEADERS,
          Referer: `${BASE_URL}/watch/${identifier}`,
        },
      },
    );

    if (!data?.html) {
      return { episodes: [], servers: [] };
    }

    const $ = cheerio.load(data.html);
    const epMap = new Map<number, string>();
    const episodes: number[] = [];

    $("[data-number][data-id]").each((_, el) => {
      const epNum = parseFloat($(el).attr("data-number") || "");
      const epId = $(el).attr("data-id") || "";
      if (!isNaN(epNum) && epId) {
        epMap.set(epNum, epId);
        episodes.push(epNum);
      }
    });

    this.episodeIdCache.set(identifier, epMap);
    episodes.sort((a, b) => a - b);

    return {
      episodes,
      servers: [{ id: "zoko", name: "HD - ZokoAnime" }],
    };
  }

  async getStream(
    identifier: string,
    episode: number,
    lang: StreamLanguage,
    _server = "zoko",
  ): Promise<StreamSource | null> {
    const epId = await this.resolveEpisodeId(identifier, episode, lang);
    if (!epId) return null;

    const embedUrl = await this.resolveEmbedUrl(identifier, epId, lang);
    if (!embedUrl) return null;

    const config = await this.fetchEmbedConfig(embedUrl);
    if (!config?.src) return null;

    return {
      url: config.src,
      container: "hls",
      headers: {
        Referer: `${new URL(embedUrl).origin}/`,
      },
      serverName: "HD - ZokoAnime",
      subtitles: parseSubtitles(config.subtitles),
    };
  }

  private async resolveEpisodeId(
    identifier: string,
    episode: number,
    lang: StreamLanguage,
  ): Promise<string | null> {
    let epMap = this.episodeIdCache.get(identifier);
    if (!epMap || !epMap.has(episode)) {
      await this.getEpisodes(identifier, lang);
      epMap = this.episodeIdCache.get(identifier);
    }
    return epMap?.get(episode) ?? null;
  }

  private async resolveEmbedUrl(
    identifier: string,
    episodeId: string,
    lang: StreamLanguage,
  ): Promise<string | null> {
    const data = await this.fetchJson<{ html?: string }>(
      `${BASE_URL}/api/theme/episode/servers?episodeId=${episodeId}`,
      {
        headers: {
          ...DEFAULT_HEADERS,
          Referer: `${BASE_URL}/watch/${identifier}`,
        },
      },
    );

    if (!data?.html) return null;

    const $ = cheerio.load(data.html);
    const targetLang = lang.toLowerCase();

    let chosenHash: string | undefined;

    $(".server-item").each((_, el) => {
      const item = $(el);
      const type = (item.attr("data-type") || "").toLowerCase();
      const serverName = (item.attr("data-server-name") || "").toLowerCase();
      const hash = item.attr("data-hash");
      if (type === targetLang && hash) {
        if (serverName.includes("zoko") || !chosenHash) {
          chosenHash = hash;
        }
      }
    });

    if (!chosenHash) return null;

    const embedUrl = Buffer.from(chosenHash, "base64").toString("utf8");
    return embedUrl.startsWith("http") ? embedUrl : null;
  }

  private async fetchEmbedConfig(
    embedUrl: string,
  ): Promise<HiAnimeEmbedConfig | null> {
    const embedHtml = await this.fetchText(embedUrl, {
      headers: {
        ...DEFAULT_HEADERS,
        Referer: `${BASE_URL}/`,
      },
    });

    if (!embedHtml) return null;

    const pMatch = embedHtml.match(/window\.__P\s*=\s*["']([^"']+)["']/);
    if (!pMatch) return null;

    try {
      const decodedJson = deobfuscateOtakuBlob(pMatch[1]);
      return JSON.parse(decodedJson) as HiAnimeEmbedConfig;
    } catch {
      return null;
    }
  }
}
