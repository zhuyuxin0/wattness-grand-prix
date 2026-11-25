# Cournot Integration

This adapter reads a live event assessment from the official Cournot Intelligence Skill API and applies a declared Wattness review policy to it. It is original TypeScript under the MIT license; it calls the official API and includes no code from the Skill repository.

## Working flow

1. Resolve a precisely described event.
2. Select one returned market and confirm its date, threshold, location and resolution source.
3. Request the probability for that market only.
4. Keep the exact claim, the returned probability, every basis field and the observation time.
5. Apply a declared conditional sensitivity policy and record the recommendation before and after.

The conditional probabilities and the sizing rule are Wattness's declared policy, not parameters returned by Cournot. Cournot's probability for a temperature event is not a probability of an electricity price spike; Wattness owns that mapping and labels it. A policy with an earlier information cutoff rejects a later observation.

## Setup and validation

From the repository root:

    pnpm install
    pnpm --filter @gatelock/core build
    pnpm --filter @gatelock/cournot build
    pnpm --filter @gatelock/cournot typecheck
    pnpm --filter @gatelock/cournot test

The package index exports CournotClient, parseAssessment and applyWeatherPolicy, and reads no secrets.

Instantiate CournotClient for anonymous access. For a prepaid account, clientWithConfiguredKey from @gatelock/cournot/server reads only COURNOT_API_KEY through the approved @gatelock/core/secrets export; it runs on a server only.

## Live run

From the repository root, resolve an event and save the response:

    node packages/adapters/cournot/dist/live.js resolve "<event description>"

Then assess one market from that saved response:

    node packages/adapters/cournot/dist/live.js assess <saved-resolve.json> <selected-market-id> [record.json]

The assessment step makes one probability request; run it only for a selected market. The optional record file (by default the sealed 2026-11-26 record in fixtures/) sets the relation the review states: applyWeatherPolicy compares the observation time with the record's commit time and says which came first.

Evidence is written to evidence/cournot/ at the repository root, or under the directory named by GATE_EVIDENCE_DIR.

## Error and data handling

- Requests are never retried automatically, so a call is never spent twice.
- HTTP 402 stops without signing or paying; HTTP 429 is reported as rate limiting.
- An HTTP 200 response with a nonzero API code is not a success.
- A probability must be finite and within [0, 1]; zero is a valid result.
- The response must name the selected market and no other.
- Both the structured and the scalar probability forms are read, and every basis field is kept.
- API keys, authorization and signature values, IP fields, IPv4 addresses and email addresses are removed from evidence, including a key echoed inside a message. Quota counts stay visible.
- API keys stay on the server: the keyed client is in @gatelock/cournot/server, and the package index is safe for a browser bundle.
- Redirects are rejected, so credentials cannot be forwarded to another origin.
- The age of the basis data is measured from its observation times; a time after receipt does not count, and with no observation time the age is unknown.

## Sources

Official repository: https://github.com/Cournot-AI/cournot-skills

Protocol references: skills/cournot/references/query-flow.md and response-format.md in that repository.

The official API endpoints are:

    POST https://interface.cournot.ai/intelligence/v1/resolve
    POST https://interface.cournot.ai/intelligence/v1/probability
