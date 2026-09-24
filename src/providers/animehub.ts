import type {
  ProviderEpisodeList,
  ProviderSearchResult,
  StreamLanguage,
  StreamSource,
} from "../types.js";
import { AbstractProvider, type ProviderOptions } from "./base.js";
import { getLogger } from "../utils/logger.js";
import { DEFAULT_USER_AGENT } from "../utils/headers.js";

const BASE_URL = "https://123animehub.cc";
const DEFAULT_HEADERS = {
  "User-Agent": DEFAULT_USER_AGENT,
};

export class AnimeHubProvider extends AbstractProvider {
  readonly id = "animehub";
  readonly name = "AnimeHub";

  private searchCache = new Map<string, ProviderSearchResult[]>();

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
        log.warn({ status: res.status, query }, "Search request failed");
        return [];
      }

      const html = await res.text();
      const resultsMap = new Map<string, ProviderSearchResult>();

      // Extract all items from film-list
      const itemRegex =
        /<div class="item">[\s\S]*?<a href="([^"]+)"[^>]*class="poster"[\s\S]*?(?:<span class="(dub|sub)">([^<]+)<\/span>)?[\s\S]*?<a [^>]*class="name">([^<]+)<\/a>/g;
      let match: RegExpExecArray | null;

      while ((match = itemRegex.exec(html)) !== null) {
        const rawHref = match[1];
        const langClass = match[2]?.toLowerCase();
        let name = match[4]?.trim() || "";

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
      }

      const results = Array.from(resultsMap.values());
      this.searchCache.set(cacheKey, results);
      return results;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ err: message, query }, "Error searching AnimeHub");
      return [];
    }
  }

  async getEpisodes(
    identifier: string,
    lang: StreamLanguage,
  ): Promise<ProviderEpisodeList> {
    const log = getLogger();
    const slug = lang === "dub" ? `${identifier}-dub` : identifier;
    const animeUrl = `${BASE_URL}/anime/${slug}`;

    try {
      const url = `${BASE_URL}/ajax/film/sv?id=${slug}`;
      const res = await this.fetchFn(url, {
        headers: {
          ...DEFAULT_HEADERS,
          Referer: animeUrl,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        return { episodes: [], servers: [] };
      }

      const data = (await res.json()) as { html?: string };
      const html = data.html || "";

      // Extract available servers
      const servers: Array<{ id: string; name: string }> = [];
      const tabRegex =
        /<span[^>]*class="[^"]*tab[^"]*"[^>]*data-name="(\d+)"[^>]*>([^<]+)<\/span>/g;
      let tabMatch: RegExpExecArray | null;
      while ((tabMatch = tabRegex.exec(html)) !== null) {
        servers.push({
          id: tabMatch[1],
          name: tabMatch[2].trim(),
        });
      }

      if (servers.length === 0) {
        servers.push({ id: "0", name: "Default" });
      }

      // Extract available episode numbers
      const episodesSet = new Set<number>();
      const epRegex = /data-id="[^"/]+\/([0-9.]+)"/g;
      let epMatch: RegExpExecArray | null;
      while ((epMatch = epRegex.exec(html)) !== null) {
        const epNum = parseFloat(epMatch[1]);
        if (!isNaN(epNum)) {
          episodesSet.add(epNum);
        }
      }

      const sortedEpisodes = Array.from(episodesSet).sort((a, b) => a - b);
      return { episodes: sortedEpisodes, servers };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(
        { err: message, identifier, lang },
        "Failed to get episodes from AnimeHub",
      );
      return { episodes: [], servers: [] };
    }
  }

  async getStream(
    identifier: string,
    episode: number,
    lang: StreamLanguage,
    server = "0",
  ): Promise<StreamSource | null> {
    const log = getLogger();
    const slug = lang === "dub" ? `${identifier}-dub` : identifier;
    const animeUrl = `${BASE_URL}/anime/${slug}`;

    // Servers to try: the requested server, then fallback servers 0 and 10
    const candidateServers = Array.from(new Set([server, "0", "10"]));

    for (const s of candidateServers) {
      try {
        const infoUrl = `${BASE_URL}/ajax/episode/info?epr=${slug}/${episode}/${s}`;
        const infoRes = await this.fetchFn(infoUrl, {
          headers: {
            ...DEFAULT_HEADERS,
            Referer: animeUrl,
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!infoRes.ok) continue;
        const infoData = (await infoRes.json()) as { target?: string };
        const target = infoData.target;
        if (!target) continue;

        const targetUrl = new URL(target);
        const targetBase = targetUrl.origin;

        const embedRes = await this.fetchFn(target, {
          headers: {
            ...DEFAULT_HEADERS,
            Referer: animeUrl,
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!embedRes.ok) continue;
        const embedHtml = await embedRes.text();

        const zrMatch = embedHtml.match(/var\s+zrpart2\s*=\s*["']([^"']+)["']/);
        if (!zrMatch) continue;

        const zrpart2 = zrMatch[1];
        const hsUrl = `${targetBase}/hs/${encodeURIComponent(zrpart2)}?pl_usn=1`;

        const hsRes = await this.fetchFn(hsUrl, {
          headers: {
            ...DEFAULT_HEADERS,
            Referer: target,
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!hsRes.ok) continue;
        const hsHtml = await hsRes.text();

        const srcMatch = hsHtml.match(
          /<div[^>]*id=["']sources["'][^>]*>(.*?)<\/div>/s,
        );
        if (!srcMatch) continue;

        const sourcesData = JSON.parse(srcMatch[1]) as { sources?: string };
        const sourcesUrl = sourcesData.sources;
        if (!sourcesUrl) continue;

        return {
          url: sourcesUrl,
          container: "hls",
          headers: {
            Referer: `${targetBase}/`,
          },
          serverName:
            s === "0" ? "F5 - HQ" : s === "10" ? "No Ads 4" : `Server ${s}`,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(
          { err: message, slug, episode, server: s },
          "Server attempt failed, trying next",
        );
      }
    }

    return null;
  }
}
