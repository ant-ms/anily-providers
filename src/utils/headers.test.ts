import { describe, it, expect } from "vitest";
import { DEFAULT_USER_AGENT, getDefaultHeaders } from "./headers.js";

describe("headers", () => {
  it("provides standard user agent", () => {
    expect(DEFAULT_USER_AGENT).toContain("Mozilla/5.0");
    expect(DEFAULT_USER_AGENT).toContain("Chrome");
  });

  it("merges extra headers with default user agent", () => {
    const headers = getDefaultHeaders({
      Referer: "https://example.com/",
      "X-Custom": "custom-val",
    });

    expect(headers["User-Agent"]).toBe(DEFAULT_USER_AGENT);
    expect(headers.Referer).toBe("https://example.com/");
    expect(headers["X-Custom"]).toBe("custom-val");
  });

  it("allows overriding User-Agent if explicitly provided", () => {
    const headers = getDefaultHeaders({ "User-Agent": "Custom-Agent/1.0" });
    expect(headers["User-Agent"]).toBe("Custom-Agent/1.0");
  });
});
