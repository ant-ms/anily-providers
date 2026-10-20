import type { ProviderSearchResult, TitleMatcherOptions } from "./types.js";
import { getLogger } from "./utils/logger.js";

export type { TitleMatcherOptions };

export function normalizeTitle(str: string): string {
  return str
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\band\b/g, "to")
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

export const OPENROUTER_DECISION_MODEL = "~typesafe/jev-latest";

export async function callOpenRouterFallback(
  targetTitle: string,
  candidates: ProviderSearchResult[],
  apiKey?: string,
  targetTitles?: string[],
): Promise<ProviderSearchResult | null> {
  const key = apiKey || process.env.OPENROUTER_API_KEY;
  if (!key || candidates.length === 0) return null;
  const log = getLogger();

  try {
    const topCandidates = candidates.slice(0, 10);
    const allTitles =
      targetTitles && targetTitles.length > 0 ? targetTitles : [targetTitle];
    const targetSeason = extractSeasonNumber(targetTitle) ?? 1;

    const criteria: Record<string, string> = {};
    topCandidates.forEach((c, idx) => {
      criteria[`c${idx}`] = `${c.name} (id: ${c.identifier})`;
    });
    criteria["none"] = "None of the candidates match";

    const response = await fetch("https://openrouter.ai/api/alpha/decisions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_DECISION_MODEL,
        state: {
          targetTitles: allTitles,
          targetSeason,
          candidates: topCandidates.map((c, idx) => ({
            choiceKey: `c${idx}`,
            name: c.name,
            identifier: c.identifier,
          })),
        },
        questions: {
          match: {
            type: "choice",
            instructions: `Which candidate is the exact match for ${allTitles.join(" / ")}${targetSeason > 1 ? ` (Season ${targetSeason})` : " (Season 1 / main series)"}? Be strict: match the exact season, and do not select movies, OVAs, or spin-offs unless explicitly requested. If no candidate matches, select none.`,
            criteria,
          },
        },
      }),
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      log.warn(
        {
          status: response.status,
          targetTitle,
          model: OPENROUTER_DECISION_MODEL,
        },
        "OpenRouter title matcher HTTP error",
      );
      return null;
    }

    const rawData = (await response.json()) as any;

    // Handle mock or legacy chat responses if returned
    if (Array.isArray(rawData?.choices)) {
      const legacyAnswer = rawData.choices[0]?.message?.content?.trim() || "";
      if (!legacyAnswer || legacyAnswer.toUpperCase() === "NONE") return null;
      const legacyIdx = parseInt(legacyAnswer.replace(/[^0-9]/g, ""), 10);
      if (
        !isNaN(legacyIdx) &&
        legacyIdx >= 0 &&
        legacyIdx < candidates.length
      ) {
        return candidates[legacyIdx];
      }
    }

    const matchAnswer = rawData.answers?.match;
    const choice = matchAnswer?.choice;

    if (!choice || choice === "none") {
      return null;
    }

    const matchIdx = choice.startsWith("c")
      ? parseInt(choice.slice(1), 10)
      : NaN;
    if (!isNaN(matchIdx) && matchIdx >= 0 && matchIdx < topCandidates.length) {
      const candidate = topCandidates[matchIdx];

      // Guard against season or special mismatch
      const isSpecial =
        SPECIAL_REGEX.test(candidate.name) ||
        SPECIAL_REGEX.test(candidate.identifier);
      const targetIsSpecial = allTitles.some((t) => SPECIAL_REGEX.test(t));
      if (isSpecial && !targetIsSpecial) {
        log.warn(
          { targetTitle, candidate: candidate.name },
          "Jev candidate rejected: candidate is special/movie but query is not",
        );
        return null;
      }

      const candSeason = extractSeasonNumber(candidate.name) ?? 1;
      if (candSeason !== targetSeason) {
        log.warn(
          {
            targetTitle,
            targetSeason,
            candSeason,
            candidate: candidate.name,
          },
          "Jev candidate rejected: season mismatch",
        );
        return null;
      }

      log.info(
        {
          targetTitle,
          matched: candidate.name,
          confidence: matchAnswer?.confidence,
        },
        "OpenRouter Jev matched anime title",
      );
      return candidate;
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

const SPECIAL_REGEX =
  /\b(movie|ova|ona|special|recap|film|gekijouban|sotsugyou|graduation|chottoshita|tiny\s+episode)\b/i;

function cleanIdentifierSlug(identifier: string): string {
  return identifier
    .replace(/^[a-z0-9_-]+:\/\/[^/]+\//, "")
    .replace(/^[a-z0-9_-]+:/, "")
    .replace(/-\d+$/, "")
    .replace(/[^a-zA-Z0-9]/g, " ")
    .trim();
}

/**
 * Resolves the best matching anime result through a three-tier hierarchy:
 * 1. Normalized exact title or slug comparison
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

  // 1. Exact normalized title or slug/identifier match
  for (const target of cleanTargets) {
    const exact = searchResults.find((r) => {
      if (normalizeTitle(r.name) === target.norm) return true;
      const slugNorm = normalizeTitle(cleanIdentifierSlug(r.identifier));
      return slugNorm.length > 0 && slugNorm === target.norm;
    });
    if (exact) return exact;
  }

  // 2. Custom or OpenRouter LLM matcher
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
      validTitles,
    );
    if (llmMatch) return llmMatch;
  }

  // 3. Heuristic similarity scoring
  const primary = cleanTargets[0];
  const targetSeason = primary.season ?? 1;

  let bestMatch: ProviderSearchResult | null = null;
  let bestScore = -Infinity;

  for (const candidate of searchResults) {
    const candNorm = normalizeTitle(candidate.name);
    const candSlugNorm = normalizeTitle(
      cleanIdentifierSlug(candidate.identifier),
    );
    const candSeason = extractSeasonNumber(candidate.name) ?? 1;

    let score = 0;

    const isSpecial =
      SPECIAL_REGEX.test(candidate.name) ||
      SPECIAL_REGEX.test(candidate.identifier);
    const targetIsSpecial = cleanTargets.some((t) =>
      SPECIAL_REGEX.test(t.original),
    );

    if (!isSpecial && candSeason === targetSeason) {
      score += 50;
    } else if (candSeason !== targetSeason) {
      score -= 50;
    }

    if (isSpecial && !targetIsSpecial) {
      score -= 60;
    }

    // Award points for substring and length closeness across all candidate titles
    let minLenDiff = Infinity;
    for (const t of cleanTargets) {
      if (candNorm.includes(t.norm) || t.norm.includes(candNorm)) {
        score += 30;
        const diff = Math.abs(candNorm.length - t.norm.length);
        if (diff < minLenDiff) minLenDiff = diff;
      }
      if (
        candSlugNorm &&
        (candSlugNorm.includes(t.norm) || t.norm.includes(candSlugNorm))
      ) {
        score += 25;
        const diff = Math.abs(candSlugNorm.length - t.norm.length);
        if (diff < minLenDiff) minLenDiff = diff;
      }
    }
    if (minLenDiff < Infinity) {
      score += Math.max(0, 20 - minLenDiff);
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestMatch || searchResults[0];
}
