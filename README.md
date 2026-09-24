# @ant.ms/anily-providers

High-reliability anime streaming provider resolvers, scrapers, and stream quality verifiers for Anily.

## Features

- **Multi-Provider Scraping & Resolving**: Built-in support for JustAnime, HiAnime, and AnimeHub.
- **Provider Registry**: Unified interface for multi-provider querying, language routing (`sub` / `dub`), and automatic failover.
- **Quality Scoring Engine**: Benchmarked server scoring prioritizing fast CDNs (MegaPlay, ZokoAnime) and full HD resolution.
- **Deep Health Check Probing**: Pre-flight verification down to HLS variant playlists and video segment bytes.
- **Title Matching & Season Parsing**: Normalized fuzzy matching, token overlap, and season extraction with optional OpenRouter LLM fallback.
- **Zero Runtime Dependencies**: Uses Node 20+ native `fetch`, `Buffer`, and `crypto`.
- **Hermetic Testing & Live Monitoring**: Unit tests with recorded fixtures alongside scheduled live upstream provider verification.

## Installation

```bash
pnpm add @ant.ms/anily-providers
# or
npm install @ant.ms/anily-providers
```

## Usage

```typescript
import { registry, probeStreamHealth } from "@ant.ms/anily-providers";

// 1. Check stream availability across all providers
const services = await registry.checkAvailability(
  ["Sousou no Frieren", "Frieren: Beyond Journey's End"],
  1, // episode number
);

console.log("Found services:", services);

// 2. Resolve the highest-ranked stream
if (services.length > 0) {
  const topService = services[0];
  const stream = await registry.resolveStream(
    topService.providerId,
    topService.identifier,
    1,
    topService.language,
    topService.serverId,
  );

  if (stream) {
    // 3. Pre-flight health check
    const isLive = await probeStreamHealth(stream, 2500);
    console.log("Stream is healthy:", isLive, stream.url);
  }
}
```

## Running Tests

### Unit Tests (Hermetic & Fast)

Runs in milliseconds with saved mocks and fixtures. No network access required:

```bash
pnpm test
```

### Live Provider Health Tests

Executes real network requests against active streaming providers to verify upstream functionality:

```bash
pnpm test:live
```

## License

MIT © Yanik Ammann
