const NAMED_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&rsquo;": "'",
  "&lsquo;": "'",
  "&rdquo;": '"',
  "&ldquo;": '"',
  "&ndash;": "-",
  "&mdash;": "—",
  "&nbsp;": " ",
};

/**
 * Decodes HTML entities (named, numeric decimal, and numeric hex) in strings.
 */
export function decodeHtmlEntities(str: string): string {
  if (!str) return "";

  // Replace named entities
  let result = str.replace(
    /&(?:amp|quot|apos|lt|gt|rsquo|lsquo|rdquo|ldquo|ndash|mdash|nbsp);/g,
    (match) => NAMED_ENTITIES[match] || match,
  );

  // Replace numeric entities: decimal (&#39;) and hex (&#x27;)
  result = result.replace(/&#(?:x([0-9a-fA-F]+)|([0-9]+));/g, (_, hex, dec) => {
    try {
      const code = hex ? parseInt(hex, 16) : parseInt(dec, 10);
      return String.fromCharCode(code);
    } catch {
      return _;
    }
  });

  return result;
}
