# Cournot Integration

This adapter obtains a live event assessment from the official Cournot Intelligence Skill API and applies an explicit Wattness review policy. It is original TypeScript code; the unlicensed Cournot Skill implementation is referenced, not vendored.

## Working flow

1. Free resolve call for a precisely described event.
2. Select an actual returned market; confirm its date, threshold, location and resolution source.
3. Make one probability request for that selected identity.
4. Preserve the exact claim, returned probability, all basis fields and observation time.
5. Apply a declared conditional sensitivity policy and expose the recommendation before/after.

The conditional probabilities and sizing rule are explicitly assumed application policy. Cournot's temperature-event probability is not an electricity-spike probability. Earlier-cutoff policies reject later observations.

## Setup and validation

From the repository root:

    pnpm install
    pnpm --filter @gatelock/core build
    pnpm --filter @gatelock/cournot build
    pnpm --filter @gatelock/cournot typecheck
    pnpm --filter @gatelock/cournot test

The package exports CournotClient, parseAssessment, applyWeatherPolicy and clientWithConfiguredKey.

Instantiate CournotClient for anonymous access. The optional clientWithConfiguredKey reads only COURNOT_API_KEY through the approved @gatelock/core/secrets export.

For a deliberate new live assessment, run from the repository root:

    node packages/adapters/cournot/dist/live.js <saved-resolve-response.json> <selected-market-id>

This command consumes a probability call. Resolve/select a current event before a later round. Do not run repeated live calls merely to verify setup.

## Error and data handling

- No automatic request retries: after an uncertain error, quota billing may be unknown.
- HTTP 402 stops without signing/paying; HTTP 429 is rate limiting rather than insufficient funds.
- HTTP 200 with nonzero API code is not success.
- Probabilities must be finite and within [0,1]; zero is a valid result.
- Returned market identity must match the selected market.
- Structured and older scalar response forms are supported, with arbitrary basis fields retained.
- API-key, authorization, signature, email and IP values are redacted from evidence. Quota counts remain visible.
- API keys remain server-side. No frontend bundle should instantiate the configured-key client.
- Redirects are rejected, so credentials cannot be forwarded to another origin.
- Basis-source age is explicit when timestamps exist; absence remains unknown.

## Sources and reuse

Official repository: https://github.com/Cournot-AI/cournot-skills

Protocol references: skills/cournot/references/query-flow.md and response-format.md in that repository.

The official API endpoints are:

    POST https://interface.cournot.ai/intelligence/v1/resolve
    POST https://interface.cournot.ai/intelligence/v1/probability

The adapter is MIT licensed. Neither private Wattness strategy code nor the official unlicensed Skill code is included.
