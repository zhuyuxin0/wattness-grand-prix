# @gatelock/data

Reads the Wattness Terminal's public data release and free live tier at wattness.tech, checks every file's SHA-256 against the file that names it, and caches the bytes by hash.

```
release.json -> releases/<data>/current.json -> manifest.json -> catalogs/<aa>.json -> payload
live/v1/current.json -> days/<day>/<sha>.json -> points/<sha>.json, runs/<day>/<sha>.json
```

`aa` is the first two hex digits of `sha256(route)`. release.json and the live `current.json` are pointers and change; everything below them is named by its hash and never changes.

## Rules the code enforces

- No operating day in 2026-07-30..2026-09-29 is read. The guard runs when a route is built and again when it is read, before any fetch. History starts 2026-09-30.
- Only three release routes are readable: `/api/prices/<point>/<day>`, `/api/fleet-geo/v2/native` (census rows with node, zone, county and size; no revenue) and `/api/hedging/v1/walkthrough` (the showcase battery's power, declared energy and hub; `identity: "walkthrough"`). The fleet revenue routes and the other hedging routes are refused.
- No query strings: the gateway answers them with 400.

## Use

```sh
pnpm data:sync              # fetch, check, cache; writes cache/sync/latest.json
pnpm data:sync --offline    # replay latest.json from the cache, no network
```

```ts
import { centsDay, latestSnapshotPath, loadPlanInputs, readSnapshot } from "@gatelock/data";

const { inputs } = await loadPlanInputs({
  resource: "CLO_ESR1",
  offline: true,
  snapshot: readSnapshot(latestSnapshotPath()),
});
inputs.battery;            // CLO_RN, HB_HOUSTON, Harris, 100000 kW, 206438 kWh
inputs.hub.map(centsDay);  // HB_HOUSTON DA by hour, RT by 15 minutes, whole cents or null
inputs.live.node;          // CLO_RN, every SCED run on the free tier
inputs.files;              // { route, sha256, url } for every payload and live file read
```

The cache lives in `cache/` at the workspace root (`GATE_CACHE_DIR` overrides it): `cache/sha256/<aa>/<sha256>` holds bytes, `cache/sync/<sha256>.json` each snapshot.

Data: ERCOT, read from the Wattness Terminal's public release.
