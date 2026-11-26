# OpenFour: evidence-gated graduation

This MIT package holds an OpenFour migrate responsibility that graduates an agent's launch only when the agent's sealed plan is on record, the read client the site's launch tower uses, and the read-only discovery probe and tuple encoder it builds on.

## The migrate module

`contracts/EvidenceGatedMigrateModule.sol` (tag `module.migrate.evidence_gated`) replaces Migrate in a Bonding V1 preset and keeps the standard Token, Vault, Curve and Trade. A launch graduates only when both of these hold when the migration executes:

1. **Liquidity.** The vault's own predicate, read from the vault rather than from Core's context: `isSoldOut()` (predicate 0), or `totalRaised()` at least a quote floor (predicate 1).
2. **Evidence.** A GateRecord record bound to this launch, looked up under the launch's agent, its scope and an operating day. Its committer, scope, day and root must all match, it must cover at least `minLeafCount` batteries, it must have been committed before that day's gate, and, when set, its code hash must match and a settlement outcome must be linked. A root on its own never qualifies: the record is found by `keyOf(agent, scope, od)`, so only the agent's own sealed record can satisfy it.

Graduation moves the vault's remaining tokens and its raised quote into an empty PancakeSwap V2 pair and mints the LP to `0x…dEaD`. `executeMigration` returns version 1, `abi.encode(pair)`, the payload of the standard V2 migrate.

### Parameters

`migrateParams` is one ABI tuple, decoded with `abi.decode(raw, (Params))`, in this order. `moduleEncodeSchema()` publishes the same fields for `encodeModuleParams`.

| Field | Type | Meaning |
| --- | --- | --- |
| `agent` | address | The wallet that seals the agent's plans in GateRecord |
| `scope` | bytes32 | GateRecord scope, `keccak256` of its label (default `gate-record/ercot-da-energy`) |
| `minOd` | uint32 | Earliest qualifying operating day, YYYYMMDD |
| `minLeafCount` | uint32 | Batteries the record must cover |
| `codeHash` | bytes32 | Required record code hash; zero accepts any |
| `outcomeStage` | uint8 | 0: the sealed record; 1, 2, 3: that settlement stage must also be linked |
| `liquidityPredicate` | uint8 | 0: sold out; 1: raised at least `minQuoteRaised` |
| `minQuoteRaised` | uint256 | Quote floor for predicate 1; 0 with predicate 0 |

The GateRecord address and the V2 factory are constructor arguments of the implementation, so a launch cannot point the gate at another record source.

### Calls

| Call | Who | What |
| --- | --- | --- |
| `bindEvidence(od, root)` | the agent or the token's creator | Checks the record and binds it; reverts with the check that fails |
| `verifyEvidence(od, root)` | anyone, `eth_call` | The key a binding would store, or the same revert |
| `graduate()` | anyone | Asks Core to migrate now; reverts with the missing condition (`LiquidityNotReady`, `EvidenceMissing`, `EvidenceRootMismatch`, …) |
| `status()`, `params()`, `evidence()` | anyone | Reads for the launch tower |

Outside `graduate()`, `evaluate()` answers false until both conditions hold, so a missing record never reverts the buy that sells out the sale.

Events: `EvidenceBound(token, agent, key, od, root, boundBy)` and `Graduated(token, pair, evidenceKey, tokenAmount, quoteAmount, liquidity)`.

## Launch tower reads

`src/launch-tower.ts`, exported as `@gatelock/openfour/launch-tower`, reads one launch at one block with `eth_call` only and runs in the browser:

```ts
import { readLaunchTower } from "@gatelock/openfour/launch-tower";

const tower = await readLaunchTower(publicClient, { core, token });
tower.blockers; // [] | ["liquidity"] | ["evidence"] | ["liquidity", "evidence"]
tower.record;   // the bound GateRecord record, read from GateRecord
tower.pool;     // pair, reserves and LP at 0x…dEaD after graduation
```

`explainRevert(data)` names a revert from the module or GateRecord.

## Build and test

From the repository root:

```sh
pnpm --filter @gatelock/openfour build
pnpm --filter @gatelock/openfour test
pnpm --filter @gatelock/openfour typecheck
```

Contracts compile with Hardhat (solc 0.8.28, cancun, optimizer 200, via IR). The tests run in vitest on Hardhat's in-process chain against the real GateRecord, compiled from `@gatelock/contracts`, and test doubles for Core, the vault, the token and a V2 pair.

## Run a launch

1. Deploy a developer-owned proxy set on BSC testnet with the OpenFour fork toolkit (`developer/fork-deploy` in [openfour-docs](https://github.com/four-meme-community/openfour-docs), `npm run fork:dry`, then `npm run fork`). Its `out/fork-deployment.json` is the `--fork` input below; the deployer owns the Registry and signs creates.
2. Run the steps in order, one launch per evidence directory. Each reads the key `OPENFOUR_TESTNET_PRIVATE_KEY` through `loadSecrets`, refuses any chain but 97 and 31337, simulates each call before sending it, and writes what it sent and read to `--evidence`. Keep that directory outside the repository.

```sh
cd modules/openfour
node scripts/launch.ts deploy   --fork <fork-deployment.json> --evidence <dir>
node scripts/launch.ts create   --fork <…> --evidence <dir> --agent <committer> --min-od 20261126 --min-leaves 300 --code-hash <bytes32>
node scripts/launch.ts buy      --fork <…> --evidence <dir>
node scripts/launch.ts graduate --fork <…> --evidence <dir> --expect-revert   # evidence missing: mined, reverts
node scripts/launch.ts bind     --fork <…> --evidence <dir> --od 20261126 --root <root>
node scripts/launch.ts graduate --fork <…> --evidence <dir>
node scripts/launch.ts verify   --fork <…> --evidence <dir>                   # every receipt re-read from a second RPC
```

`deploy` registers the module on the fork's Registry and adds a preset that copies Bonding V1 with this Migrate. `create` launches Grand Prix Planner (PLNR, testnet): 10 billion supply, 8 billion on the curve, a 0.1 WBNB raise, anti-sniper off. `--rpc http://127.0.0.1:<port>` runs the same steps on a local fork of BSC testnet.

A launch that also sells back to the curve before graduating reuses the deployed preset (`--preset` checks that the Registry still resolves it to the recorded module):

```sh
node scripts/launch.ts create   --fork <…> --evidence <dir2> --preset 1795634196178 --name "Grand Prix Planner 27 Nov" --symbol PLNR27 \
                                --agent <committer> --min-od 20261127 --min-leaves 300 --code-hash <bytes32>
node scripts/launch.ts buy      --fork <…> --evidence <dir2> --tokens 1000000000   # Core.buy of an exact amount; the sale stays open
node scripts/launch.ts sell     --fork <…> --evidence <dir2> --percent 90          # Core.sell back to the curve, quote kept as WBNB
node scripts/launch.ts buy      --fork <…> --evidence <dir2>                       # buyByBudget to sell-out
```

then `graduate --expect-revert`, `bind`, `graduate` and `verify` as above.

## Submission records

`submission/` holds what OpenFour's developer workflow asks to submit for review:

- `tokens.json`: OpenFour's Workbench token list (`developer/workbench/data/tokens.json`, newest first) for every launch in `deployments/bsc-testnet.json`, each row extended with its create, buy, sell and migrate records, the bound record, the pool and failure paths checked by `eth_call`. `node scripts/tokens-json.ts` rebuilds it without a key: every transaction, receipt and block is read from at least two of three public RPCs run by different operators, and they must agree.
- `submit-pack.json`: the same material in the shape of OpenFour's `pack-submit.js` (`node scripts/submit-pack.ts`).

The gameplay proposal and the AI-assisted audit are in `docs/sponsors/openfour-gameplay.md` and `docs/sponsors/openfour-ai-audit.md`.

## BSC testnet

`deployments/bsc-testnet.json` lists the addresses below; the launch tower reads from `core` and the token.

| | Address |
| --- | --- |
| Registry (developer-owned) | `0x4458EdB563886b1568701A13aDFb0D3e17254e99` |
| Core | `0x90feAb906d1eE89611576DD6F042Bca840A94aF7` |
| Tools | `0x4a60f097A2f39a007bd92737B6c80aEE30992072` |
| Migrate implementation | `0xfc2E00dCfC39C71F97Ce0e6ba9C52717Ed8fbA8e` (beacon `0xd57B39899b3bb33d85ACAAe705d571a1559F30C6`) |
| Preset | `1795634196178`, Evidence-gated Bonding V1 |
| Grand Prix Planner (PLNR, testnet) | `0xB1e792b2C6Bf7Ae7A1D972af313442039422ef14`, migrate instance `0xD23E368C50b8F5E8624Adfc30cdE2D4dE8E87735` |
| PLNR / WBNB pair | `0xe54cDdE2d4A28b0131C5Dc6b9E5Afb20701680Ee` |
| Grand Prix Planner 27 Nov (PLNR27, testnet) | `0x027C1A8D15ceb3048F5EC787D5e1E64B1043cE47`, migrate instance `0xF3Cb2A05dF23A4464A8A7606229e150552b71871` |
| PLNR27 / WBNB pair | `0x28Fb374c51B89c7D58c5849a478339BFda640879` |
| GateRecord | `0x2922c68cE15EB3e83B7f43b136e981dDc4262876` |

## Discovery probe and encoding

`src/probe.ts` reads OpenFour's BSC testnet Registry, Core, Tools, proxy implementation slots, presets, module implementations, descriptors and schemas at one block, through an allowlist of read-only RPC methods:

```sh
pnpm --filter @gatelock/openfour probe
node dist/probe.js <output.json> <block>
```

`encodeModuleParams(schema, values)` in `src/schema.ts` encodes values already in contract units, in schema order, as **one tuple**, matching `abi.decode(raw, (Params))`; no parameters encode as `0x`.

## Licensing

All code here is original and MIT. The OpenFour structures are declared in `contracts/interfaces/OpenFour.sol` from the public interfaces' ABI; no OpenFour file is copied. The fork toolkit is run from its own checkout and is not vendored.
