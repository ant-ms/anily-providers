import * as cheerio from "cheerio";
import type {
  ProviderEpisodeList,
  ProviderSearchResult,
  StreamLanguage,
  StreamSource,
} from "../types.js";
import { AbstractProvider, type ProviderOptions } from "./base.js";
import { getDefaultHeaders } from "../utils/headers.js";
import { BoundedCache } from "../utils/cache.js";
import { decodeHtmlEntities } from "../utils/html.js";

const BASE_URL = "https://123animehub.cc";
const DEFAULT_HEADERS = getDefaultHeaders();

export class AnimeHubProvider extends AbstractProvider {
  readonly id = "animehub";
  readonly name = "AnimeHub";

  private searchCache = new BoundedCache<string, ProviderSearchResult[]>({
    maxSize: 300,
    ttlMs: 10 * 60 * 1000,
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
    const resultsMap = new Map<string, ProviderSearchResult>();

    $(".item").each((_, el) => {
      const item = $(el);
      const rawHref = item.find("a.poster").attr("href");
      const nameText = item.find("a.name").text().trim();
      if (!rawHref || !nameText) return;

      const langClass = item
        .find("span.dub, span.sub")
        .attr("class")
        ?.toLowerCase();
      let name = decodeHtmlEntities(nameText).trim();

      let identifier = rawHref.replace(/^\/anime\//, "").replace(/\/$/, "");
      const isDub =
        identifier.endsWith("-dub") ||
        langClass === "dub" ||
        name.toLowerCase().endsWith("(dub)");

      if (identifier.endsWith("-dub")) {
        identifier = identifier.slice(0, -4);
      }

      name = name
        .replace(/\s*\((?:Dub|Sub)\)\s*$/i, "")
        .replace(/\s+Dub\s*$/i, "")
        .trim();

      const lang: StreamLanguage = isDub ? "dub" : "sub";

      if (resultsMap.has(identifier)) {
        const existing = resultsMap.get(identifier)!;
        if (!existing.languages.includes(lang)) {
          existing.languages.push(lang);
        }
      } else {
        resultsMap.set(identifier, {
          identifier,
          name,
          languages: [lang],
        });
      }
    });

    const results = Array.from(resultsMap.values());
    this.searchCache.set(cacheKey, results);
    return results;
  }

  async getEpisodes(
    identifier: string,
    lang: StreamLanguage,
  ): Promise<ProviderEpisodeList> {
    const slug = lang === "dub" ? `${identifier}-dub` : identifier;
    const animeUrl = `${BASE_URL}/anime/${slug}`;

    const data = await this.fetchJson<{ html?: string }>(
      `${BASE_URL}/ajax/film/sv?id=${slug}`,
      {
        headers: {
          ...DEFAULT_HEADERS,
          Referer: animeUrl,
        },
      },
    );

    if (!data?.html) {
      return { episodes: [], servers: [] };
    }

    const $ = cheerio.load(data.html);
    const servers: Array<{ id: string; name: string }> = [];

    $("span.tab[data-name]").each((_, el) => {
      const id = $(el).attr("data-name");
      const name = $(el).text().trim();
      if (id && name) {
        servers.push({ id, name });
      }
    });

    if (servers.length === 0) {
      servers.push({ id: "0", name: "Default" });
    }

    const episodesSet = new Set<number>();
    $("[data-id]").each((_, el) => {
      const dataId = $(el).attr("data-id") || "";
      const epPart = dataId.split("/").pop();
      const epNum = parseFloat(epPart || "");
      if (!isNaN(epNum)) {
        episodesSet.add(epNum);
      }
    });

    const sortedEpisodes = Array.from(episodesSet).sort((a, b) => a - b);
    return { episodes: sortedEpisodes, servers };
  }

  async getStream(
    identifier: string,
    episode: number,
    lang: StreamLanguage,
    server = "0",
  ): Promise<StreamSource | null> {
    const slug = lang === "dub" ? `${identifier}-dub` : identifier;
    const animeUrl = `${BASE_URL}/anime/${slug}`;
    const candidateServers = Array.from(new Set([server, "0", "10"]));

    for (const s of candidateServers) {
      const embedUrl = await this.fetchEmbedUrl(slug, episode, s, animeUrl);
      if (!embedUrl) continue;

      const token = await this.fetchZrToken(embedUrl, animeUrl);
      if (!token) continue;

      const targetBase = new URL(embedUrl).origin;
      const streamUrl = await this.fetchSourcesUrl(targetBase, token, embedUrl);
      if (!streamUrl) continue;

      return {
        url: streamUrl,
        container: "hls",
        headers: { Referer: `${targetBase}/` },
        serverName:
          s === "0" ? "F5 - HQ" : s === "10" ? "No Ads 4" : `Server ${s}`,
      };
    }

    return null;
  }

  private async fetchEmbedUrl(
    slug: string,
    episode: number,
    server: string,
    animeUrl: string,
  ): Promise<string | null> {
    const data = await this.fetchJson<{ target?: string }>(
      `${BASE_URL}/ajax/episode/info?epr=${slug}/${episode}/${server}`,
      {
        headers: {
          ...DEFAULT_HEADERS,
          Referer: animeUrl,
        },
      },
    );
    return data?.target ?? null;
  }

  private async fetchZrToken(
    embedUrl: string,
    animeUrl: string,
  ): Promise<string | null> {
    const html = await this.fetchText(embedUrl, {
      headers: {
        ...DEFAULT_HEADERS,
        Referer: animeUrl,
      },
    });
    if (!html) return null;

    const match = html.match(/var\s+zrpart2\s*=\s*["']([^"']+)["']/);
    return match?.[1] ?? null;
  }

  private async fetchSourcesUrl(
    targetBase: string,
    token: string,
    embedUrl: string,
  ): Promise<string | null> {
    const html = await this.fetchText(
      `${targetBase}/hs/${encodeURIComponent(token)}?pl_usn=1`,
      {
        headers: {
          ...DEFAULT_HEADERS,
          Referer: embedUrl,
        },
      },
    );
    if (!html) return null;

    const $ = cheerio.load(html);
    const sourcesContent = $("#sources").text().trim();
    if (!sourcesContent) return null;

    try {
      const data = JSON.parse(sourcesContent) as { sources?: string };
      return data.sources ?? null;
    } catch {
      return null;
    }
  }
}
