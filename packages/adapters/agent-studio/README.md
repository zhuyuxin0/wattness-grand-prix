# Wattness evaluation adapter

Evaluates a committed shadow plan in the sealed 2026-11-26 record (`fixtures/od-20261126`) through the public exports of `@gatelock/core` and `@gatelock/verifier`. It returns a `wattness.evaluation-report.v1` report that keeps passed, failed and skipped checks apart and keeps the fair-value hedge assumption.

`WattnessEvaluator/` is the BNB Agent Studio seller agent that sells this evaluation as an ERC-8183 job. See [its README](WattnessEvaluator/README.md).

## Run

From the repository root:

    pnpm install
    pnpm --filter @gatelock/core --filter @gatelock/verifier build
    pnpm --filter @gatelock/adapter-agent-studio build
    pnpm --filter @gatelock/adapter-agent-studio test
    pnpm --filter @gatelock/adapter-agent-studio evidence
    pnpm --filter @gatelock/adapter-agent-studio serve

`evaluate(request, options)` reads the fixture directory, or an embedded copy passed as `options.fixture` (see `fixtureFiles`). A bundled runtime uses the embedded copy because it has no fixture directory to read.

The standalone HTTP server listens only on 127.0.0.1, on the port in `WATTNESS_EVALUATOR_PORT` (15191 to 15199, default 15192). It exposes GET /health, GET /agent-card and POST /evaluate. Requests must name CLO_ESR1 or DSWL_ESS_ESR1; arbitrary paths, extra fields and mainnet evaluation are rejected.

POST body:

    {"resource":"DSWL_ESS_ESR1","chain":"bsc-testnet"}

## Studio

Published packages: @bnbagent/studio-cli 0.0.16 and @bnbagent/studio-runtime 0.0.16 (Apache-2.0), @bnbagent/sdk 0.6.1 (MIT). The files `bag init` generated in `WattnessEvaluator/` keep the scaffold's Apache-2.0 license; its `NOTICE` lists them.

For managed hosting, use a dedicated disposable testnet wallet. Never import a key that has been used on mainnet into the hosted runtime.
