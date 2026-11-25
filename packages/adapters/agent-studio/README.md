# Wattness evaluation adapter

An isolated technical spike for BNB Agent Studio, built against the approved sealed fixture.

## Run

From the repository root:

    pnpm install
    pnpm --filter @gatelock/core --filter @gatelock/verifier build
    pnpm --filter @gatelock/adapter-agent-studio build
    pnpm --filter @gatelock/adapter-agent-studio test
    pnpm --filter @gatelock/adapter-agent-studio evidence
    pnpm --filter @gatelock/adapter-agent-studio serve

The standalone HTTP spike listens only on 127.0.0.1:15192. It exposes GET /health, GET /agent-card and POST /evaluate. Requests must name CLO_ESR1 or DSWL_ESS_ESR1; arbitrary paths, extra fields and mainnet evaluation are rejected.

POST body:

    {"resource":"DSWL_ESS_ESR1","chain":"bsc-testnet"}

The report separates passed, failed and skipped checks and retains the fair-value hedge assumption.

## Studio

Published packages checked: @bnbagent/studio-cli 0.0.16 (Apache-2.0), @bnbagent/studio-runtime 0.0.16 and @bnbagent/sdk 0.6.1 (MIT).

The actual CLI supports:

    bag init WattnessEvaluator --network bsc-testnet --llm-provider none --rails 8183 --protocols A2A --seller-price-usd 0.10 --destination platform --storage-provider local --no-auto-topup --no-onboard --no-install

For managed hosting, create a dedicated disposable testnet wallet. Do not import the existing GATE_PRIVATE_KEY, which was also used on mainnet, into the hosted runtime.
