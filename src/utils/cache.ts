import { LRUCache } from "lru-cache";

export interface CacheOptions {
  maxSize?: number;
  ttlMs?: number;
}

/**
 * High-performance, bounded LRU (Least Recently Used) cache powered by lru-cache.
 * Avoids unbounded memory growth in long-running services.
 */
export class BoundedCache<K extends {} = string, V extends {} = any> {
  private cache: LRUCache<K, V>;

  constructor(options?: CacheOptions) {
    this.cache = new LRUCache<K, V>({
      max: Math.max(1, options?.maxSize ?? 250),
      ttl: options?.ttlMs ?? 0,
      ttlResolution: 0,
      perf: { now: () => Date.now() },
    });
  }

  get(key: K): V | undefined {
    return this.cache.get(key);
  }

  set(key: K, value: V, customTtlMs?: number): this {
    this.cache.set(
      key,
      value,
      customTtlMs !== undefined ? { ttl: customTtlMs } : undefined,
    );
    return this;
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
