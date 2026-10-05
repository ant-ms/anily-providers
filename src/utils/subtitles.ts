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

  const filtered = rawSubs.filter((sub) => {
    const url = sub.file || sub.src;
    const isThumbnail =
      sub.kind === "thumbnails" ||
      (sub.lang && sub.lang.toLowerCase() === "thumbnails");
    return Boolean(url && !isThumbnail);
  });

  const hasExplicitDefault = filtered.some((s) => s.default === true);

  return filtered.map((sub, idx) => {
    const url = (sub.file || sub.src)!;
    const rawLabel = sub.label || sub.lang || "English";

    // If label specifies a known non-English language (e.g. Arabic, French, German),
    // prioritize the label over generic upstream lang: "en"
    const labelLang = sub.label ? normalizeLanguageCode(sub.label) : null;
    const isLabelNonEnglish = Boolean(labelLang && labelLang !== "en");

    const language = isLabelNonEnglish
      ? labelLang!
      : normalizeLanguageCode(sub.lang || sub.label || "en");

    let isDefault = false;
    if (hasExplicitDefault) {
      isDefault = sub.default === true;
    } else {
      // Default to the first English track if no subtitle is explicitly marked default
      const isEnglish =
        language === "en" || rawLabel.toLowerCase().includes("english");
      const firstEnIndex = filtered.findIndex((s) => {
        const sLabelLang = s.label ? normalizeLanguageCode(s.label) : null;
        const sIsNonEn = Boolean(sLabelLang && sLabelLang !== "en");
        const sLang = sIsNonEn
          ? sLabelLang!
          : normalizeLanguageCode(s.lang || s.label || "en");
        return (
          sLang === "en" || (s.label || "").toLowerCase().includes("english")
        );
      });
      isDefault = isEnglish && idx === (firstEnIndex >= 0 ? firstEnIndex : 0);
    }

    return {
      label: rawLabel,
      language,
      url,
      default: isDefault,
    };
  });
}
