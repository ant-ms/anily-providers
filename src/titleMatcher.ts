import type { ProviderSearchResult, TitleMatcherOptions } from "./types.js";
import { getLogger } from "./utils/logger.js";

export type { TitleMatcherOptions };

export function normalizeTitle(str: string): string {
  return str
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

const ROMAN_NUMERALS: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
  xi: 11,
  xii: 12,
};

export function extractSeasonNumber(title: string): number | null {
  const t = title.toLowerCase();

  const m1 = t.match(/\b(?:season|s)\s*([0-9]+)\b/);
  if (m1) return parseInt(m1[1], 10);

  const m2 = t.match(/\b([0-9]+)(?:st|nd|rd|th)\s+season\b/);
  if (m2) return parseInt(m2[1], 10);

  const mSeasonRoman = t.match(/\bseason\s+([ivx]+)\b/);
  if (mSeasonRoman && ROMAN_NUMERALS[mSeasonRoman[1]]) {
    return ROMAN_NUMERALS[mSeasonRoman[1]];
  }

  const mRoman = t.match(/\b(ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\b/);
  if (mRoman && ROMAN_NUMERALS[mRoman[1]]) {
    return ROMAN_NUMERALS[mRoman[1]];
  }

  return null;
}

export async function callOpenRouterFallback(
  targetTitle: string,
  candidates: ProviderSearchResult[],
  apiKey?: string,
  model = "google/gemini-2.5-flash-lite",
): Promise<ProviderSearchResult | null> {
  const key = apiKey || process.env.OPENROUTER_API_KEY;
  if (!key || candidates.length === 0) return null;
  const log = getLogger();

  try {
    const listStr = candidates
      .slice(0, 10)
      .map((c, i) => `[${i}] ${c.name} (id: ${c.identifier})`)
      .join("\n");

    const prompt = `You are an anime title matching system.
We are looking for the exact anime titled: "${targetTitle}".
Here are the provider's search results:
${listStr}

Which index ([0], [1], etc.) is the correct match for "${targetTitle}"?
Be very careful with Season numbers, OVAs, movies, and spin-offs.
If the query is Season 1 or has no season specified, choose Season 1 / main series (not Season 2, OVA, or movie).
If none are correct, reply with "NONE".
Reply with ONLY the index number (e.g. "0" or "1") or "NONE".`;

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
        }),
        signal: AbortSignal.timeout(3000),
      },
    );

    if (!response.ok) {
      log.warn(
        { status: response.status, targetTitle },
        "OpenRouter title matcher HTTP error",
      );
      return null;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const answer = data.choices?.[0]?.message?.content?.trim() || "";

    if (!answer || answer.toUpperCase() === "NONE") return null;

    const idx = parseInt(answer.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(idx) && idx >= 0 && idx < candidates.length) {
      log.info(
        { targetTitle, matched: candidates[idx].name },
        "OpenRouter matched anime title",
      );
      return candidates[idx];
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(
      { err: message, targetTitle },
      "OpenRouter title matcher failed, using heuristic fallback",
    );
  }

  return null;
}

/**
 * Resolves the best matching anime result through a three-tier hierarchy:
 * 1. Normalized exact title comparison
 * 2. LLM fallback (OpenRouter or user-injected semantic matcher)
 * 3. Heuristic similarity scoring (season weighting, special/OVA penalties, substring distance)
 */
export async function matchBestSearchResult(
  targetTitles: string[],
  searchResults: ProviderSearchResult[],
  options?: TitleMatcherOptions,
): Promise<ProviderSearchResult | null> {
  if (searchResults.length === 0) return null;
  if (searchResults.length === 1) return searchResults[0];

  const validTitles = (targetTitles || [])
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter((t): t is string => t.length > 0);

  if (validTitles.length === 0) {
    return searchResults[0];
  }

  const cleanTargets = validTitles.map((t) => ({
    original: t,
    norm: normalizeTitle(t),
    season: extractSeasonNumber(t),
  }));

  for (const target of cleanTargets) {
    const exact = searchResults.find(
      (r) => normalizeTitle(r.name) === target.norm,
    );
    if (exact) return exact;
  }

  if (options?.customLlmMatcher) {
    try {
      const customMatch = await options.customLlmMatcher(
        cleanTargets[0].original,
        searchResults,
      );
      if (customMatch) return customMatch;
    } catch {}
  } else if (options?.openRouterApiKey || process.env.OPENROUTER_API_KEY) {
    const llmMatch = await callOpenRouterFallback(
      cleanTargets[0].original,
      searchResults,
      options?.openRouterApiKey,
      options?.openRouterModel,
    );
    if (llmMatch) return llmMatch;
  }

  const primary = cleanTargets[0];
  const targetSeason = primary.season ?? 1;

  let bestMatch: ProviderSearchResult | null = null;
  let bestScore = -Infinity;

  for (const candidate of searchResults) {
    const candNorm = normalizeTitle(candidate.name);
    const candSeason = extractSeasonNumber(candidate.name) ?? 1;

    let score = 0;

    const isSpecial = /\b(movie|ova|special|recap)\b/i.test(candidate.name);
    const targetIsSpecial = /\b(movie|ova|special|recap)\b/i.test(
      primary.original,
    );

    if (!isSpecial && candSeason === targetSeason) {
      score += 50;
    } else if (candSeason !== targetSeason) {
      score -= 50;
    }

    if (isSpecial && !targetIsSpecial) {
      score -= 60;
    }

    if (candNorm.includes(primary.norm) || primary.norm.includes(candNorm)) {
      score += 30;
      const lenDiff = Math.abs(candNorm.length - primary.norm.length);
      score += Math.max(0, 20 - lenDiff);
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestMatch || searchResults[0];
}
