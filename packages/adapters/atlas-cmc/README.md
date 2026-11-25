# Atlas and CoinMarketCap funding-data adapter

A server-side TypeScript adapter that verifies Atlas signed prices, reads CoinMarketCap Pro market/vendor data, and calculates a bounded BNB-denominated evaluation budget. It does not trade or send a transaction.

## Run

From the repository root:

    pnpm install --ignore-scripts
    pnpm --filter @gatelock/core build
    pnpm --filter @gatelock/atlas-cmc build
    pnpm --filter @gatelock/atlas-cmc test
    pnpm --filter @gatelock/atlas-cmc live

The CLI loads only ATLAS_API_KEY and CMC_PRO_API_KEY through the public @gatelock/core/secrets export. Its evidence files contain no credentials. Importing the adapter's normal export does not read keys or call a service.

## Exported interface

- AtlasClient.latest(): signed BNB/USD and USDT/USD Pull observations.
- CmcClient.quotes(): CoinMarketCap Pro v3 USD quotes, observed 24-hour price changes and available turnover.
- CmcClient.security(): specific BSC-USDT vendor fields, or unknown coverage.
- fundingDecision(): reference budget, reserve fraction, evaluation count and explicit review reasons.
- checkPrice(), decodeAtlasPayload(), verifyAtlasResponse(): reusable data validation.

Use credentials only on the server. Do not construct either authenticated client in a browser bundle.
Authenticated requests reject redirects so API-key headers cannot follow a service response to a different origin.

## Atlas integration

The public catalog establishes BNB/USD feed 633 and active USDT/USD feed 649. The adapter requests both through POST /report/v1/price/latest with signed=true.

It recovers the published signer from Keccak256 of the raw payload, decodes the package count, binds the expected feed IDs, rejects duplicate/unexpected packages, scales raw prices by 1e18, and checks positivity and timestamps. HTTP 200 with a nonzero business error is a failure.

The CLI also reads a testnet SingleFeed at a fixed block with description(), decimals() and latestRoundData(), and records whether it is eligible for pricing: the description must name BNB/USD and the price must be within the configured 180-second limit. The funding calculation uses the signed Pull prices.

## CoinMarketCap integration

The live Pro integration uses:

- GET /v3/cryptocurrency/quotes/latest?id=1839,825&convert=USD
- GET /v1/dex/security/detail?platformName=bsc&address=0x55d398326f99059ff775485246999027b3197955

The v3 data array is bound to CMC asset IDs 1839/825 and USD ID 2781. Security coverage is bound to the requested BSC token address. A missing record or incomplete flag, verification or source fields is unknown; a vendor's labels are not promoted into an application-wide safety verdict.

CMC platform ID 14 identifies BSC within CMC. It is distinct from EVM chain 56 and testnet chain 97.

## Decision use

The demonstrated input is a declared 0.25 BNB planning budget, not an asserted wallet balance. It uses reference USD prices; testnet balances have no cash-redemption value.

The policy values the budget conservatively at the lower Atlas/CMC BNB price. A base 10% reserve is increased by twice the absolute observed CMC 24-hour percentage move, capped at 50%. The remainder determines the number of evaluations at an explicitly declared $2 reference price.

This is a disclosed reserve rule using an observed movement, not a forward volatility estimate. Stale data rejects the calculation. Source divergence above 5%, USDT reference deviation above 1%, unknown vendor coverage, an unresolved/positive vendor flag, unresolved/negative contract verification or a missing vendor source changes the recommendation to review and sets the proposed allocation to zero. The minimum vendor inputs are an explicit false flag, true contract-verification field and named source. Those inputs satisfy this policy's evidence requirement; they do not certify investment safety.

The evidence compares unpriced state, fixed-reserve baseline and the live-data decision. Nothing is transferred or paid.

## Tests

Twenty-three tests cover signed payload integrity, feed binding, stale/future/negative values, business errors, credential sanitation, v3 parsing, incomplete vendor fields and material allocation changes. Three local two-origin HTTP tests verify that authenticated redirects fail without reaching the target. The live API and read evidence are separate from those tests.
