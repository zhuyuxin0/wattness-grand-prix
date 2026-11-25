# The six agents on BSC testnet

Runners that give each of the plan's six roles its own ERC-8004 identity, publish each agent's card, and run ERC-8183
jobs between agents. Everything here acts on BSC testnet (chain 97) and BNB Greenfield testnet only; each runner checks
the chain id before it signs. The roles, cards and the read client are in `packages/agents`; what is on chain is
recorded in `contracts/deployments/agents.bsc-testnet.json`.

| step | runner | what it sends |
|---|---|---|
| wallets | `node wallets.ts` | nothing: six new keys, appended to the secrets file as `AGENT_<ROLE>_PRIVATE_KEY` and `AGENT_<ROLE>_ADDRESS` (mode 0600); prints addresses only |
| identities | `node register.ts mint --send` | `register("", [role, built_with])` on the ERC-8004 registry, from each role's wallet |
| cards | `node cards.ts publish --send`, then `check` | one Greenfield transaction creating `agents/<role>.json` in the public bucket, the uploads, then a download and SHA-256 check |
| card links | `node register.ts uri --send` | `setAgentURI(id, card URL)` from each role's wallet |
| a job | `node hire.ts run ... --send` | the planner's createJob, registerJob, setBudget, approve and fund; the forecaster's submit; the planner's settle |
| read back | `node register.ts status`, `node hire.ts status --job N` | nothing |

Calls go through the BNB agent SDK 0.6.1's executor with the MegaFuel testnet relay, so gas is sponsored where the relay
accepts the call (the registry, createJob, registerJob, setBudget, fund, submit and settle). The U faucet and the U
approval are not sponsored; a wallet that needs gas for them gets 0.01 tBNB from the record wallet, one transfer at a
time, and only while the record wallet stays above 1.5 tBNB. Without `--send`, every runner only asks the relay and
simulates.

## The job between agents

The planner (client) pays the forecaster (provider) 0.1 U for one battery's price scenarios. The forecaster submits the
SHA-256 of the scenarios file's RFC 8785 canonical JSON, which is the `scenarios.digest_sha256` the battery's leaf
commits; `deliver` refuses unless that digest is the file's, the leaf is in the day's index and the index gives its
root. After the optimistic policy's 900-second dispute window, `settle` asks the router to complete the job, which pays
the forecaster.

```sh
# a sealed day: the scenarios were committed before the job, and the job says so
node hire.ts run --od 2026-11-26 --resource DSWL_ESS_ESR1 --timing sealed --dir ../../fixtures/od-20261126 --send

# before a seal: after `pnpm plan` writes out/od-YYYYMMDD and before `pnpm commit`
node hire.ts open --od 2026-11-27 --resource DSWL_ESS_ESR1 --timing before-seal --send
node hire.ts deliver --job N --dir ../../out/od-20261127 --allow-unpublished --send
pnpm commit --od 2026-11-27 ...           # the sealed leaf commits the digest the forecaster delivered
node hire.ts settle --job N --wait --send  # once the dispute window has passed
```

For a sealed day, `deliver` also reads the day's record on GateRecord and checks that the root committing the digest
was on chain before the job was opened. Before a seal the scenarios are not yet on Greenfield, so `--allow-unpublished`
submits the URL they will be published at; the hash on chain is what binds them.

## Setup

```sh
pnpm install && pnpm --filter @gatelock/core --filter @gatelock/agents build   # at the repository root
cd scripts/agents && pnpm install                                               # this folder is its own project
```

Keys are read by name through `@gatelock/core/secrets` (default `~/Documents/wattness-secrets/bnb-bangkok.env`, or
`GATE_SECRETS_ENV`) and never printed. The record wallet's key, `GATE_PRIVATE_KEY`, is used only to fund a role wallet
and to sign the Greenfield transaction for the bucket it owns. Runners that send write their evidence (transactions with
times in CT and Bangkok, read-backs, the cards as stored) to `--evidence <dir>` or `$GATE_EVIDENCE_DIR/agents`, which
must be outside the repository.
