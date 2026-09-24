import { describe, it, expect } from "vitest";
import {
  deobfuscateOtakuBlob,
  obfuscateOtakuBlob,
} from "../../src/utils/cipher.js";

describe("cipher (otaku-embed XOR)", () => {
  it("encrypts and decrypts text correctly in a roundtrip", () => {
    const original = JSON.stringify({
      src: "https://example.com/master.m3u8",
      subtitles: [{ lang: "English", src: "https://example.com/sub.vtt" }],
    });

    const encrypted = obfuscateOtakuBlob(original);
    expect(encrypted).not.toBe(original);
    expect(typeof encrypted).toBe("string");

    const decrypted = deobfuscateOtakuBlob(encrypted);
    expect(decrypted).toBe(original);
  });

  it("handles custom XOR keys", () => {
    const text = "hello-world-testing-custom-key";
    const customKey = "secret-key-123";

    const encrypted = obfuscateOtakuBlob(text, customKey);
    const decrypted = deobfuscateOtakuBlob(encrypted, customKey);

    expect(decrypted).toBe(text);
  });

  it("handles empty strings", () => {
    const encrypted = obfuscateOtakuBlob("");
    expect(encrypted).toBe("");
    expect(deobfuscateOtakuBlob("")).toBe("");
  });
});
