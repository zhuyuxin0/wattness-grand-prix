# OpenFour module audit: Evidence-gated Migrate

**AI-assisted audit.** An AI model read every line of the module, its interface declarations and the GateRecord contract it relies on, checked them against OpenFour's audit checklist and published sources, ran the module's tests and read the deployed contracts on BSC testnet. It is not a substitute for an audit by a security firm: no formal verification, no fuzzing campaign, and OpenFour's unpublished Core, Registry, vault and token module code was not read (see Limits). Findings describe condition, impact and fix only; no exploit code was written, as OpenFour's audit guide asks. Nothing was changed on chain; every fix below is a recommendation.

- **Date:** 27 Nov 2026, 01:00–02:00 Bangkok (26 Nov, 12:00–13:00 CT)
- **Scope:** `modules/openfour/contracts/EvidenceGatedMigrateModule.sol` (423 lines), `contracts/interfaces/OpenFour.sol`, `contracts/interfaces/IGateRecord.sol`, and the composition of preset `1795634196178`. Read as dependencies, not audited for their own findings: `contracts/contracts/GateRecord.sol` (the evidence source), OpenFour's `OpenFourToken.sol`, `FairLaunchMigrateModule.sol` and `PancakeV2MigrateLib.sol` at openfour-docs `079a45e9`.
- **Commit audited:** [`06d70b5`](https://github.com/zhuyuxin0/wattness-grand-prix/tree/06d70b5f2d10c1cecac02252b1c5da30ca3efc36/modules/openfour) (main, 27 Nov 00:27 Bangkok). The contract source there is the one first committed in `45e0e27` and deployed: git blob `338a5c5ffe09c4806289a697c9d9045b6451699b`, SHA-256 `9ef9a79a6e75e6da176c7b7f0effcae006fa0ce25fffaff354563cad1a8819aa`.
- **Deployed code checked:** the runtime code at implementation `0xfc2E00dCfC39C71F97Ce0e6ba9C52717Ed8fbA8e` equals a fresh build of that source, byte for byte once the CBOR metadata is removed (13,384 bytes), with immutables `gateRecord = 0x2922c68cE15EB3e83B7f43b136e981dDc4262876` and `pairFactory = 0x6725F303b657a9451d8BA641348b6761A6CC7a17` (PancakeSwap V2 testnet). Read from BNB Chain's and ZAN's testnet RPCs, about 01:11 Bangkok on 27 Nov.
- **Fork Registry:** `0x4458EdB563886b1568701A13aDFb0D3e17254e99` (developer-owned, chain 97). Core `0x90feAb906d1eE89611576DD6F042Bca840A94aF7`.
- **Preset id / moduleKeys:** preset `1795634196178`, Evidence-gated Bonding V1. Module key `0xda5f2c8f283f8842faa41ec65c6c1a7987d39cb0bccb02f4d5b8048a152e65df` = `keccak256("module.migrate.evidence_gated")`, tag id `0xda5f2c8f283f8842`, kind 4 (Migrate), version 1.0.0, beacon `0xd57B39899b3bb33d85ACAAe705d571a1559F30C6`.

Line numbers below refer to the contract at the audited commit.

## Summary

| Id | Severity | Title | Status |
| --- | --- | --- | --- |
| H-1 | High | A launch whose record never qualifies freezes the raise: no exit after sell-out, no deadline | Open, fix specified |
| M-1 | Medium | The token's creator can bind any agent's record without the agent's consent | Open, fix specified |
| M-2 | Medium | Anyone holding the token can block graduation by seeding the PancakeSwap pair first | Open, fix specified |
| M-3 | Medium (this fork) | One key can change every live launch's logic through the beacon | Open, operational fix |
| M-4 | Medium (unused option) | Liquidity predicate 1 sends all unsold sale tokens into the pool | Open, fix specified |
| L-1 | Low | One record can graduate any number of launches; an early `minOd` accepts old records | Open |
| L-2 | Low | The preset reuses Bonding V1's validator, which does not check this module's invariants | Open |
| L-3 | Low | Built with solc 0.8.28 and transient storage; OpenFour's environment is solc 0.8.24 | Open, port specified |
| L-4 | Low | The evidence proves a sealed commitment before the gate, not performance | Disclosure |
| I-1 to I-8 | Informational | See below | — |

No Critical finding. Neither deployed launch has funds exposed to H-1 or M-2 today: both have graduated, and their LP is at `0x…dEaD`.

## Invariants

The module should guarantee:

1. **Both conditions at execution.** A launch graduates only if, when the migration executes, the vault's selected liquidity predicate holds and a GateRecord record is bound that was committed by the launch's agent, in its scope, for a day on or after `minOd`, with the claimed root, at least `minLeafCount` leaves, the required code hash when one is set, a commit time before that day's gate, and the settlement stage linked when `outcomeStage > 0`.
2. **Only Core migrates,** only for the bound token and that token's own vault, and only once.
3. **A missing record never reverts a buy.** Outside `graduate()`, `evaluate()` answers false, so the buy that sells out the sale still succeeds.
4. **Capped amounts.** Graduation moves at most `maxSupply − sold` tokens and `totalRaised` quote, into an empty V2 pair, and sends the LP to `0x…dEaD`.
5. **One initialization** per instance; the implementation itself cannot be initialized.
6. **Fixed sources.** No launch can choose its own evidence source or DEX factory.
7. **Binding rights.** Only the agent or the token's creator can bind; nobody can bind after graduation.
8. **`evaluate()` writes nothing.**

How the code holds them:

| Invariant | Holds? | Where |
| --- | --- | --- |
| 1 | Yes | `executeMigration` rechecks liquidity (L175) and the bound record in full (L176–178, `_inspect` L375–397) |
| 2 | Yes | `OnlyCore`, `WrongToken`, `WrongVault`, `AlreadyGraduated` (L170–174); `pair` set once (L181) |
| 3 | Yes | `evaluate` L151–161. On chain, the sell-out buys [`0xdd80…9467`](https://testnet.bscscan.com/tx/0xdd809ed51df954bd0e3f4aa931650ac6a187f20072cfeb22ee05ecd8224d9467) and [`0x17d7…3a56`](https://testnet.bscscan.com/tx/0x17d7940454fc2e05e39803520582b3faadbdda7fd6aab920b2880ec29df73a56) closed both sales without migrating |
| 4 | Yes | `_addLiquidity` L406–417 |
| 5 | Yes | constructor L127, `init` L136; Core initializes each instance inside `createToken` |
| 6 | Per implementation | immutables L107–108; a beacon upgrade can change them (M-3) |
| 7 | Yes, with a consent gap | L202–203 (M-1) |
| 8 | Yes | `evaluate` is `view` |

## Findings

### [H-1] A launch whose record never qualifies freezes the raise: no exit after sell-out, no deadline

- **Location:** `evaluate` L156–160, `executeMigration` L175–178; the preset keeps Bonding V1's vault, whose `SoldOut` phase closes internal buying and selling (OpenFour integration guide: "Internal buy/sell are unavailable"). Observed on chain: replayed with `eth_call` at block 145,021,250 (26 Nov 11:41:00 CT / 27 Nov 00:41:00 Bangkok), when the 27 Nov launch was sold out and its graduation had just been refused, both a sell and a buy by a holder revert with Core's `CoreErrBadPhase`.
- **Condition:** the sale sells out and no record ever qualifies for this launch: the agent stops sealing, seals with different code while `codeHash` is pinned, covers fewer than `minLeafCount` batteries, or, with `outcomeStage > 0`, never links that stage.
- **Impact:** graduation reverts forever. The raised quote (0.1 WBNB in these launches) and the reserve tokens stay in the vault, holders cannot sell back to the curve, and there is no pool. The module gives no way out; only a beacon upgrade by the Registry owner (M-3) or an intervention in Core could release the funds. The standard Bonding V1 migrate graduates in the sell-out buy itself (OpenFour's fork toolkit README), so it never waits after sell-out; this module adds the wait.
- **Fix:** move the evidence requirement before the point of no return. In order of preference:
  1. Require the binding before the sale can close: a view-only Trade module that answers `allowed = false` for the buy that would sell out the sale while `status().evidenceBound` is false. Sells stay open, so holders keep the curve as an exit. Stricter still: require the binding before trading opens, so buyers see the record before they buy.
  2. Add `evidenceDeadline` to `Params`: after it, `executeMigration` graduates without evidence and emits `GraduatedUnverified`, so liquidity is never stranded and indexers can mark the launch as unverified.
  3. A refund mode needs a custom vault, the highest-risk slot; not recommended.

### [M-1] The token's creator can bind any agent's record without the agent's consent

- **Location:** `bindEvidence` L202 (`msg.sender == agent || msg.sender == _creator()`); `agent` is a free creation parameter (L40, checked only for zero at L334).
- **Condition:** anyone who can create a launch names an agent whose GateRecord records are public and binds one of them.
- **Impact:** the launch graduates on the genuine record of an agent that never agreed to it, and buyers can read that record as the agent's endorsement. In our two launches the creator (`0x749A444AC6220539D8b5E9D8E21232ff70C4C79D`, the OpenFour testnet wallet) and the agent (`0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8`, the planner's sealing wallet) are both ours, but nothing on chain says so.
- **Fix:** accept bindings from the agent only; or require `creator == agent` in the preset validator; or require an EIP-712 signature by the agent over `(chainId, Core, token, scope, minOd)`, checked in `bindEvidence` or at creation.

### [M-2] Anyone holding the token can block graduation by seeding the PancakeSwap pair first

- **Location:** `_addLiquidity` L404–406 (`PoolNotEmpty`). OpenFour's `OpenFourToken._blocksBeforeMigration` blocks transfers only to pools already marked, and this module marks the pair only at graduation (L182).
- **Condition:** before graduation, a holder creates (or finds) the token/WBNB pair, sends it some tokens and some WBNB, and mints LP.
- **Impact:** the pair's LP supply never returns to zero (1,000 LP stay locked at address 0), so graduation reverts `PoolNotEmpty` for good; after sell-out this becomes the frozen state of H-1. OpenFour's own `PancakeV2MigrateLib` has the same check (`"PancakeMigrate: non-empty pool"`).
- **Fix:** in `init`, mark the canonical pair before any trade: get it from the factory (`createPair`, or its CREATE2 address) and call `token.setMigratedPool(pair, true)`. The standard token then refuses transfers into the pair until its phase is `MigratePending` or `Migrated` (`_blocksBeforeMigration`), and WBNB alone cannot mint LP. Alternatively, on a seeded pair, add liquidity at the pair's ratio and send the remainder to `0x…dEaD`.

### [M-3] One key can change every live launch's logic through the beacon (Medium on this fork; Informational on OpenFour's Hub)

- **Location:** both migrate instances are ERC-1967 beacon proxies whose beacon slot holds `0xd57B39899b3bb33d85ACAAe705d571a1559F30C6`; that beacon's owner is the fork Registry, and the Registry's owner is one externally owned account, `0x749A…C79D`. Read on chain 27 Nov 01:12 Bangkok.
- **Condition:** the Registry owner calls `upsertModule` for `module.migrate.evidence_gated` with a new implementation.
- **Impact:** every launch's `evaluate` and `executeMigration` change at once. A new implementation could drop the evidence check, change the immutable GateRecord and factory (invariant 6), or send the quote elsewhere during a migration, since the module is the vault's migration caller.
- **Fix:** on OpenFour's Hub, upgrades belong to governance, as for every module. A developer-owned deployment should put the Registry behind a multisig with a timelock and publish each upgrade; anyone relying on the gate can read the beacon's implementation first. Upgrades must keep the storage layout (I-5).

### [M-4] Liquidity predicate 1 sends all unsold sale tokens into the pool (not used by either launch)

- **Location:** `_liquidityReady` L354; `_addLiquidity` L408–410.
- **Condition:** a launch created with `liquidityPredicate = 1` graduates once `totalRaised ≥ minQuoteRaised`, before the sale sells out.
- **Impact:** `tokenAmount = maxSupply − sold` then includes the unsold sale tokens, so the pool opens lower than it would at sell-out, and can open below the curve's last price, leaving the curve's buyers under water. A floor above `raiseAmount` can never be met (sells stay open while the vault is `Trading`, so holders keep an exit).
- **Fix:** with predicate 1, move only the reserve (`maxSupply − saleAmount`) plus tokens matching the raised quote at the curve's last price, and burn the rest; or accept predicate 1 only with `minQuoteRaised == raiseAmount`; check the floor against `raiseAmount` in the preset validator (L-2).

### [L-1] One record can graduate any number of launches; an early `minOd` accepts old records

- **Location:** `_inspect` L377–378; `bindEvidence` L204.
- **Condition:** several launches name the same agent and scope; or `minOd` is set long before the launch.
- **Impact:** one sealed day lends its weight to many launches (with M-1, to copies too), and the "evidence" can be months old.
- **Fix:** record consumed keys in a shared registry (`key → token`) at binding, or have the agent seal a launch-specific scope; require `minOd` on or after the creation day in the validator, or a maximum age at graduation.

### [L-2] The preset reuses Bonding V1's validator, which does not check this module's invariants

- **Location:** preset `1795634196178` copies Bonding V1's validator `0xD8590b6914d4D60FcCfe08A2087B9A3d3F2d6A70` (read from the Registry, 27 Nov 01:16 Bangkok); `_validate` (L333–346) checks only the module's own fields.
- **Condition:** creation parameters the module cannot enforce alone: predicate 1 with a floor above `raiseAmount`; a quote that is not an ERC-20 (the module calls `balanceOf` on it); a token implementation that takes a fee on transfer; `minOd` before the creation day; `creator ≠ agent` (M-1).
- **Impact:** launches that can never graduate, or graduate unfairly, can be created.
- **Fix:** an `EvidenceGatedPresetValidator` for these cross-module checks, as the Developer Guide (§19) recommends.

### [L-3] Built with solc 0.8.28 and transient storage; OpenFour's environment is solc 0.8.24

- **Location:** `pragma solidity 0.8.28` (L2); `bool private transient _graduating` (L120) needs solc ≥ 0.8.28 and the Cancun EVM; `hardhat.config.ts` uses solc 0.8.28, `evmVersion` cancun, optimizer 200 runs, viaIR.
- **Condition:** OpenFour asks for Hardhat with solc 0.8.24, optimizer on, 200 runs, viaIR (openfour-docs `developer/skills/openfour-developer/environment.md`).
- **Impact:** OpenFour cannot rebuild the same bytecode in its environment, so the module cannot be registered officially as it stands. (BSC testnet runs Cancun opcodes; the deployed module works.)
- **Fix:** port to 0.8.24: replace the transient variable with a storage flag set and cleared inside `graduate()` (or `tload`/`tstore` in assembly if their target sets `evmVersion` cancun), keep the storage layout append-only, rebuild, rerun the tests and the launch.

### [L-4] The evidence proves a sealed commitment before the gate, not performance (disclosure)

- **Location:** `_inspect` L382–396.
- **Condition:** with `outcomeStage = 0` (both launches) only the sealed record is checked; stages 1 to 3 check that the committer linked an outcome hash, not what it says.
- **Impact:** graduation shows that the agent sealed a plan for at least 300 batteries before the market's gate, not that the plan earned money. Copy must claim no more than that.
- **Fix:** keep the wording. For a performance gate, verify a claim against the linked outcome hash on chain (for example a Merkle proof) or require an independent evaluator's attestation, such as an ERC-8004 validation.

### Informational

- **I-1 (order of effects).** `executeMigration` writes `pair` (L181) after the external calls in `_addLiquidity`. No path re-enters: only Core can call it, the vault is `MigratePending`, and the callees are the V2 factory and pair, the vault and the token, none controlled by a caller. `graduate()` also refuses a nested call (`GraduationInProgress`, L212); transient storage resets with the transaction and on revert.
- **I-2 (`_creator`).** L359–361 read the creator from `Core.tokens(token)` by position through a low-level call; if the call fails, only the agent can bind. A change to Core's getter could make the binder set wrong.
- **I-3 (rebinding).** A later `bindEvidence` replaces the earlier binding (L205); `EvidenceBound` does not carry the previous key, so indexers must take the latest event.
- **I-4 (repeat graduation).** `graduate()` after graduation is a quiet no-op: checked by `eth_call` on both launches.
- **I-5 (storage).** No storage gap: upgrades through the beacon may only append state.
- **I-6 (fee router).** `init` ignores its fee router argument (L132); the module moves no fees (see Fee paths).
- **I-7 (root argument).** `root` repeats what the key already determines; it confirms the binder's intent and adds no security.
- **I-8 (gas).** When the record is bound before sell-out, the buyer who sells out the sale also pays for the migration (2,494,532 gas for the graduation itself on testnet), as with Bonding V1's automatic migration.

## The five areas asked about

**Access control.**

| Function | Who may call | Checks |
| --- | --- | --- |
| `init` | anyone, once | `_initialized`; Core calls it inside `createToken`, so no one can initialize an instance first |
| `evaluate` | anyone (view) | bound token, not graduated |
| `executeMigration` | Core only | caller, token, vault, not graduated, both conditions |
| `bindEvidence` | the agent or the creator | `NotBinder`, not graduated, the full evidence check (M-1) |
| `graduate` | anyone | the guard flag; reverts with the missing condition |
| `verifyEvidence`, `status`, `params`, `evidence` | anyone (views) | — |

**Reentrancy.** No exploitable path (I-1). The only state written outside Core's call is the binding (`bindEvidence`, after its checks, with no external call after the write) and the transient flag.

**The evidence check's binding and replay.** The record is looked up by `keyOf(agent, scope, od)`, which GateRecord computes from the committer, so only the agent's own record can satisfy a launch; the fields are rechecked (L382) and the claimed root must equal the recorded one (L385). Records are write-once and GateRecord refuses commits at or after the gate, so a bound record cannot be changed or invalidated later, and the module checks the commit time again (L392–393). The GateRecord address is an immutable of the implementation, so a launch reads only its own chain's GateRecord. Replay across launches is possible (L-1); binding without the agent's consent is M-1. Checked on chain by `eth_call` (block 145,022,752, 27 Nov 00:52 Bangkok): another day's record is refused with `EvidenceBeforeMinimumDay` (27 Nov launch) and `EvidenceCodeMismatch` (26 Nov launch), the right day with another root with `EvidenceRootMismatch`, and a binding from an outsider with `NotBinder`.

**Griefing of graduation.** Pool seeding (M-2) and a record that never comes (H-1) are the two ways to stop it. Creating the pair first is harmless (`getPair` returns it). Tokens or WBNB sent to the vault are ignored by the caps (L410–411); sent to the pair, they shift the opening price at the sender's cost. Racing `graduate()` is harmless: one call graduates, the rest are no-ops. Nobody but the agent can write the agent's records, and nobody can delete them.

**Upgradeability through the beacon.** The implementation is locked by its constructor. Instances are beacon proxies, so the Registry owner can replace the logic of every launch at once (M-3); the implementation's immutables travel with it.

**Fee paths.** The module takes no fee and pays none. Trading fees are Bonding V1's: 50 bps to the protocol and 50 bps to the developer pool on each buy and sell, both to this fork's FeeRouter `0xd72371f269777B66aC0B2dA9C26012F7769a3631`, whose treasury is the deployer. Measured on the 27 Nov launch's sell [`0x1e42…fd56`](https://testnet.bscscan.com/tx/0x1e420c74807f518ea5a7ce5831add11c13b51a0d4cd06b20c6cc3eeb62f6fd56) (26 Nov, 11:40:27 CT / 27 Nov, 00:40:27 Bangkok): the curve paid 0.003194299804593599 WBNB, the protocol fee and the developer fee were 0.000015971499022967 WBNB each, and the seller received 0.003162356806547665 WBNB. At graduation, all of `totalRaised` goes into the pair: [`0x9d2b…6720`](https://testnet.bscscan.com/tx/0x9d2b5112d35700f4fe274fcc70dc537ddfb9755d4f891d4e4e26d7ee133b6720) moved 2,000,000,000 tokens and 0.099999999999999998 WBNB into pair `0x28Fb374c51B89c7D58c5849a478339BFda640879` and minted 14,142.135623730950345595 LP to `0x…dEaD`. The module's Registry metadata sets `feeShareBps` to 0. OpenFour's FairLaunch reference migrate also takes no graduation fee; whether the production Bonding migrate does is not visible in public source, and if it does, this module skips that fee.

The pool opened at 5.0 × 10⁻¹¹ WBNB per token (0.1 WBNB for 2 billion tokens), 2% above the curve's final price of 4.9 × 10⁻¹¹ (`lastPrice` 48,999,999 wei per token in the sell-out buy's `TradeExecuted`; the curve started at 3.19 × 10⁻¹² per the `TokenCreated` event), so the pool does not open below the curve.

## OpenFour checklist

| Item | Result |
| --- | --- |
| `init` runs once; `fourCore` and `token` non-zero | Pass (L136–137) |
| `context.token` equals the bound token | Pass (L152, L171) |
| State writes Core-only, or the documented module | Pass: `executeMigration` is Core-only; `bindEvidence` is the documented binding entry point (M-1) |
| Raw init params and Registry-injected version stored | Pass (L144–145) |
| `descriptor()` stable; schema matches `Params` order | Pass (test, and Tools returned the 8-field schema for the preset on chain, 25 Nov) |
| No arbitrary `selfdestruct`, front-runnable init or unauthorized upgrade | Pass for the module; upgrades are the Registry owner's (M-3) |
| Migrate: `evaluate` does not write state | Pass |
| Migrate: `execute` rechecks and does not trust `hookData` | Pass (hookData unused) |
| Migrate: quote and token usage capped; external return values checked | Pass (L410–412, L417) |
| Migrate: `migratedDataVersion` explicit | Pass (1, `abi.encode(pair)`) |
| Composition: validator covers cross-module invariants | Not met (L-2) |
| Composition: `customDataId = 0` when unused | Pass (read from the Registry) |
| Composition: no production-network write logic, no hardcoded external signer | Pass (the scripts refuse every chain but 97 and a local fork) |
| Token and Vault | Standard Bonding V1 modules, unchanged; their interaction with pool seeding is M-2 |

## Preset wiring

Read from the fork Registry at block 145,025,906 (27 Nov 01:16 Bangkok). Evidence-gated Bonding V1 differs from Bonding V1 (`1778027615722`) only in its Migrate module, name and description:

| Slot | Bonding V1 | Evidence-gated Bonding V1 |
| --- | --- | --- |
| Token module | `0x48f90f41…637e` | same |
| Vault | `0x3e7c54e0…315b` | same |
| Curve | `0x0e4ee145…cb47` | same |
| Trade | `0x379c13a7…e10d` | same |
| Migrate | `0x61ebdadb…6f06` (Bonding migrate) | `0xda5f2c8f…65df` (`module.migrate.evidence_gated`) |
| Token implementation | `0x2b5b4abf…7d47` | same |
| Custom data | none | none |
| Validator | `0xD8590b69…6A70` | same (L-2) |
| Active, create enabled | yes, yes | yes, yes |

## Tests

The module's suite: 19 tests pass (27 Nov 01:14 Bangkok), on Hardhat's in-process chain against the real GateRecord, with test doubles for Core, the vault, the token and a V2 pair. They cover the locked implementation, schema order, parameters the module could not enforce, a sold-out sale closing without evidence and then `EvidenceMissing`, binding only the agent's own record, graduation into the pair with the LP at `0x…dEaD`, migration inside the sell-out buy when the record is bound first, the liquidity recheck, Core-only execution with the token's own vault, predicate 1, code hash, coverage and settlement stage, a non-empty pool, and the launch tower reads. Worth adding: pool seeding against the real `OpenFourToken` (M-2), the creator binding an unrelated agent (M-1), and a fork test against OpenFour's own Core and vault for the `SoldOut` behavior H-1 rests on (observed on testnet by `eth_call`, not yet in a test).

On chain, both launches ran the full flow on BSC testnet: [tokens.json](../../modules/openfour/submission/tokens.json) lists every transaction with its block and time, read from at least two of three RPCs run by different operators.

## Residual risk

- OpenFour's Core, Registry, FeeRouter, vault and token module are trusted. Their implementations are not published; the behavior this module relies on (Core initializes instances inside `createToken`, sets `MigratePending` before `executeMigration` and passes its revert back to the caller, and refuses trades at `SoldOut` and after migration with `CoreErrBadPhase`) was observed on testnet, not read in source.
- GateRecord (MIT, ours, not upgradeable) is trusted for its gate time, including the Central-time daylight-saving rule.
- PancakeSwap V2's testnet factory and pair are trusted as deployed.
- Everything here is on BSC testnet with testnet tokens; nothing is deployed on mainnet.

## Verdict

- **Pass** for the testnet prototype: on 25 and 26 Nov (CT) both launches refused graduation without the agent's record and graduated with it, as designed.
- **Ready for official submit: no**, as deployed. H-1 must be fixed (option 1 or 2 above) and M-1 to M-4 fixed or accepted in writing, then re-reviewed and the flow rerun; the L-3 port to solc 0.8.24 is needed for OpenFour's build environment.

## Limits

- AI-assisted: written by an AI model from a line-by-line reading, the test suite and chain reads. No formal verification, symbolic execution or fuzzing campaign was run.
- OpenFour's unpublished implementations are out of scope; findings that depend on them say so.
- Severities follow OpenFour's table in `developer/skills/openfour-developer/audit.md`, with one judgment: a permanent freeze of the raise (H-1) is rated High, because no path in the module recovers it.
