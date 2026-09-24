import { describe, it, expect } from "vitest";
import { decodeHtmlEntities } from "./html.js";

describe("decodeHtmlEntities", () => {
  it("decodes named entities correctly", () => {
    expect(decodeHtmlEntities("&quot;Hello &amp; World&quot;")).toBe(
      '"Hello & World"',
    );
    expect(decodeHtmlEntities("&lt;tag&gt;")).toBe("<tag>");
    expect(decodeHtmlEntities("It&rsquo;s &lsquo;fine&rsquo;")).toBe(
      "It's 'fine'",
    );
    expect(decodeHtmlEntities("&ldquo;Quotes&rdquo;")).toBe('"Quotes"');
    expect(decodeHtmlEntities("word&ndash;word&mdash;word")).toBe(
      "word-word—word",
    );
  });

  it("decodes decimal numeric entities", () => {
    expect(decodeHtmlEntities("Sousou no Frieren &#39;Journey&#39;")).toBe(
      "Sousou no Frieren 'Journey'",
    );
    expect(decodeHtmlEntities("&#039;Test&#039;")).toBe("'Test'");
  });

  it("decodes hexadecimal numeric entities", () => {
    expect(decodeHtmlEntities("Anime &#x27;Title&#x27;")).toBe("Anime 'Title'");
    expect(decodeHtmlEntities("&#x22;Double Quote&#x22;")).toBe(
      '"Double Quote"',
    );
  });

  it("decodes HTML5 extended entities", () => {
    expect(decodeHtmlEntities("Loading&hellip; &copy; 2026 &trade;")).toBe(
      "Loading… © 2026 ™",
    );
  });

  it("handles empty or falsy strings gracefully", () => {
    expect(decodeHtmlEntities("")).toBe("");
  });
});
