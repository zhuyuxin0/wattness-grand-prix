# Wattness Grand Prix

<!-- MEDIA: hero -->

**Six agents plan tomorrow for every ERCOT battery with complete public data (316 on Nov 26) and seal every plan on BNB Chain before ERCOT's day-ahead market closes. Anyone can check that a plan never changed.**

**Judges' path**

<!-- MEDIA: video-developer. At R5 it becomes item 1, "Watch the demo (under 3 minutes)", linking the YouTube cut. -->

1. **Open the site:** [gp.wattness.tech](https://gp.wattness.tech). It opens on a 3D introduction to one operating day; the [Overview](https://gp.wattness.tech/overview) and the tabs beside it hold every battery's plan, the agents, the seal and the checks.
2. **See the Nov 27 seal on BSC mainnet:** [transaction 0xd6ce6ebd…f853dbef](https://bscscan.com/tx/0xd6ce6ebdd4f70dfe3aafae5fb76f014152f10a9f3a6c83d52362954cf853dbef). 316 plans under one root, committed 1 h 49 min before the gate, each plan carrying Cournot's weather probability.
3. **Check a plan in one click:** [Desert Willow's Nov 26 plan against BSC mainnet](https://grand-prix-edge.wattness.workers.dev/verify/DSWL_ESS_ESR1?od=2026-11-26&network=bsc-mainnet), checked at the edge (proof, record and gate, each `pass`), or on the [Verify tab](https://gp.wattness.tech/verify). From a clone, [one command](#run-it) runs every check, with no key and no wallet.

<p align="center">
  <!-- MEDIA: row-desert-willow -->
  <!-- MEDIA: row-one-plan -->
  <!-- MEDIA: row-verify -->
</p>

**A battery's plan is worth judging only if it was fixed before the prices were known.**

## What it is

Before ERCOT's 10:00 CT day-ahead gate, six agents plan the next day for every ERCOT battery with complete public data (316 on Nov 26: 20.8 GW and 44.3 GWh in all), from the [Wattness Terminal](https://wattness.tech)'s public ERCOT data. A plan is one battery's charge and discharge by hour, within its power and energy limits, with an optional hedge on ElectronX's published contract terms. The day's plans become the leaves of one Merkle root, committed to the GateRecord contract on BSC mainnet and BSC testnet in one transaction each. The contract computes the gate itself and refuses a late or a second record. After the gate, the same plans are valued at the prices ERCOT publishes, in stages linked to the same record, and anyone can check any battery's plan against the chain, in the browser or with one command.

The plans are shadow plans: they are computed for real batteries from public data, and the batteries are not operated from here.

## The sealed days

| Operating day | Gate | Sealed on BSC mainnet | Plans under one root | Transactions |
|---|---|---|---|---|
| Nov 26, 2026 | Nov 25, 10:00 CT (23:00 Bangkok) | Nov 25, 09:15:17 CT (22:15:17 Bangkok), 44 min 43 s before the gate | 316 | [BSC mainnet](https://bscscan.com/tx/0xf1f214029ec71b4fd860408c53a98acf317683d3af9a147226c456063404c369) · [BSC testnet](https://testnet.bscscan.com/tx/0x64906e00b296246f92027aff6f532c1b4917f22b80551409c9e78ac6ee9111b1) |
| Nov 27, 2026 | Nov 26, 10:00 CT (23:00 Bangkok) | Nov 26, 08:10:41 CT (21:10:41 Bangkok), 1 h 49 min 19 s before the gate | 316, each with Cournot's probability | [BSC mainnet](https://bscscan.com/tx/0xd6ce6ebdd4f70dfe3aafae5fb76f014152f10a9f3a6c83d52362954cf853dbef) · [BSC testnet](https://testnet.bscscan.com/tx/0x1ff8d7d8bceae913d50508600cd4304d4284930f8137d8f49348fee7f3a5d267) |

| | Nov 26 (planned and sealed Nov 25) | Nov 27 (planned and sealed Nov 26) |
|---|---|---|
| Planned | 09:12:46 CT | 08:05:46 CT |
| Root | `0xf4d4002344fe98be0f64870221e5cc0b5e1d6111c05fe46c0131763d725bbce7` | `0x3cd800432f3596e13c9f169348630c0fb69192501cf448a4859dd3104e9e59be` |
| Code tree (git) | `b83af42225f0ac312b05c5dd269f6c35502ec6b4` | `586e47c2a156389974a4294359c3f16ad34eac0b` |
| BSC testnet commit | 09:17:00 CT, 2,580 s before the gate | 08:10:16 CT, 6,584 s before the gate |
| BSC mainnet commit | 09:15:17 CT, 2,683 s before the gate, 189,309 gas | 08:10:41 CT, 6,559 s before the gate, 172,209 gas |
| Outside input | none | Cournot market 28288699, p = 0.01, applied on all 316 plans |
| Left out | 32 batteries, each named in the index with the census field it lacks | 32, the same way |

GateRecord is `0x2922c68cE15EB3e83B7f43b136e981dDc4262876`, one address on BSC mainnet and testnet, [source verified on Sourcify](https://repo.sourcify.dev/56/0x2922c68cE15EB3e83B7f43b136e981dDc4262876). A second plan for Nov 26, simulated 22 seconds after the gate, is refused by the contract with `AfterGate(20261126, 1795622400)`.

## How it works

<!-- MEDIA: how-it-works -->

1. **Plan.** Six agents, each with an ERC-8004 identity on BSC testnet, run deterministic forecasting and optimization code with no language model in the sealed path. The market reader reads the Wattness Terminal's public ERCOT data release, and every input is named by its SHA-256. Replayed from its published inputs, salt and plan time, the Nov 26 plan gave the same 316 leaves byte for byte.
   - For each battery the planner solves the next day's charge and discharge by hour, within the battery's power and energy limits: a mixed-integer program, solved with HiGHS, scored over price scenarios built from recorded forecast errors (301 a battery on Nov 26, 308 on Nov 27).
   - It compares three choices under the same inputs:
     - no hedge;
     - a hedge added to a fixed schedule;
     - schedule and hedge chosen together.
   - The hedge uses ElectronX's published hourly contract terms at an entry price the model assumes. That makes the comparison a scenario, not an executed trade.
   - Before the gate the risk officer may read one probability from Cournot. On Nov 27 it set the weight of each battery's stress scenarios and the hourly hedge cap ([Cournot Integration](#cournot-integration)).
2. **Seal.** Each plan becomes an RFC 8785 canonical JSON document in integer units. The documents become leaves of one RFC 6962 root.
   - The root is committed to GateRecord together with the git tree hash of the code that produced it.
   - The contract computes the gate itself (10:00 Central on the day before the operating day, daylight-saving aware) and refuses a late or a second record.
   - The day's files go to BNB Greenfield, each one downloaded back and matched by its SHA-256.
3. **Verify.** One command checks a battery's plan against the chain:
   - the root and the battery's proof;
   - the on-chain record;
   - the seal time against the gate;
   - the battery's limits, hour by hour;
   - the accounting;
   - every input against the published release, and an outside input such as Cournot's response by its hash.

   Change one number in a plan and the check fails, naming the field. The [Verify tab](https://gp.wattness.tech/verify) runs the proof, record, gate and limits checks in the browser: it recomputes the leaf with a second implementation, follows the proof to the root, reads the root back from GateRecord and replays the limits hour by hour. `tools/verify_hash.py` recomputes a leaf in Python's standard library.
4. **Settle.** After the gate the same plans are valued at the prices ERCOT publishes, in three stages: day-ahead settled, real-time provisional and real-time settled. Each stage's documents form one root, linked to the same GateRecord entry. The verifier rebuilds a battery's outcome from the published prices and walks its proof to that root. [How the stages settle](docs/outcomes.md).

## Sponsor tracks

<!-- MEDIA: at R5, a Demo column, one YouTube link per row. -->

| Track | What it does here | Proof | One page |
|---|---|---|---|
| BNB Chain (Developer Track) | The record on BSC mainnet and testnet, the files on BNB Greenfield, seven agent identities and their paid jobs | [Nov 27 seal](https://bscscan.com/tx/0xd6ce6ebdd4f70dfe3aafae5fb76f014152f10a9f3a6c83d52362954cf853dbef) | [bnb-chain.md](docs/sponsors/bnb-chain.md) |
| Flap | A season token that launches only once a named agent's plan is sealed before its gate | [Round 3 launch](https://testnet.bscscan.com/tx/0x4881264736e39903dd28eadd23602d8d710c558055be4f2f74db9d5eeb872429) | [flap.md](docs/sponsors/flap.md) |
| OpenFour (Four.meme) | A launch that graduates only once the agent's sealed record is bound to it | [Graduation](https://testnet.bscscan.com/tx/0xc549f6e5a6598ba308e6ecb837cf0da2a6fa23c1d72a6e40065df4c585af5330) | [openfour.md](docs/sponsors/openfour.md) |
| CoinMarketCap × Atlas | Signed prices that decide what checking the plans costs | [Signed Atlas report](site/public/data/prices.json) | [coinmarketcap-atlas.md](docs/sponsors/coinmarketcap-atlas.md) |
| Living Brain (ChatAndBuild) | A battery's reviewed lessons, read back only as of a decision's cutoff | [Memory tab](https://gp.wattness.tech/agents/memory) | [living-brain.md](docs/sponsors/living-brain.md) |
| Cournot | Weather odds read before the gate that set every Nov 27 plan's stress weight and hedge cap | [Response hash, sealed](#cournot-integration) | [cournot.md](docs/sponsors/cournot.md) |

### BNB Chain (Developer Track)

<!-- MEDIA: gif-bnb-chain -->

BNB Smart Chain keeps the record, BNB Greenfield keeps the files, and the BNB Agent SDK and BNB Agent Studio give the agents their identities and paid jobs.

- **GateRecord** ([`contracts/`](contracts)) keeps one write-once record per committer, scope and operating day. It computes the gate on chain, refuses a late or a second record (`AfterGate`, `AlreadyCommitted`), and takes each outcome stage once, from the committer, after the stage opens. One transaction seals the whole fleet: 172,209 gas for Nov 27's 316 plans, 0.0000086 BNB at 0.05 gwei. The [Seal tab](https://gp.wattness.tech/seal) prices the latest published seal in dollars with Atlas's BNB/USD feed on BNB Smart Chain.
- **BNB Greenfield** ([`scripts/greenfield/`](scripts/greenfield)) holds every file a day's root covers, in the public bucket [`wattness-grand-prix-records`](https://testnet.dcellar.io/buckets/wattness-grand-prix-records) on Greenfield testnet. Nov 26 is 953 objects (the index, 316 plans, 316 scenario sets, 316 input syncs, the root, the salt and both receipts), each downloaded back and matched by SHA-256 ([`published.json`](scripts/greenfield/published.json); [the Nov 26 index](https://gnfd-testnet-sp3.nodereal.io/view/wattness-grand-prix-records/od-20261126/manifest.json)). Nov 27's files are under `od-20261127/` in the same bucket.
- **Seven agents with ERC-8004 identities** on BSC testnet (registry `0x8004A818BFB912233c491871b3d84c89A494BD9e`). The six roles of a plan are the market reader (2923), state keeper (2924), forecaster (2925), hedger (2926), risk officer (2927) and planner (2928), registered through the BNB Agent SDK with gas sponsored by MegaFuel, each with its card on Greenfield. The seventh is the evaluator (2922). Every Nov 27 plan names the planner's identity. [Agent IDs tab](https://gp.wattness.tech/agents/ids).
- **Paid jobs between agents (ERC-8183).** In job 1907, before the Nov 27 seal, the planner hired the forecaster for Desert Willow's price scenarios and escrowed 0.1 test U. The forecaster's on-chain deliverable, `0x3c8bf772…2065c998`, is the digest the sealed plan commits for those scenarios: the SHA-256 of their RFC 8785 canonical form. It was [submitted](https://testnet.bscscan.com/tx/0xfa4279148a7d6a4843828ece1339161a1dd172c112deb9173c96bcb77f6bb583) 58 s before the testnet seal, and the job [settled](https://testnet.bscscan.com/tx/0x4d5ccb587d13df4db19f9d84d61ccf5920dd8339b25df9c527df395fbaf67ab7) after its 900-second dispute window, paying the forecaster. Six jobs in all: 1872, 1897 and 1907 for scenarios; 1871, 1873 and 1902 for evaluations.
- **Hosted agents.** The evaluator (2922) and the forecaster (2925) are hosted through BNB Agent Studio, which runs them on AWS AgentCore. The evaluator checks a sealed record against GateRecord and sells the report as an ERC-8183 job ([agent card](https://bnbagent-api.bnbchain.world/v1/rt/01M8A6SP0DFR9E3KR8AYM3FDK9/.well-known/agent-card.json)). Jobs 1873 and 1902 were served there ([1902 settled](https://testnet.bscscan.com/tx/0xe582ff17b2f14161e5ec44d6b2349137f3cf3be4b2135c8f74e47cd3dd4462dc)), and so was the forecaster's job 1897 ([settled](https://testnet.bscscan.com/tx/0xb9d457e23529dc105b79b6df718aa51b412080c433e7b92e5cd3f4b5f83ba9be)). The evaluator's code: [`packages/adapters/agent-studio`](packages/adapters/agent-studio).
- **At the edge.** A Cloudflare Worker, [grand-prix-edge.wattness.workers.dev](https://grand-prix-edge.wattness.workers.dev), serves each sealed day's files from Greenfield only after checking them against GateRecord on BSC, with `x-gate-*` headers that say what each file was checked against. `/verify/<battery>` answers with the proof, record and gate checks (the verifier's V1 to V3), one by one. Code: [`workers/edge`](workers/edge).
- **Open to any agent.** GateRecord keys every record by its committer, so another team's agent can seal plans for the same batteries before the same gate and face the same checks ([Add Your Agent](https://gp.wattness.tech/about/agents)). On the site, ONE PLAN scores a visitor's own plan for Desert Willow with the planner's objective and, for a day whose gate is still ahead, seals it from the visitor's wallet on BSC testnet.

<!-- MEDIA: stack -->

### Flap

<!-- MEDIA: gif-flap -->

Flap's Pool Launch Portal launches tokens through Launcher Factories. Ours launches a season token only once GateRecord holds a named agent's plan, sealed before that day's gate; a round that has not launched by its deadline only refunds. Everything here runs on BSC testnet, and the season token, PRIX, is a testnet placeholder. How it works and what makes it distinctive: [flap.md](docs/sponsors/flap.md).

- **The mechanism.** `SeasonLauncherFactory`, enabled on Flap's testnet Portal through its testnet helper, creates a round. Contributors put in test USD and name the agent they back. Anyone can call `launch()` once the raise reaches its minimum and GateRecord holds the milestone: the named agent's record for the named day, committed before that day's gate. The launch seeds a V2 pool and gives the token a 3% tax on buys and sells for its first 30 days. Flap's protocol fee takes 10% of the tax; of the rest, 80% goes to the season vault (72% of the tax) and 20% is burned. The vault keeps tax up to its reward cap and passes the rest to the round's creator. It pays each contributor by deposit times the share of season days on which their agent sealed before the gate, read from GateRecord at each claim.
- **Round 3, launched on the Nov 27 seal.** Its milestone was the Nov 27 record. The testnet commit landed at 08:10:16 CT (21:10:16 Bangkok); the round filled and [launched](https://testnet.bscscan.com/tx/0x4881264736e39903dd28eadd23602d8d710c558055be4f2f74db9d5eeb872429) about two minutes later. Token `0xd8cDe23884594B31B6B553DAa4B22A68A78F7777` (PRIX, testnet placeholder), pool `0x6181FB3Ca39eA4f856e7b180A9a535397bE583aC`, vault `0xc58cF0103C4d54AA21Fa4f522abFf05f3ca8d004`.
- **Round 1 and a refund.** Round 1 [launched](https://testnet.bscscan.com/tx/0x34439fa4200a28a54678b1493900f4fee0ee294540ff2e27b40cebbeaea3c084) on the Nov 26 seal, and its vault took the tax and [paid by sealed days](https://testnet.bscscan.com/tx/0x1528a6d4f59aeeb3fead543bf6c49487b6c4ccf12c8e280ff36048b34df5750f). A round whose milestone day was not sealed in time could not launch, and its deposit [came back](https://testnet.bscscan.com/tx/0xe5f8fe075565845a46985a6e29c2540e6f8b9a579b57b115a5419ece21932df8).
- **The launch UI.** The Wattness Season Mini App, built from Flap's vault component template and [open on Flap's host](https://utter.cash/apps/wattness-season?artifactPath=vaultui_wattness-season_01M8B7TYBFEQE0QK4PP4DFY5E6%2Fv20261126132700625_wattness-season_b2e5ede52980&lang=en), is round 3's launch UI and reads the round live from BSC testnet; the [Season tab](https://gp.wattness.tech/markets/season) reads rounds 1 and 3.
- **Code.** [`modules/flap`](modules/flap) holds the Launcher, the Vault and their factories, tested against a stand-in Portal and the real GateRecord; [`packages/adapters/flap`](packages/adapters/flap) holds the read clients.

<!-- MEDIA: video-flap -->

### OpenFour (Four.meme)

<!-- MEDIA: gif-openfour -->

OpenFour, Four.meme's open launch framework, builds each launch from swappable modules. On the OpenFour Hub route, our preset, Evidence-gated Bonding V1, keeps Bonding V1's Token, Vault, Curve and Trade and replaces Migrate, so an agent's token graduates only once the agent's sealed record is bound to it. It runs on our own OpenFour deployment on BSC testnet, and the agent token, PLNR, is a testnet placeholder. The user problem, the intended audience and what makes it different: [openfour.md](docs/sponsors/openfour.md).

- **The rule.** `EvidenceGatedMigrateModule` graduates a launch only when two things hold. The sale is sold out, or has raised a set floor. A GateRecord record is bound to the launch, found by its agent, scope and operating day, committed before that day's gate and covering at least the launch's minimum number of batteries (and, when set, its code hash and a linked outcome stage). A root on its own never qualifies. Graduation moves the vault's tokens and raised quote into a PancakeSwap V2 pair and burns the LP.
- **On BSC testnet.** The sold-out launch's graduation was [refused](https://testnet.bscscan.com/tx/0x219f25a2b86a8a73595911f40dd81f072655bd6711fdd4eb6b8108b6a733686e) with `EvidenceMissing`. The Nov 26 record was then [bound](https://testnet.bscscan.com/tx/0xd100cfa2402baaeec7de4545deedec2f72d238bbb53ec3fc34753d93718a1128), and the launch [graduated](https://testnet.bscscan.com/tx/0xc549f6e5a6598ba308e6ecb837cf0da2a6fa23c1d72a6e40065df4c585af5330) into its PancakeSwap V2 pair. Preset `1795634196178`; module `0xfc2E00dCfC39C71F97Ce0e6ba9C52717Ed8fbA8e`; PLNR `0xB1e792b2C6Bf7Ae7A1D972af313442039422ef14`.
- **Interface and code.** The [Launchpad tab](https://gp.wattness.tech/markets/launchpad) reads the launch with view calls. [`modules/openfour`](modules/openfour) holds the module, its tests on Hardhat against the real GateRecord, the launch runner and the read client.

<!-- MEDIA: video-openfour -->

### CoinMarketCap × Atlas

<!-- MEDIA: gif-coinmarketcap-atlas -->

CoinMarketCap's Pro API and Atlas's signed price reports and on-chain feeds decide what checking the sealed plans costs, and stop the count when the prices are stale or disagree. The one-page write-up: [coinmarketcap-atlas.md](docs/sponsors/coinmarketcap-atlas.md).

- **The budget rule** ([`packages/adapters/atlas-cmc`](packages/adapters/atlas-cmc)). Each independent check of a sealed record is a paid ERC-8183 job. The rule values a declared BNB budget at the lower of Atlas's and CoinMarketCap's BNB prices, holds back a reserve of 10% plus twice CoinMarketCap's 24-hour BNB move (at most 50%), and counts the checks the rest pays for. Prices more than 5% apart, USDT more than 1% from a dollar, or CoinMarketCap's security fields for BSC-USDT unknown or flagged turn the decision to review; a stale or future-dated price stops it.
- **The Nov 25 run** (09:54 CT): 0.25 BNB was worth $134.13 at the lower price, the day's 1.78% move set a 13.56% reserve, and the rest paid for 57 checks at $2 each, against 60 at the fixed 10%. Atlas's signed report is published with its payload and signature in [`site/public/data/prices.json`](site/public/data/prices.json), so anyone can recover its signer.
- **What it reads.** Atlas: signed Pull reports for BNB/USD (feed 633) and USDT/USD (feed 649), each signature recovered and matched to Atlas's published signer. CoinMarketCap: Pro v3 quotes (IDs 1839 and 825) and the DEX security detail for BSC-USDT.
- **On BNB Chain, in the browser.** The site reads Atlas's feeds with view calls and no key: BNB/USD and USDT/USD on BSC testnet ([Prices tab](https://gp.wattness.tech/markets/prices)); BNB/USD on BSC mainnet, which prices the latest seal's gas (Seal tab); and Atlas's MultiFeed on BSC mainnet, which prices tokenized shares of four companies in Texas's power market: Vistra, Fluence, GE Vernova and IREN (Prices tab).

The plans themselves are valued only at ERCOT's prices; these prices decide what checking them costs.

<!-- MEDIA: video-coinmarketcap-atlas -->

### Living Brain (ChatAndBuild)

<!-- MEDIA: gif-living-brain -->

Living Brain is the agents' persistent memory, reached through its API: a review brain for Desert Willow, the showcase battery, and brains on the build itself and on the Wattness Terminal. The problem, the solution and what makes it unique: [living-brain.md](docs/sponsors/living-brain.md).

- **Remember.** A reviewed lesson is captured to the battery's brain with an origin reference built from the battery, the sealed root and the note's version, so a rerun reads the same sources instead of capturing again.
- **Retrieve.** A fresh session reads full pages back as of a cutoff (`retrieveAt`). It admits only pages whose content and every source existed by then, never contested, stale, archived or later-edited ones, and cites each by page, version and source IDs. Asked as of the Nov 26 plan's own time, it admitted no page, because the lesson was written after that seal. Memory is read after the seal, so it shapes the review, never a sealed plan.
- **Connect.** Living Brain links pages within and across brains. The [Memory tab](https://gp.wattness.tech/agents/memory) shows three: the build's own (123 pages, 276 connections), the Terminal's (18 pages, 53 connections) and Desert Willow's review brain, 142 pages in all with 55 links across brains.
- **The run** (Nov 25, 10:58 CT / 23:58 Bangkok). Two captures for Desert Willow; a fresh client retrieved page `dswl-ess-esr1`, version 2, and cited it. Its review of the plan's hedge moved from "needs-supported-review" to "assumed-entry-scenario": the second interaction knew the reviewed rule, that the hedge's entry is assumed at the model's fair value, so the result is a scenario comparison and not a trade. Code: [`packages/adapters/living-brain`](packages/adapters/living-brain).

<!-- MEDIA: video-living-brain -->

### Cournot

<!-- MEDIA: gif-cournot -->

Cournot's Intelligence Oracle gives the risk officer one probability before the gate: the odds, from Kalshi's market, that the Dallas–Fort Worth low falls below 29°F. Wattness's declared rule turns it into the weight on each battery's stress scenarios and the hourly hedge cap, and the response's SHA-256 is sealed in every Nov 27 plan on BSC mainnet. The five items the track asks for are in [Cournot Integration](#cournot-integration).

<!-- MEDIA: video-cournot -->

## Cournot Integration

**The project.** Wattness Grand Prix plans tomorrow for every ERCOT battery with complete public data and seals the plans on BNB Chain before the 10:00 CT day-ahead gate. Cournot gives each plan one outside view, of the weather, read before the gate and sealed with the plan.

**Where and how it calls Cournot.**
- The risk officer reads it before the seal, inside the plan run: `pnpm plan --od 2026-11-27 --fleet --cournot live --cournot-resolve <saved-resolve.json> --cournot-market <id>`. Code: [`packages/adapters/cournot`](packages/adapters/cournot); the rule: [`packages/core/src/weather.ts`](packages/core/src/weather.ts).
- First the event is resolved, one call to `POST https://interface.cournot.ai/intelligence/v1/resolve`, saved. The plan run checks the chosen market against the rule, then makes one call to `POST https://interface.cournot.ai/intelligence/v1/probability` for that market only, with a 20-second limit and no automatic retry.
- These are the endpoints the official Cournot Intelligence Oracle Skill calls, in its order: resolve, then probability. In [Cournot-AI/cournot-skills](https://github.com/Cournot-AI/cournot-skills), the Skill, `cournot`, documents the flow in `skills/cournot/references/query-flow.md` and the response in `skills/cournot/references/response-format.md`, and builds the request path `/intelligence/v1/<operation>` in `skills/cournot/scripts/account-flow.mjs`. The adapter makes the same two calls from this repository's MIT TypeScript.
- The rule reads one kind of market: a Kalshi lower-tail minimum-temperature market at Dallas–Fort Worth (station CLIDFW), for the operating day or the day before, whose title and rules agree on station, threshold and date. The reading must arrive before the plan time and the gate, and at most 24 hours before the plan time. If any check or the call fails, the plan goes ahead without it and records why (`status: "not_applied"`); the seal never waits.

**How it uses the probability.**
- The stress scenarios are the quarter of history days when real time ran furthest above forecast at ERCOT's winter peaks (hour ending 7 to 10 and 18 to 21, CT). Their weight is w = p × 0.80 + (1 − p) × 0.25; the other scenarios share 1 − w.
- The hourly hedge limit is L = 50 MWh × (1 − 0.5 × w), and the contract cap is the lower of the plan's own cap and L in whole contracts.
- The weights carry into the fair-value hedge entry, the mean and the CVaR by which the planner scores and picks each battery's plan.
- On Nov 27, p = 0.01 moved the stress weight from 25% (equal weights) to 25.55% and the hedge cap from 100 contracts an hour to 43, on all 316 plans. At the rule's prior, p = 0.30, the weight would have been 41.5% and the cap 39.
- What is Cournot's: p, the matched market (its title, rules and outcome price), the matching confidence and the basis (source, summary, time and link). What is ours, labeled as ours: the 0.80 and 0.25 conditionals, the 50 MWh base, the 50% cut, the stress bucket, and the link from a cold dawn to price stress. A probability of a cold dawn is not a probability of a price spike; the rule states the link.

**Where users see the claim and the evidence.**
- The [Forecast tab](https://gp.wattness.tech/agents/forecast)'s "Weather Odds from Cournot" card shows the reading sealed into every Nov 27 plan (Cournot market 28288699, received 08:05:04 CT on Nov 26): the exact claim (market, station, threshold and date), Cournot's probability, its basis (Kalshi's YES quote and its time), when it was received, and what the rule did with it, worked through on the battery's own stress days, with our assumptions labeled. The browser hashes the saved response against the plans' record.
- Every Nov 27 plan carries the same fields as sealed, under `outside_inputs.cournot`: the claim, p in parts per million, Cournot's basis as returned, the receipt time, the response's SHA-256, and the stress weight and hedge cap before and after.
- The response itself sits beside the record on BNB Greenfield.

**Proof of a successful call.**
- Nov 27's call was requested at 08:05:03 CT on Nov 26 and answered HTTP 200, `"Success"`: p = 0.01 for Cournot market 28288699 (Kalshi's KXLOWTDAL-26NOV26-T29), "Will the minimum temperature be <29° on Nov 26, 2026? (Yes: 28° or below)", with Kalshi's latest YES price, 0.0100 at 08:00:48 CT, as its basis. It was received 42 s before the plan time.
- The saved response's SHA-256 is `4990562681a469dc4ae486a5b787293b6d10deacf282f701b22b432488b5f394`. It is in every Nov 27 plan, under the root committed on BSC mainnet in [0xd6ce6ebd…f853dbef](https://bscscan.com/tx/0xd6ce6ebdd4f70dfe3aafae5fb76f014152f10a9f3a6c83d52362954cf853dbef). The API returns no request ID, so this is the reproducible proof: download the response, hash it, and find the same hash in any Nov 27 plan, whose proof leads to the root on chain.
- The response, with the caller's IP removed: [`od-20261127/cournot/probability.json`](https://gnfd-testnet-sp3.nodereal.io/view/wattness-grand-prix-records/od-20261127/cournot/probability.json) on Greenfield. `curl -s <that URL> | shasum -a 256` prints the hash above.
- The verifier's input check (V7) holds the response to the plan by that hash, and its shape and rule check (V8) recomputes the weights, the hedge cap and the stress bucket from it.
- A call through the official Skill itself, on Nov 26 at 09:31:18 CT: resolve, then probability, for the same Kalshi market (Cournot market 25380188). It answered HTTP 200, `"Success"`, p = 0.01, with Kalshi's YES price, 0.0100 at 09:30:51 CT, as its basis. <!-- R3: link evidence/cournot/official-skill/probability-od26m-20261126T153118Z.json here once it is published. -->
- An earlier live call on Nov 25, for the same Kalshi market (Cournot market 24962617, p = 0.01), came the day before the reading the Nov 27 plans sealed.

## Roadmap and business model

**Today**
- **The Wattness Terminal** ([wattness.tech](https://wattness.tech)) is the business this entry is built on. Free reads every ERCOT battery's revenue, offers and dispatch. Pro, at $79 a month or $790 a year, adds the live market and the tools to act on it. Enterprise, by quote, covers data licensing, custom tools and battery optimization for owners, lenders, insurers and QSEs.
- **A battery owner can ask for a free hedge review** on the battery's page in the Terminal, where its Hedging data covers the battery: a private write-up of the hub that tracks it best, its selling hours by month and what an evening hedge would have done to its mean day and its worst days. No fee, and no access to the owner's systems.
- **The record is open.** GateRecord takes commits from any wallet, so any team's agent can seal plans for the same batteries before the same gate and face the same checks.

**Why the record matters to the business.** An optimizer is hired on its track record, and a record is worth something only if nobody could edit it afterwards, its author included. A sealed day is that record for every ERCOT battery with complete public data, at one transaction a day (0.0000086 BNB on Nov 27). For battery optimization the fee is a charge per kW-month plus a share of what the plans add over a benchmark fixed before the first day, paid only above a high-water mark, so every figure the fee depends on can be checked against sealed plans and ERCOT's settlement prices.

**Next**
1. Seal every gate, and link each day's three outcome stages as ERCOT publishes its prices.
2. Declarations on chain: an agent names the batteries and days it will seal before it starts, so a skipped day shows; then a bond that anyone can claim against a missed day.
3. The arena: outside agents sealing beside ours and valued by the same rule, with the evaluator's paid checks funded through the budget rule.
4. Memory across gates: each day's settled outcome reviewed into the battery's brain and read back, as of the next gate, by the next review.
5. The season on Flap and the evidence-gated graduation on OpenFour, from BSC testnet to mainnet after review.
6. Revenue floors backed by insurers and priced from the sealed record; other US power markets after ERCOT.

## New work and existing services

- **Existing, read by this entry:** the [Wattness Terminal](https://wattness.tech)'s public data release and its free live tier: ERCOT prices by day and point, the battery census, and the Hedging walkthrough's file for Desert Willow. The planner reads three of its routes and names every file by its SHA-256 in each plan ([`packages/data`](packages/data)). The Terminal is not in this repository.
- **Existing, carried in:** the 3D stage and kit of the Terminal's landing intro and Hedging walkthrough, in [`packages/world/src/kit/`](packages/world/src/kit), each file's source and git blob listed in its `PROVENANCE.md`. The site's design tokens, type and glyphs follow wattness.tech's.
- **Outside services and code, used as published:** BNB Smart Chain, BNB Greenfield, BNB Agent Studio and the BNB Agent SDK (the files `bag init` generated keep their Apache-2.0 license, listed in [`WattnessEvaluator/NOTICE`](packages/adapters/agent-studio/WattnessEvaluator/NOTICE)), MegaFuel, Flap's Pool Launch Portal and vault component template, OpenFour and its fork-deploy toolkit, PancakeSwap V2 on BSC testnet, Cournot, Living Brain, Atlas, CoinMarketCap, Cloudflare Workers, ElectronX's published contract terms, HiGHS, three.js and Libre Franklin.
- **New, built for this hackathon (Nov 25 to 27, 2026):** everything else in this repository: GateRecord, the planner and its six agents, the plan and index formats, the verifier in TypeScript, in the browser and in Python, the outcome stages, the Greenfield publisher, the sponsor adapters and modules, the edge Worker, the site and the 3D story. The Wattness Season Mini App was built for it too, from Flap's template.

## Run it

Node 22 (22.18 or later) and pnpm 11:

```sh
pnpm install
pnpm test
pnpm verify fixtures/od-20261126/manifest.json --network bsc-mainnet --scope gate-record/ercot-da-energy --battery DSWL_ESS_ESR1
```

To plan an operating day in the coming week yourself, with no key and no chain, while its gate (10:00 CT the day before) is still ahead:

```sh
pnpm plan --od YYYY-MM-DD --network local
pnpm verify out/local/od-YYYYMMDD/manifest.json --no-chain
```

A second implementation of the leaf hash, in Python's standard library. It prints Desert Willow's leaf as the index lists it, the same value again as a one-leaf root, then MATCH:

```sh
python3 -I tools/verify_hash.py fixtures/od-20261126/leaves/DSWL_ESS_ESR1.json --expect 0x067e4a612ccfd5976b66d561a40bd26256590c57eab24763fd5f9f48b76db2b1
```

## Layout

| Path | What it holds |
|---|---|
| `contracts/` | GateRecord, its tests and deployments, and the deploy, commit and Sourcify scripts |
| `packages/core` | Canonical JSON, leaves and roots, record keys, the gate clock, the weather rule and the outcome index |
| `packages/data` | Hash-checked readers for the Terminal's public release and live prices |
| `packages/engine` | Forecast, price scenarios and the dispatch and hedge optimization (HiGHS) |
| `packages/verifier` | The end-to-end check |
| `packages/agent` | Plans an operating day for the fleet and links each stage's outcome |
| `packages/agents` | The plan's six roles as ERC-8004 agents on BSC testnet, their cards, and a read client for their identities and ERC-8183 jobs |
| `packages/adapters/cournot` | Reads one Cournot event probability before the gate, the input to the weather rule |
| `packages/adapters/living-brain` | Living Brain memory for a battery's plan reviews, read back as of a cutoff with its sources |
| `packages/adapters/atlas-cmc` | BNB and USDT prices from Atlas's signed reports and CoinMarketCap, turned into a reference budget for evaluations |
| `packages/adapters/flap` | Read-only clients for Flap Pool Launch and the season round on BSC testnet |
| `packages/adapters/agent-studio` | Evaluates a sealed plan; `WattnessEvaluator/` sells the evaluation as an ERC-8183 job through BNB Agent Studio |
| `packages/world` | The 3D world: the story, ONE PLAN and the stack, on three.js and the stage and kit of wattness.tech's intro |
| `modules/flap` | The season Launcher and Vault for Flap Pool Launch: the season token launches only once a named plan is sealed before its gate |
| `modules/openfour` | An OpenFour migrate module that graduates a launch only when the agent's sealed record is in GateRecord |
| `scripts/agents` | Runners that create the role wallets, register the six agents, publish their cards and run a job, on BSC testnet and Greenfield testnet |
| `scripts/greenfield` | Publishes a sealed day's files to BNB Greenfield testnet and checks every download's SHA-256 |
| `scripts/timestamp` | RFC 3161 timestamps of a root, the fallback when no transaction can be sent |
| `workers/edge` | The Cloudflare Worker that serves sealed files from Greenfield only after checking them against GateRecord |
| `site/` | The public site at gp.wattness.tech, a static Vite app built apart from the workspace |
| `docs/outcomes.md` | How the three outcome stages settle and how the verifier checks them (V10) |
| `docs/sponsors/` | One page per sponsor track |
| `fixtures/od-20261126` | The sealed record of Nov 26: the index, two leaves, both chain receipts |
| `tools/verify_hash.py` | The standard-library hash check |

## Sources

Data: ERCOT, read from the Wattness Terminal's public release. Contract terms: [ElectronX's published product specifications](https://www.electronx.com/products). Weather odds: Cournot, from Kalshi's market. BNB and USDT prices: Atlas and CoinMarketCap. Calculation: this repository.

## License

MIT. The files BNB Agent Studio's `bag init` generated in `packages/adapters/agent-studio/WattnessEvaluator/` keep their Apache-2.0 license, listed in its `NOTICE`; Libre Franklin is under the SIL Open Font License.
