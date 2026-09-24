/**
 * Deobfuscates base64-encoded otaku-embed blobs via cyclic XOR.
 *
 * @param b64 Base64 encoded payload
 * @param key XOR key (defaults to "otaku-embed-v1")
 */
export function deobfuscateOtakuBlob(
  b64: string,
  key = "otaku-embed-v1",
): string {
  const buf = Buffer.from(b64, "base64");
  const keyBuf = Buffer.from(key, "utf8");
  const out = Buffer.alloc(buf.length);

  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i] ^ keyBuf[i % keyBuf.length];
  }

  return out.toString("utf8");
}

/**
 * Obfuscates plain text into base64-encoded otaku-embed blob via cyclic XOR (useful for test fixtures).
 */
export function obfuscateOtakuBlob(
  plainText: string,
  key = "otaku-embed-v1",
): string {
  const buf = Buffer.from(plainText, "utf8");
  const keyBuf = Buffer.from(key, "utf8");
  const out = Buffer.alloc(buf.length);

  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i] ^ keyBuf[i % keyBuf.length];
  }

  return out.toString("base64");
}
