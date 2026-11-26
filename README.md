# Wattness Grand Prix

AI agents plan tomorrow for every real ERCOT battery, and each plan is sealed on BNB Chain before the market's 10:00 CT day-ahead gate. The contract refuses any plan that arrives after the gate. Once prices are in, anyone can check any battery's plan against the record.

The plans are shadow plans: they are computed for real batteries from public data, and the batteries are not operated from here.

## The first sealed day

| | |
|---|---|
| Operating day | 26 Nov 2026, ERCOT |
| Gate | 25 Nov 2026, 10:00 CT |
| Sealed | 25 Nov 2026, 09:15:17 CT, 44 min 43 s before the gate |
| Plans | 316 real ERCOT batteries, one leaf each, under one RFC 6962 root |
| Root | `0xf4d4002344fe98be0f64870221e5cc0b5e1d6111c05fe46c0131763d725bbce7` |
| Contract | GateRecord at `0x2922c68cE15EB3e83B7f43b136e981dDc4262876`, BSC mainnet and testnet, [source verified on Sourcify](https://repo.sourcify.dev/56/0x2922c68cE15EB3e83B7f43b136e981dDc4262876) |
| Transaction | [BSC mainnet](https://bscscan.com/tx/0xf1f214029ec71b4fd860408c53a98acf317683d3af9a147226c456063404c369) · [BSC testnet](https://testnet.bscscan.com/tx/0x64906e00b296246f92027aff6f532c1b4917f22b80551409c9e78ac6ee9111b1) |

A second plan for the same day, simulated 22 seconds after the gate, is refused by the contract with `AfterGate(20261126, 1795622400)`.

## How it works

1. **Plan.** Six agents, each with an ERC-8004 identity on BSC testnet, run deterministic forecasting and optimization code with no language model in the sealed path, so anyone can re-run a plan from its inputs and get the same bytes. The planner reads the [Wattness Terminal](https://wattness.tech)'s public ERCOT data release, and every input is named by its SHA-256.
   - For each battery it solves the next day's charge and discharge by hour, within the battery's power and energy limits.
   - For the showcase battery, Desert Willow (DSWL_ESS_ESR1), it compares three choices under the same inputs:
     - no hedge;
     - a hedge added to a fixed schedule;
     - schedule and hedge chosen together.
   - The hedge uses ElectronX's published hourly contract terms at an entry price the model assumes. That makes the comparison a scenario, not an executed trade.
2. **Seal.** Each plan becomes an RFC 8785 canonical JSON document. The documents become leaves of one RFC 6962 root.
   - The root is committed to GateRecord together with the git tree hash of the code that produced it.
   - The contract computes the gate itself (10:00 Central on the day before the operating day, daylight-saving aware) and refuses a late or a second record.
3. **Verify.** One command checks a battery's plan against the chain:
   - the root and the battery's proof;
   - the on-chain record;
   - the seal time against the gate;
   - the battery's limits, hour by hour;
   - the accounting;
   - every input against the published release.

   Change one number in a plan and the check fails, naming the field.
4. **Settle.** After the gate the same plans are valued at the prices ERCOT publishes, in three stages: day-ahead settled, real-time provisional and real-time settled. Each stage's documents form one root, linked to the same GateRecord entry. The verifier rebuilds a battery's outcome from the published prices and walks its proof to that root. [How the stages settle](docs/outcomes.md).

## Run it

Node 22 and pnpm 11:

```sh
pnpm install
pnpm test
pnpm verify fixtures/od-20261126/manifest.json --network bsc-mainnet --scope gate-record/ercot-da-energy --battery DSWL_ESS_ESR1
```

A second implementation of the leaf hash, in Python's standard library:

```sh
python3 -I tools/verify_hash.py fixtures/od-20261126/leaves/DSWL_ESS_ESR1.json
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
| `modules/flap` | The season Launcher and Vault for Flap Pool Launch: the season token launches only once a named plan is sealed before its gate |
| `modules/openfour` | An OpenFour migrate module that graduates a launch only when the agent's sealed record is in GateRecord |
| `scripts/agents` | Runners that create the role wallets, register the six agents, publish their cards and run a job, on BSC testnet and Greenfield testnet |
| `scripts/greenfield` | Publishes a sealed day's files to BNB Greenfield testnet and checks every download's SHA-256 |
| `scripts/timestamp` | RFC 3161 timestamps of a root, the fallback when no transaction can be sent |
| `site/` | The public site at gp.wattness.tech, a static Vite app built apart from the workspace |
| `docs/outcomes.md` | How the three outcome stages settle and how the verifier checks them (V10) |
| `fixtures/od-20261126` | The sealed record of 26 Nov: the index, two leaves, both chain receipts |
| `tools/verify_hash.py` | The standard-library hash check |

## Sources

Data: ERCOT, read from the Wattness Terminal's public release. Contract terms: [ElectronX's published product specifications](https://www.electronx.com/products). Calculation: this repository.

## License

MIT
