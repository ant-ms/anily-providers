import { describe, it, expect, vi } from "vitest";
import { BoundedCache } from "../../src/utils/cache.js";

describe("BoundedCache", () => {
  it("stores and retrieves items", () => {
    const cache = new BoundedCache<string, number>({ maxSize: 3 });
    cache.set("a", 1);
    cache.set("b", 2);

    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBeUndefined();
    expect(cache.has("a")).toBe(true);
    expect(cache.has("c")).toBe(false);
    expect(cache.size).toBe(2);
  });

  it("evicts least recently used items when maxSize is exceeded", () => {
    const cache = new BoundedCache<string, string>({ maxSize: 2 });
    cache.set("first", "1");
    cache.set("second", "2");

    // Access "first" so "second" becomes LRU
    cache.get("first");

    // Insert third item -> "second" should be evicted
    cache.set("third", "3");

    expect(cache.get("first")).toBe("1");
    expect(cache.get("third")).toBe("3");
    expect(cache.get("second")).toBeUndefined();
    expect(cache.size).toBe(2);
  });

  it("expires items when TTL is exceeded", () => {
    vi.useFakeTimers();
    try {
      const cache = new BoundedCache<string, string>({ ttlMs: 1000 });
      cache.set("temp", "value");

      expect(cache.get("temp")).toBe("value");

      // Advance time beyond TTL
      vi.advanceTimersByTime(1500);

      expect(cache.get("temp")).toBeUndefined();
      expect(cache.has("temp")).toBe(false);
      expect(cache.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("supports delete and clear", () => {
    const cache = new BoundedCache<string, number>({ maxSize: 5 });
    cache.set("a", 1);
    cache.set("b", 2);

    expect(cache.delete("a")).toBe(true);
    expect(cache.delete("unknown")).toBe(false);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(1);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("b")).toBeUndefined();
  });
});
