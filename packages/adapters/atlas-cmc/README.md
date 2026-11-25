# Atlas and CoinMarketCap adapter

Server-side TypeScript that reads BNB and USDT prices from Atlas's signed Pull reports and from CoinMarketCap Pro,
reads CoinMarketCap's security fields for BSC-USDT, and turns them into a reference budget for evaluations. It sends
no transaction and moves no funds.

## Run

From the repository root:

    pnpm install --ignore-scripts
    pnpm --filter @gatelock/core build
    pnpm --filter @gatelock/atlas-cmc build
    pnpm --filter @gatelock/atlas-cmc test
    pnpm --filter @gatelock/atlas-cmc typecheck
    pnpm --filter @gatelock/atlas-cmc live

`live` loads `ATLAS_API_KEY` and `CMC_PRO_API_KEY` through `loadSecrets` from `@gatelock/core/secrets`, calls both
services and reads one BSC-testnet contract. It writes `live-requests.json` and `funding-decision.json` to
`evidence/atlas-cmc/` at the repository root, or to the directory given with `--out <dir>`. Keys are redacted from
both files, and each observation carries its time in UTC, Central Time and Bangkok time. It exits with status 1 when
either service fails or no decision can be computed.

Importing the package reads no key and calls no service. Construct the clients on a server, never in a browser
bundle.

## Interface

| Export | Returns |
|---|---|
| `new AtlasClient(key).latest()` | `{ raw, prices }`: verified BNB/USD (feed 633) and USDT/USD (feed 649) |
| `new CmcClient(key).quotes()` | BNB (CMC ID 1839) and USDT (825) in USD: price, 24-hour change, and 24-hour volume or `null` |
| `new CmcClient(key).security()` | BSC-USDT vendor fields (flag, contract verification, source), or `state: "unknown"` |
| `fundingDecision(input)` | reference value, reserve fraction, budget and evaluation count; `priced`, or `review` with reasons |
| `verifyAtlasResponse`, `decodeAtlasPayload`, `parseCmcQuotes`, `parseSecurity`, `checkPrice`, `sanitize` | the checks above, for reuse |

Each client takes an optional audit callback, which receives every request and its response with the key removed.
Requests time out after 20 seconds and fail on any redirect, so a key header never follows a response to another
origin.

## Atlas

`POST https://api.atlasoracle.io/report/v1/price/latest` with `X-API-KEY`, feeds 633 and 649 and `signed: true`.
The adapter:

- recovers the signer of the raw payload's Keccak-256 hash and requires Atlas's published production signer,
  `0x59eD4701224fD9e2a85Ef2946c2ab828C1dDC600`;
- decodes the payload's packages and its trailing package count, and requires exactly the requested feeds, once each;
- scales prices by 1e18 and rejects a price that is not positive, is older than 180 seconds or is more than 60
  seconds ahead, the reference limits in Atlas's Pull integration guide;
- treats an HTTP 200 response with a nonzero `status.error_code` as a failure.

`live` also reads `description()`, `decimals()` and `latestRoundData()` from the BSC-testnet SingleFeed
`0xb3d1614bf894e68add1ea50ca250c152bad5256f` at one block, and records whether that read could price the budget: its
description must name BNB/USD and its last update must be at most 180 seconds old at that block. The budget is
always priced from the signed Pull reports.

## CoinMarketCap

- `GET /v3/cryptocurrency/quotes/latest?id=1839,825&convert=USD` with `X-CMC_PRO_API_KEY`. Each asset is matched by
  its CMC ID and its quote by the USD ID, 2781. A quote older than 300 seconds is rejected.
- `GET /v1/dex/security/detail?platformName=bsc&address=0x55d398326f99059ff775485246999027b3197955`. Only the row
  for that platform and address is read. Coverage is `available` only when `isFlaggedByVendor` and `isVerified` are
  booleans and `source` names the vendor; anything else is `unknown`, which is never treated as safe.

CoinMarketCap's platform ID for BSC is 14, which is not an EVM chain ID (56 on mainnet, 97 on testnet).

## The budget rule

The inputs are a declared budget in BNB (0.25 in `live`), not a wallet balance, and a reference price per evaluation
($2 unless given). Testnet BNB has no cash value; the dollar figures are references.

- Value: the budget at the lower of the Atlas and CoinMarketCap BNB prices.
- Reserve: 10%, plus twice the absolute CoinMarketCap 24-hour BNB change, at most 50%. This is a disclosed rule on
  an observed move, not a volatility forecast.
- Budget: the value minus the reserve. Evaluations: the budget divided by the evaluation price, rounded down.

A stale, future-dated, non-positive or non-finite input stops the calculation with an error. The decision is
`review`, with a zero budget and no evaluations, when the two BNB prices differ by more than 5%, Atlas's USDT price
is more than 1% from $1, or the vendor fields are unknown, flagged, unverified or unsourced. Those fields meet this
rule's evidence requirement; they do not certify the token.

Each decision also reports the budget at the fixed 10% reserve, so the effect of the market data is visible.

## Tests

The tests run offline. They cover a recorded production report checked against the published signer, tampered and
stale reports, feed binding, CoinMarketCap identity and freshness, vendor coverage, redaction of keys in audits and
errors, the budget rule and each review case, and three local two-server tests showing that a redirect fails before
any request reaches its target.
