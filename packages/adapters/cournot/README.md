# Cournot Integration

This adapter reads a live event assessment from the official Cournot Intelligence Skill API and applies a declared Wattness review policy to it. It is original TypeScript under the MIT license; it calls the official API and includes no code from the Skill repository.

## Working flow

1. Resolve a precisely described event.
2. Select one returned market and confirm its date, threshold, location and resolution source.
3. Request the probability for that market only.
4. Keep the exact claim, the returned probability, every basis field and the observation time.
5. Apply a declared conditional sensitivity policy and record the recommendation before and after.

The conditional probabilities and the sizing rule are Wattness's declared policy, not parameters returned by Cournot. Cournot's probability for a temperature event is not a probability of an electricity price spike; Wattness owns that mapping and labels it. A policy with an earlier information cutoff rejects a later observation.

## Before the gate: the weather rule

The planner can read one Cournot probability before ERCOT's day-ahead gate and seal what it did with it. The rule is `gate-record.weather-stress.v1`, in `packages/core/src/weather.ts`; its parameters are written into every manifest that reads Cournot, under `outside_inputs.cournot.rule`.

- **The market.** A Kalshi lower-tail minimum-temperature market at Dallas-Fort Worth (station CLIDFW), for the operating day or the day before it. The claim (market id, station, threshold, date) is read from the market's title and rules text, which must agree.
- **The reading.** The returned probability p, in parts per million, and the response's receipt time, rounded up to the second. The reading must be received before the plan time and the gate, and at most 24 hours before the plan time.
- **The stress bucket.** From the battery's own scenario matrix: each history day is scored by its hub settlement prices summed over ERCOT's winter peaks, hour ending 7 to 10 and 18 to 21 (Central). The top quarter of history days, rounded up, ties to the later day, are the stress days; every scenario built on one is in the bucket.
- **The weights.** The bucket carries w = p × 0.80 + (1 − p) × 0.25 of the probability, the other scenarios 1 − w, equally within each group. The fair-value entry, the mean and the CVaR all use these weights, so the three arms are scored on one measure.
- **The hedge limit.** L = 50 MWh × (1 − 0.50 × w), floored to the kWh; the hourly contract cap is the lower of the plan's own cap and L in whole contracts.

The two conditional probabilities, the 50 MWh base and the 50% cut are declared assumptions of the rule. At the rule's prior p = 0.30 it gives w = 0.415 and L = 39.625 MWh; Cournot's 25 Nov probability for the 26 Nov Dallas market, p = 0.01, gives w = 0.2555 and L = 43.612 MWh, 43 contracts an hour.

Planning with a saved call, or with one live call:

    pnpm plan --od 2026-11-27 --fleet --cournot <saved-call.json>
    pnpm plan --od 2026-11-27 --fleet --cournot live --cournot-resolve <saved-resolve.json> --cournot-market <id>

The live form checks the market against the rule first, then makes exactly one probability request with a 20-second limit. The response is published beside the record as `cournot/probability.json`, and each leaf records its SHA-256. If the market is not one the rule reads, the call fails, or the response cannot be read, the plan proceeds without it: the manifest records `status: "not_applied"` and the reason, and the scenarios stay equally weighted. Without `--cournot`, `outside_inputs` stays null and the plan is the same as before.

The verifier recomputes all of it: V7 hashes the published response and compares its claim, probability, basis and time with the manifest; V8 recomputes the rule and the stress bucket; V5 recomputes each arm's mean and CVaR under the weights.

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
