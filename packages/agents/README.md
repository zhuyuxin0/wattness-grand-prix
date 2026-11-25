# @gatelock/agents

The six roles of a day plan as ERC-8004 agents on BSC testnet, their cards, and the ERC-8183 jobs between them.

The engine plays all six roles in one process (`packages/agent`). Each role also has its own identity on the ERC-8004
registry, owned by its own wallet, so a handoff that runs between two processes can be a paid job between two agents.

| role | reads | writes (leaf fields) | code |
|---|---|---|---|
| Market Reader | the Terminal's public release: day-ahead and real-time prices by day and point | `inputs`, `sync/<R>.json` | `packages/data` |
| State Keeper | the storage census row | `battery`, `assumptions` | `packages/data/src/census.ts`, `packages/engine/src/accounting.ts` |
| Forecaster | hub and node prices | `forecast`, `scenarios`, `leaves/<R>.scenarios.json` | `packages/engine/src/forecast.ts`, `scenarios.ts` |
| Hedger | ElectronX's published terms, the hub scenarios | `instrument` | `packages/engine/src/instrument.ts` |
| Risk Officer | the scenarios, Cournot's event probability | `risk`, each arm's expected value and CVaR | `packages/engine/src/accounting.ts`, `packages/adapters/cournot` |
| Planner | all of the above | arms A, B, C, `selected_arm`, the fleet index and root | `packages/engine/src/arms.ts`, `lp.ts`, `plan.ts` |

`src/roles.ts` holds the table above; `ROLES` is the single list the cards, the runners and the site read.

## Cards

An agent's `agentURI` points to its card: an ERC-8004 registration file (`registration-v1`) with one more object,
`role`, that states what the role reads and writes, its code paths in the repository, and the scope its output is
sealed under (GateRecord, scope `gate-record/ercot-da-energy`, committed by the record wallet). Cards are stored as
RFC 8785 canonical JSON, so the SHA-256 of the stored bytes is also the SHA-256 of the parsed card.

## Jobs

`src/job.ts` describes the one job agents run today: the planner pays the forecaster for one battery's price
scenarios. The deliverable written on chain is the SHA-256 of the scenarios file's canonical JSON, which is exactly the
`scenarios.digest_sha256` the battery's sealed leaf commits; so anyone can check that the plan sealed what the
forecaster delivered. A job's request says whether the scenarios were sealed before the job or delivered before the seal.

## Reading

`src/read.ts` is browser-safe (eth_call and fetch only):

```ts
import { jsonRpcCaller, readAgents, readJob, checkDeliverable, TESTNET_RPCS } from "@gatelock/agents";
import deployment from "../../contracts/deployments/agents.bsc-testnet.json";

const call = jsonRpcCaller(TESTNET_RPCS);
const agents = await readAgents(call, deployment);   // identity, card and five checks per role
const job = await readJob(call, deployment.jobs[0].jobId);
const { matches } = checkDeliverable(job, await (await fetch(deployment.jobs[0].deliverableUrl)).text());
```

The runners that create the wallets, register the agents, publish the cards and run a job are in `scripts/agents`.

## Test

```sh
pnpm --filter @gatelock/core build
pnpm --filter @gatelock/agents test
pnpm --filter @gatelock/agents typecheck
```
