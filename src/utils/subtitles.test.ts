import { describe, it, expect } from "vitest";
import { normalizeLanguageCode, parseSubtitles } from "./subtitles.js";

describe("subtitles utility", () => {
  describe("normalizeLanguageCode", () => {
    it("normalizes English language variations to 'en'", () => {
      expect(normalizeLanguageCode("English")).toBe("en");
      expect(normalizeLanguageCode("eng")).toBe("en");
      expect(normalizeLanguageCode("en-US")).toBe("en");
    });

    it("normalizes known non-English language codes", () => {
      expect(normalizeLanguageCode("Spanish")).toBe("es");
      expect(normalizeLanguageCode("French")).toBe("fr");
      expect(normalizeLanguageCode("German")).toBe("de");
      expect(normalizeLanguageCode("Italian")).toBe("it");
      expect(normalizeLanguageCode("Portuguese")).toBe("pt");
      expect(normalizeLanguageCode("Russian")).toBe("ru");
      expect(normalizeLanguageCode("Arabic")).toBe("ar");
      expect(normalizeLanguageCode("Japanese")).toBe("ja");
    });

    it("defaults unknown or empty strings gracefully", () => {
      expect(normalizeLanguageCode("")).toBe("en");
      expect(normalizeLanguageCode("swahili")).toBe("swahili");
    });
  });

  describe("parseSubtitles", () => {
    it("returns empty array for null, undefined, or empty input", () => {
      expect(parseSubtitles()).toEqual([]);
      expect(parseSubtitles([])).toEqual([]);
    });

    it("filters out thumbnail tracks", () => {
      const parsed = parseSubtitles([
        { file: "https://example.com/thumb.vtt", kind: "thumbnails" },
        { src: "https://example.com/thumb2.vtt", lang: "thumbnails" },
        { file: "https://example.com/en.vtt", label: "English" },
      ]);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].url).toBe("https://example.com/en.vtt");
    });

    it("maps both 'file' and 'src' properties into SubtitleTrack", () => {
      const parsed = parseSubtitles([
        { file: "https://example.com/es.vtt", label: "Spanish" },
        { src: "https://example.com/fr.vtt", lang: "French" },
      ]);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].language).toBe("es");
      expect(parsed[1].language).toBe("fr");
    });

    it("correctly identifies non-English languages when upstream provides generic lang 'en'", () => {
      const parsed = parseSubtitles([
        { file: "https://example.com/en.vtt", label: "English", lang: "en" },
        { file: "https://example.com/ar.vtt", label: "Arabic", lang: "en" },
        { file: "https://example.com/fr.vtt", label: "French", lang: "en" },
        { file: "https://example.com/de.vtt", label: "German", lang: "en" },
      ]);

      expect(parsed).toHaveLength(4);
      expect(parsed[0].language).toBe("en");
      expect(parsed[0].default).toBe(true);

      expect(parsed[1].language).toBe("ar");
      expect(parsed[1].default).toBe(false);

      expect(parsed[2].language).toBe("fr");
      expect(parsed[2].default).toBe(false);

      expect(parsed[3].language).toBe("de");
      expect(parsed[3].default).toBe(false);
    });
  });
});
