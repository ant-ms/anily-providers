import { decode } from "html-entities";

/**
 * Decodes all HTML5 named, decimal, and hexadecimal entities,
 * normalizing curly quotes and en-dashes to standard ASCII.
 */
export function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  return decode(str)
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–/g, "-");
}
