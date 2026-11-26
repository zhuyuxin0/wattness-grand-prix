# Edge Worker

A Cloudflare Worker that serves the Grand Prix's sealed records from Cloudflare's edge. It reads each operating
day's files from the public BNB Greenfield bucket and serves a file only after checking it against GateRecord
(`0x2922c68cE15EB3e83B7f43b136e981dDc4262876`) on BSC. A file that fails a check is answered with 502 and the
reason, never with its bytes.

Live at https://grand-prix-edge.wattness.workers.dev. `GET /` lists the endpoints and what each checks.

```sh
curl -sI https://grand-prix-edge.wattness.workers.dev/day/2026-11-26/leaves/DSWL_ESS_ESR1.json | grep x-gate
curl -s "https://grand-prix-edge.wattness.workers.dev/verify/DSWL_ESS_ESR1?od=2026-11-26&network=bsc-mainnet"
```

## Endpoints

| Request | Answer |
|---|---|
| `GET /day/<day>/index.json` | The day's index (`manifest.json` on Greenfield): one leaf hash per battery, in resource order |
| `GET /day/<day>/<path>` | A file of the day: a leaf, a scenario set, a receipt, `root.hex`, `salt.txt`, or a file a leaf names |
| `GET /verify/<battery>?od=<day>&network=bsc-mainnet` | A JSON verdict for one battery's plan, check by check |
| `GET /` | The endpoints, in plain text |

`<day>` is `YYYY-MM-DD` or `YYYYMMDD`. `?network=` takes `bsc-mainnet` (the default), `bsc-testnet`, or both,
comma-separated. `?envelope=1` returns a file wrapped in JSON with every check, the values each compared, the
on-chain record and the document.

## What vouches for each file

GateRecord holds one record per committer, scope and operating day: a root, its leaf count and the git tree of
the code that produced it. Everything else hangs from that root.

| File | Served once |
|---|---|
| index | its shape holds (core's `fleetIndexErrors`); the RFC 6962 root over its leaf hashes, in order, is its root; `GateRecord.keyOf` returns the key computed here; `GateRecord.get(key)` holds that root, leaf count, code tree, day, scope and committer; the gate, computed as `GateRecord.gateTs` computes it, agrees with the contract's answer and the index, and the record was committed before it |
| `leaves/<R>.json` | SHA-256(0x00 ‖ RFC 8785 form) is the index's leaf for R, and the document is R's plan for that day by the served wallet |
| `leaves/<R>.scenarios.json` | SHA-256 of its RFC 8785 form is the digest R's verified leaf names |
| `record.<network>.json` | every field is what GateRecord holds on that network, there are no other fields, and the transaction it names succeeded in the record's block and logged one matching `Committed` event |
| `root.hex` | it is the root GateRecord holds |
| `salt.txt` | it is the salt inside the showcase battery's verified leaf |
| a file a leaf names | SHA-256 of its bytes is the digest the verified leaf records, as for an outside input's saved response (`cournot/probability.json`) |

Every JSON file must also be its document's own rendering, pretty-printed with a final newline or in RFC 8785
form. A hash covers a document, not its whitespace; this rule means no byte is served that the document does not
determine, including a duplicate key that one parser would read one way and another the other.

GateRecord accepts records from any wallet. The Worker serves those of the agent wallet named in
`wrangler.jsonc` (`COMMITTER`), under the scope `gate-record/ercot-da-energy`.

No hash covers the index's `exclusions`, `showcase` and `plan_unix`, or its file paths; the response names them
in `x-gate-not-covered`. A leaf's own `battery.resource` is checked whenever the leaf is served, so the index
cannot serve one battery's plan under another's name. Files no hash names, such as `sync/<R>.json`, answer 404
with their Greenfield URL.

The verdict's checks follow the repository verifier's V1 (the root from the leaf and its audit path), V2 (the
record key and the record at it) and V3 (the gate) and print the same lines. `test/verify.test.ts` compares them
with `packages/verifier`'s output on the same chain answers, for the sealed leaf and for one with a changed digit.

## Headers

On a served file: `x-gate-verified`, `x-gate-network`, `x-gate-root`, `x-gate-record-key`, `x-gate-block`,
`x-gate-confirmations`, `x-gate-checks`, `x-gate-basis` (what the bytes were checked against, in one line),
`x-gate-sha256` (of the bytes served), `x-gate-source` (the Greenfield URL), `x-gate-cache`. CORS is open for
`GET` and every `x-gate-` header is exposed, so a page on another origin can read them.

## Caching

A verified response on a record at least 15 blocks deep is put in the edge cache (the Cache API) and marked
`public, max-age=300, s-maxage=86400`. GateRecord is write-once, so a file verified against a day's root stays
verified. Nothing is cached before it is verified: refusals, 404s and responses on a fresher record carry
`no-store`. Each isolate also keeps the indexes and leaves it has verified, so a burst of requests for one day
reads the chain once.

## Run it

Node 22 and pnpm 11. This folder has its own lockfile and is not part of the root workspace.

```sh
cd workers/edge
pnpm install
pnpm test                                  # in the Workers runtime, in process; upstreams answered from fixtures
EDGE_LIVE=1 pnpm test test/live.test.ts    # the same Worker against Greenfield and the public BSC RPCs
pnpm typecheck
pnpm bundle                                # wrangler deploy --dry-run into dist/
```

The tests read the sealed day in `fixtures/od-20261126` and GateRecord's answers recorded in
`test/fixtures/chain.json`. `pnpm golden` rebuilds `test/fixtures/verifier.json` by running `packages/verifier`
over those answers (`node scripts/golden.ts --record` reads the chain again first); it needs the root workspace
installed and built (`pnpm install && pnpm --filter "@gatelock/verifier..." build` from the repository root).

## Deploy

```sh
pnpm run deploy
node scripts/smoke.ts https://grand-prix-edge.<subdomain>.workers.dev --out <dir>
```

`scripts/deploy.ts` reads `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from the secrets file
`GATE_SECRETS_ENV` names (see `.env.example`), passes them to wrangler in its environment, and masks both in
wrangler's output. The token needs one permission, Account › Workers Scripts › Edit, for that account, and the
account needs a workers.dev subdomain. `scripts/smoke.ts` calls every endpoint for 26 Nov and checks each file
against the SHA-256 the publisher recorded (`scripts/greenfield/published.json`).

## Limits

The free plan allows 10 ms of CPU per request. Hashing uses the runtime's native SHA-256 (`node:crypto`), and
canonical JSON hands arrays of integers to the runtime's `JSON.stringify`; `test/jcs.test.ts` checks the result
against the canonicalize package that core uses. In a fresh Node 22 process with the upstreams answered from
memory, a cold request takes about 5 ms for an index, 7 ms for a leaf with its index, 9 ms for a scenario set
with its leaf and index, and 7 ms for a verdict once the process has loaded ICU's time-zone data; warm, 1 to
3 ms. Bundled, the Worker is 78 KiB (22 KiB gzipped).

Cloudflare's edge answers some default client signatures (Python's `urllib`, for one) with error 1010 before the
Worker runs; setting a `User-Agent` header avoids it.

## Layout

| Path | What it holds |
|---|---|
| `src/index.ts` | Routes, the edge cache |
| `src/record.ts` | What vouches for each file, and the checks |
| `src/verdict.ts` | `/verify/<battery>` |
| `src/chain.ts`, `src/abi.ts` | GateRecord over public JSON-RPC: `keyOf`, `get`, `gateTs`, the commit receipt |
| `src/greenfield.ts` | Reads from the bucket |
| `src/merkle.ts`, `src/jcs.ts`, `src/bytes.ts` | Core's leaf hash, RFC 6962 tree and RFC 8785 form, on the runtime's SHA-256 |
| `src/respond.ts`, `src/page.ts`, `src/config.ts` | Responses and headers, the `/` page, bindings |
| `scripts/` | `deploy.ts`, `smoke.ts`, `golden.ts` |
| `test/` | The tests, the chain answers and the verifier's output they compare against |

The gate clock is `packages/core/src/gate.ts` itself, bundled from source.

Data: ERCOT, read from the Wattness Terminal's public release. Calculation: this repository.
