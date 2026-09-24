# @ant.ms/anily-providers

Anime streaming provider resolvers, scrapers, and stream quality verifiers for Anily.

And yes, this library is mostly AI coded.

## Installation

```bash
npm install @ant.ms/anily-providers
# or
pnpm add @ant.ms/anily-providers
```

## Usage

```typescript
import { registry, probeStreamHealth } from "@ant.ms/anily-providers";

const services = await registry.checkAvailability(
  ["Sousou no Frieren", "Frieren: Beyond Journey's End"],
  1, // episode number
);

console.log("Found services:", services);

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
    const isLive = await probeStreamHealth(stream, 2500);
    console.log("Stream is healthy:", isLive, stream.url);
  }
}
```
