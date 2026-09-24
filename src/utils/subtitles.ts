import type { SubtitleTrack } from "../types.js";

const LANGUAGE_CODE_MAP: Record<string, string> = {
  spanish: "es",
  french: "fr",
  german: "de",
  italian: "it",
  portuguese: "pt",
  russian: "ru",
  arabic: "ar",
  japanese: "ja",
  chinese: "zh",
  korean: "ko",
};

export function normalizeLanguageCode(labelOrLang: string): string {
  const lower = (labelOrLang || "").toLowerCase().trim();
  if (
    lower.startsWith("eng") ||
    lower.startsWith("en-") ||
    lower.startsWith("en_") ||
    lower === "en" ||
    lower.includes("english")
  ) {
    return "en";
  }

  for (const [name, code] of Object.entries(LANGUAGE_CODE_MAP)) {
    if (lower.includes(name)) return code;
  }

  return lower || "en";
}

export interface RawSubtitle {
  file?: string;
  src?: string;
  label?: string;
  lang?: string;
  kind?: string;
  default?: boolean;
}

export function parseSubtitles(rawSubs?: RawSubtitle[]): SubtitleTrack[] {
  if (!rawSubs || !Array.isArray(rawSubs)) return [];

  return rawSubs
    .filter((sub) => {
      const url = sub.file || sub.src;
      const isThumbnail =
        sub.kind === "thumbnails" ||
        (sub.lang && sub.lang.toLowerCase() === "thumbnails");
      return Boolean(url && !isThumbnail);
    })
    .map((sub) => {
      const url = (sub.file || sub.src)!;
      const rawLabel = sub.label || sub.lang || "English";
      const language = normalizeLanguageCode(sub.lang || sub.label || "en");
      const isDefault = Boolean(
        sub.default ||
        rawLabel.toLowerCase().includes("english") ||
        language === "en",
      );

      return {
        label: rawLabel,
        language,
        url,
        default: isDefault,
      };
    });
}
