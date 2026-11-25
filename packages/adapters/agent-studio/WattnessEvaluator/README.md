# WattnessEvaluator

A BNB Agent Studio seller agent that sells one thing: the evaluation of a sealed Wattness record. A buyer opens an ERC-8183 job on BSC testnet for a battery's shadow plan in the 2026-11-26 record. The agent runs the evaluator against that record and its GateRecord commitment on chain 97, then submits the report as the job's deliverable.

Scaffolded with `bag init` from `@bnbagent/studio-cli` 0.0.16, with `@bnbagent/sdk` 0.6.1 and `@bnbagent/studio-runtime` 0.0.16 pinned. The generated files are Apache-2.0 and listed in `NOTICE`; the work hook and the evaluator are MIT.

- `app/agent/`: the agent and its only signer. This directory is the deploy codeLocation.
  - `src/evaluationWork.ts`: the work hook. It parses the task, runs the evaluator and builds the deliverable.
  - `src/sellerCore.ts`, `src/signing.ts`: the negotiate and notify_funded skills and every on-chain write. `negotiate` refuses to quote any task the evaluator cannot run.
  - `vendor/wattness-evaluator.js`: the evaluator from `packages/adapters/agent-studio`, bundled with the sealed record by `pnpm vendor`. It is generated and not committed.
- `.studio/`: the encrypted keystore and `.env.local`. Never commit it.
- `agentcore/`: the AWS AgentCore descriptor that `bag init` writes.

## The job

The task description is a JSON evaluation request:

    {"operating_day":"2026-11-26","resource":"DSWL_ESS_ESR1","chain":"bsc-testnet"}

`resource` is `DSWL_ESS_ESR1` or `CLO_ESR1`, the two leaves in `fixtures/od-20261126`. `chain` is `bsc-testnet` (the default) or `offline`. The price is USD 0.10, paid in testnet U, USDC or USDT.

The deliverable (`wattness.evaluation-deliverable.v1`) holds the request, the record's root and receipt, the report with checks V1 to V10, and the report's sha256 digest. The on-chain `submit` commits to the manifest that carries it.

## Setup

From the repository root:

    pnpm install
    pnpm --filter @gatelock/core --filter @gatelock/verifier --filter @gatelock/adapter-agent-studio build

Then, in this directory:

    pnpm install
    cd app/agent
    pnpm vendor
    pnpm test
    pnpm typecheck

Use a disposable testnet wallet. Deploying sends its key to the managed platform's secret store.

    pnpm exec bag wallet new --private-key - --save-password    # key on stdin, WALLET_PASSWORD from the shell
    pnpm exec bag doctor

## Run locally

    cd app/agent
    ERC8183_AGENT_URL=http://127.0.0.1:15194/erc8183 pnpm exec bag dev --port 15194 --host 127.0.0.1

The agent card is at `http://127.0.0.1:15194/.well-known/agent-card.json`. A loopback run binds only the given port. Skills go to `POST /` as A2A `message/send` with a data part:

    {"skill":"negotiate","task_description":"<task JSON as a string>","terms":{"deliverables":"...","quality_standards":"...","currency":"<payment token address>"}}
    {"skill":"notify_funded","job_id":<id>}

The buyer funds only a quote whose request names its payment token, so send `terms.currency` (testnet U is `0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565`). With local deliverable storage, the SDK publishes `{ERC8183_AGENT_URL}/job/{id}/response` on chain, and the agent serves the stored manifest there. Hosted on the managed platform, deliverables go to its managed storage instead, so leave `ERC8183_AGENT_URL` unset there.

## Deploy

    pnpm exec bag platform login        # GitHub device flow: open the URL it prints and enter the code
    pnpm exec bag deploy --provider bnb
    pnpm exec bag deploy verify --provider bnb

`bag deploy verify` probes the hosted endpoint and records it in the agent's ERC-8004 identity.

## Buy one evaluation

From a second project that holds the buyer's wallet, against the hosted agent:

    bag erc8183 buy --agent-id <id> --protocol A2A --task '<task JSON>' --budget-usd 0.10

Against a local agent, negotiate over A2A yourself, save the data part of the reply, then fund it and send `notify_funded`:

    bag erc8183 buy --provider <seller address> --quote-json quote.json --task '<task JSON>' --budget-usd 0.10
    bag erc8183 status <job_id>
    bag erc8183 fetch <job_id>      # downloads an https, ipfs or file deliverable and checks its on-chain hash
    bag erc8183 settle <job_id>     # after the policy's dispute window

The evaluation covers shadow plans for real ERCOT batteries. It checks the commitment, the inputs' days and the model constraints. It does not check plant operation or trading profit. Every skipped check stays visible in the report.
