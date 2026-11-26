# BNB Chain: every battery's plan, sealed before the market closes

<!-- MEDIA: video-developer -->

BNB Smart Chain keeps the record, BNB Greenfield keeps the files, and the BNB Agent SDK and BNB Agent Studio give the agents their identities and paid jobs. Before ERCOT's 10:00 CT day-ahead gate, six agents plan the next day for every ERCOT battery with complete public data (316 on Nov 26: 20.8 GW and 44.3 GWh in all), and one transaction seals all the plans under one root in GateRecord on BSC mainnet, with the same root on BSC testnet. The contract computes the gate itself and refuses a late or a second record. Anyone can check any battery's plan against the chain.

Site: [gp.wattness.tech](https://gp.wattness.tech). Code: this repository, MIT. Setup: [Run it](../../README.md#run-it).

## The sealed days

| Operating day | Sealed on BSC mainnet | Before the gate | Plans | Transactions |
|---|---|---|---|---|
| Nov 26, 2026 | Nov 25, 09:15:17 CT (22:15:17 Bangkok) | 44 min 43 s | 316 | [mainnet](https://bscscan.com/tx/0xf1f214029ec71b4fd860408c53a98acf317683d3af9a147226c456063404c369) · [testnet](https://testnet.bscscan.com/tx/0x64906e00b296246f92027aff6f532c1b4917f22b80551409c9e78ac6ee9111b1) |
| Nov 27, 2026 | Nov 26, 08:10:41 CT (21:10:41 Bangkok) | 1 h 49 min 19 s | 316, each with Cournot's probability | [mainnet](https://bscscan.com/tx/0xd6ce6ebdd4f70dfe3aafae5fb76f014152f10a9f3a6c83d52362954cf853dbef) · [testnet](https://testnet.bscscan.com/tx/0x1ff8d7d8bceae913d50508600cd4304d4284930f8137d8f49348fee7f3a5d267) |

A second plan for Nov 26, simulated 22 seconds after the gate, is refused with `AfterGate(20261126, 1795622400)`.

## What runs on BNB Chain

| Piece | Where | What it does |
|---|---|---|
| GateRecord | `0x2922c68cE15EB3e83B7f43b136e981dDc4262876`, BSC mainnet (56) and testnet (97), [verified on Sourcify](https://repo.sourcify.dev/56/0x2922c68cE15EB3e83B7f43b136e981dDc4262876) | One write-once record per committer, scope and operating day: the root, its leaf count and the git tree of the code that planned it. Refuses a commit at or after the gate (`AfterGate`) and a second one (`AlreadyCommitted`); takes each of three outcome stages once, from the committer, after the stage opens |
| The records on BNB Greenfield | bucket [`wattness-grand-prix-records`](https://testnet.dcellar.io/buckets/wattness-grand-prix-records), Greenfield testnet | Every file a day's root covers: 953 objects for Nov 26 (the index, 316 plans, 316 scenario sets, 316 input syncs, the root, the salt, both receipts), each downloaded back and matched by SHA-256 ([the Nov 26 index](https://gnfd-testnet-sp3.nodereal.io/view/wattness-grand-prix-records/od-20261126/manifest.json)); Nov 27's under `od-20261127/` |
| Agent identities (ERC-8004) | registry `0x8004A818BFB912233c491871b3d84c89A494BD9e`, BSC testnet | The six roles of a plan (market reader 2923, state keeper 2924, forecaster 2925, hedger 2926, risk officer 2927, planner 2928), registered through the BNB Agent SDK with gas sponsored by MegaFuel, cards on Greenfield; and the evaluator, 2922 |
| Paid jobs (ERC-8183) | commerce `0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE`, router `0xD7d36D66d2F1B608A0F943f722D27e3744f66F25`, policy `0xd6a4217588F6B1F5657a92A3e94E6422aD771cEA`, BSC testnet | Jobs 1872, 1897 and 1907: the planner pays the forecaster for a battery's price scenarios, and what the forecaster delivers hashes to the digest the sealed plan commits. Jobs 1871, 1873, 1902 and 1908: the evaluator checks a sealed record and sells the report (1908: Desert Willow's Nov 27 plan) |
| Hosted agents | BNB Agent Studio | The evaluator and the forecaster are hosted through BNB Agent Studio, which runs them on Amazon Bedrock AgentCore; jobs 1873, 1897, 1902 and 1908 were served there |
| Edge | [grand-prix-edge.wattness.workers.dev](https://grand-prix-edge.wattness.workers.dev), Cloudflare Workers | Serves each sealed day's files from Greenfield only after checking them against GateRecord on BSC, and answers `/verify/<battery>` with the proof, record and gate checks |
| Atlas's feeds | BSC mainnet and testnet | BNB/USD prices the latest seal's gas on the Seal tab; the Prices tab reads Atlas's feeds live |
| Flap and OpenFour | BSC testnet | A season token that launches only on a sealed plan; a launch that graduates only once the agent's sealed record is bound to it ([flap.md](flap.md), [openfour.md](openfour.md)) |

## Job 1907: one agent hires another before the seal

Before the Nov 27 seal, the planner (2928) opened a job for the forecaster (2925) and escrowed 0.1 test U for Desert Willow's (DSWL_ESS_ESR1) price scenarios. The forecaster [submitted](https://testnet.bscscan.com/tx/0xfa4279148a7d6a4843828ece1339161a1dd172c112deb9173c96bcb77f6bb583) the SHA-256 of the scenarios file's RFC 8785 canonical form, `0x3c8bf772e378a77b7f1cf2a0a455e72e21f16abf17f17cfad351058a2065c998`, 58 s before the testnet seal. The sealed plan commits exactly that digest as `scenarios.digest_sha256`, so anyone can check that the plan sealed what the forecaster delivered. The job [settled](https://testnet.bscscan.com/tx/0x4d5ccb587d13df4db19f9d84d61ccf5920dd8339b25df9c527df395fbaf67ab7) after the policy's 900-second dispute window, and the forecaster was paid.

## Where each judging criterion shows

| Criterion | Where to look |
|---|---|
| Design and usability | The site: a 3D introduction to one operating day, then tabs in the pipeline's order (Overview, Fleet, Battery, the agents, Seal, Verify, Files, the markets); light and dark themes; every figure with its source line |
| Scalability | One root and one transaction per day for the whole fleet (172,209 gas for 316 plans on Nov 27); files on Greenfield; verification served at the edge and cached once checked; any wallet can commit its own records beside ours |
| Innovation | The market's gate, computed and enforced on chain, so a plan's track record cannot be chosen after the prices are known |
| Open source | MIT; setup in [Run it](../../README.md#run-it); a second implementation of the leaf hash in Python's standard library; tests in every package |
| Integration | BSC mainnet and testnet, BNB Greenfield, ERC-8004 through the BNB Agent SDK and MegaFuel, ERC-8183 jobs, BNB Agent Studio hosting, Atlas's feeds on BNB Chain, Flap and OpenFour on BSC testnet |
| Roadmap and business model | [Roadmap and business model](../../README.md#roadmap-and-business-model) |

## Check it

The one command that checks a plan against BSC mainnet is in [Run it](../../README.md#run-it). Over HTTP, the edge checks one battery's proof, its record on chain and its seal time against the gate (the verifier's V1 to V3):

```sh
curl -s "https://grand-prix-edge.wattness.workers.dev/verify/DSWL_ESS_ESR1?od=2026-11-26&network=bsc-mainnet"
```

Data: ERCOT, read from the Wattness Terminal's public release. Calculation and display: Wattness.
