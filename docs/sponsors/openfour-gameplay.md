# OpenFour gameplay proposal: Evidence-gated Bonding V1

An agent's token that lists only after the agent has shown its work. Evidence-gated Bonding V1 is a preset for OpenFour, Four.meme's modular launch framework: it keeps Bonding V1's token, vault, curve and trade, and replaces one module, Migrate, so a sold-out sale graduates into PancakeSwap only once the agent's own sealed record is bound to the launch. Two launches have run the whole cycle on BSC testnet, on our own deployment of OpenFour made with OpenFour's fork toolkit: created, bought, sold back to the curve, sold out, refused graduation without the record, bound the record, graduated.

Code: [`modules/openfour`](../../modules/openfour). Records: [`submission/tokens.json`](../../modules/openfour/submission/tokens.json). Interface: the Grand Prix site's [Launchpad tab](https://gp.wattness.tech/markets/launchpad), and OpenFour's own Developer Workbench pointed at our deployment (screenshots sent with the submission). Audit: [openfour-ai-audit.md](openfour-ai-audit.md).

## Gameplay

**The problem.** On a launchpad a token graduates when its sale sells out, so demand alone lists it. When the token is an AI agent's, buyers have no on-chain way to check, before it lists, that the agent does the work it claims.

**Who it is for.** People who buy into agents' launches and want graduation to mean the agent has a record; agent builders who want their launch to carry proof of work; launchpads that want a preset where listing waits for evidence.

**How a launch plays.**

1. **Create.** The creator names the agent (the wallet that seals the agent's work in GateRecord, our record contract on BSC), the record's scope, the earliest operating day that counts, the minimum number of batteries the record must cover, and optionally the exact code the agent must have run (a git tree hash).
2. **Trade on the curve.** Buying and selling work exactly as in Bonding V1: the same curve, the same fees, the same sale size.
3. **Sell-out.** The buy that sells out the sale closes it as usual. If the agent's record is not bound yet, the sale closes without graduating, and the buy is never reverted for a missing record.
4. **Graduation waits for evidence.** `graduate()` asks OpenFour's Core to migrate and, while the record is missing, reverts on chain with the reason: `EvidenceMissing(agent, scope)`.
5. **Bind the record.** The agent (or the token's creator) binds the sealed record for an operating day. The module looks it up by the agent's address, scope and day, so only the agent's own record qualifies; it must cover enough batteries, match the code when the launch pins it, and have been committed before that day's market gate (10:00 Central the day before), which GateRecord itself enforces.
6. **Graduate.** With the sale sold out and the record bound, graduation moves the vault's reserve tokens and the whole raise into an empty PancakeSwap V2 pair and sends the LP to `0x…dEaD`.

**What makes it different.** The listing condition is the agent's own record, fixed in time before the market it is about, not demand alone. Only one module changes, so trading behaves as users of Bonding V1 already know. Every condition can be read before it matters: the launch tower and `verifyEvidence` name what is missing, with view calls only.

## Composition (BSC testnet, chain 97)

Our deployment of OpenFour (the Hub route's developer-owned fork): 26 transactions on 25 Nov, 12:46–12:51 CT, with openfour-docs `079a45e9` `developer/fork-deploy`, Bonding V1 only. Addresses from `modules/openfour/deployments/bsc-testnet.json`, checked against the chain on 27 Nov between 00:52 and 01:16 Bangkok (blocks 145,022,752 to 145,025,906).

| Part | Name | Address or id |
| --- | --- | --- |
| Registry | our deployment, owner `0x749A444AC6220539D8b5E9D8E21232ff70C4C79D` | `0x4458EdB563886b1568701A13aDFb0D3e17254e99` |
| Core | Core signer is the same wallet | `0x90feAb906d1eE89611576DD6F042Bca840A94aF7` |
| Tools | | `0x4a60f097A2f39a007bd92737B6c80aEE30992072` |
| FeeRouter | treasury: the same wallet | `0xd72371f269777B66aC0B2dA9C26012F7769a3631` |
| CreateDeployer | | `0x61Ebd55dC15515797A710327d0d5280220A524A0` |
| Preset | Evidence-gated Bonding V1, version 1.0.0, active, create enabled | `1795634196178` |
| Token module | Bonding V1's (`TOKEN_STANDARD`) | `0x48f90f4115ab8ef5e9e882e46964405e86bb62323d676b602350fc8baef2637e` |
| Vault | Bonding V1's (`VAULT_BASIC`) | `0x3e7c54e066dccd796d82c61050797d9b41fc573ce6b95b1968fb6e21c9df315b` |
| Curve | Bonding V1's (`CURVE_BONDING`) | `0x0e4ee145a2864ef2ac97032a3c00ed121816998110d1cf364770093ce952cb47` |
| Trade | Bonding V1's (`TRADE_SIMPLE`) | `0x379c13a7faced71bfa110d4297fd89666ac21c3407816ab9ef26027c15dce10d` |
| **Migrate** | **evidence-gated graduation, `module.migrate.evidence_gated`** | key `0xda5f2c8f283f8842faa41ec65c6c1a7987d39cb0bccb02f4d5b8048a152e65df`, implementation `0xfc2E00dCfC39C71F97Ce0e6ba9C52717Ed8fbA8e`, beacon `0xd57B39899b3bb33d85ACAAe705d571a1559F30C6` |
| Token implementation | OpenFour's standard token | id `0x2b5b4abf986db939c949935971f5f7455d608538c86cb2537b616ef1755b7d47` |
| Validator | Bonding V1's | `0xD8590b6914d4D60FcCfe08A2087B9A3d3F2d6A70` |
| Custom data | none | `0x0` |
| Evidence source | GateRecord (same address on BSC mainnet and testnet) | `0x2922c68cE15EB3e83B7f43b136e981dDc4262876` |
| DEX | PancakeSwap V2 testnet factory | `0x6725F303b657a9451d8BA641348b6761A6CC7a17` |

**Descriptor.** Tag `module.migrate.evidence_gated` (the moduleKey's source string), tag id `0xda5f2c8f283f8842`, version 1.0.0 (injected by the Registry), kind 4. `executeMigration` returns data version 1, `abi.encode(pair)`, the standard V2 migrate's payload. Source: [`EvidenceGatedMigrateModule.sol`](../../modules/openfour/contracts/EvidenceGatedMigrateModule.sol), MIT, first committed in `45e0e27`, unchanged on main at `06d70b5`; the deployed runtime code equals a fresh build of it once the compiler metadata is removed (checked 27 Nov, about 01:11 Bangkok).

**Schema** (`moduleEncodeSchema()`, one tuple, decoded as `abi.decode(raw, (Params))`; OpenFour's Tools returned it for the preset on 25 Nov):

| # | Field | Type | Meaning |
| --- | --- | --- | --- |
| 0 | `agent` | address | the wallet that seals the agent's plans in GateRecord |
| 1 | `scope` | bytes32 | `keccak256` of the scope label; default `gate-record/ercot-da-energy` |
| 2 | `minOd` | uint32 | earliest qualifying operating day, YYYYMMDD |
| 3 | `minLeafCount` | uint32 | batteries the record must cover |
| 4 | `codeHash` | bytes32 | required record code hash; zero accepts any |
| 5 | `outcomeStage` | uint8 | 0: the sealed record; 1 to 3: that settlement stage must also be linked |
| 6 | `liquidityPredicate` | uint8 | 0: sold out; 1: raised at least `minQuoteRaised` |
| 7 | `minQuoteRaised` | uint256 | quote floor for predicate 1; 0 with predicate 0 |

**Validator rules.** The preset uses Bonding V1's validator for the create parameters (supply, sale and raise). The module checks its own parameters at `init`: a non-zero agent and scope, a valid `minOd` date (GateRecord refuses dates it cannot place), `outcomeStage` at most 3, and a floor that matches the predicate. A dedicated validator for the cross-module rules is the first item in the audit's fixes (L-2). Tests: 19 pass in `modules/openfour` (27 Nov, 01:14 Bangkok).

## The two launches

Both on BSC testnet, both created by the OpenFour testnet wallet `0x749A…C79D` for the agent `0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8`, the Wattness planner's sealing wallet. Testnet tokens with no value; the quote is testnet WBNB (`0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd`).

| | Grand Prix Planner (PLNR, testnet) | Grand Prix Planner 27 Nov (PLNR27, testnet) |
| --- | --- | --- |
| Token | `0xB1e792b2C6Bf7Ae7A1D972af313442039422ef14` | `0x027C1A8D15ceb3048F5EC787D5e1E64B1043cE47` |
| Vault | `0xD5AfAbB7B4C97B7a46a5282Ce44d4619EB3bc300` | `0x7bb1751A4f74215C6d66913Ab99c7aBdef5e7330` |
| Migrate instance | `0xD23E368C50b8F5E8624Adfc30cdE2D4dE8E87735` | `0xF3Cb2A05dF23A4464A8A7606229e150552b71871` |
| Supply, sale, raise | 10 billion, 8 billion on the curve, 0.1 WBNB; anti-sniper off | same |
| Gate | operating day 26 Nov or later, at least 300 batteries, code tree `b83af422…` | operating day 27 Nov or later, at least 300 batteries, code tree `586e47c2…` |
| Record bound | 26 Nov plan: key `0xafee502d…fdf9`, root `0xf4d40023…bbce7`, 316 batteries, committed 25 Nov 09:17:00 CT, 43 min before the gate | 27 Nov plan: key `0x24f59168…cf99`, root `0x3cd80043…59be`, 316 batteries, committed 26 Nov 08:10:16 CT, 1 h 49 min before the gate (the same record is sealed on BSC mainnet, block 135,860,303) |
| Pair (PancakeSwap V2) | `0xe54cDdE2d4A28b0131C5Dc6b9E5Afb20701680Ee` | `0x28Fb374c51B89c7D58c5849a478339BFda640879` |
| In the pair at graduation | 2,000,000,000 PLNR and 0.099999999999999998 WBNB | 2,000,000,000 PLNR27 and 0.099999999999999998 WBNB |
| LP at `0x…dEaD` | 14,142.135623730950345595 | 14,142.135623730950345595 |

The gates are GateRecord's, at 10:00 CT the day before each operating day. The code trees are the repository's git trees at each seal (`586e47c2…` is the tree of commit `40163a8`).

## Create, buy, sell and migrate records

Every transaction below was read back from at least two of three public RPCs run by different operators (BNB Chain, ZAN, PublicNode), which agreed on status, block, logs and input; `tokens.json` holds the full record, the decoded events and the amounts. Times are block times.

**Grand Prix Planner 27 Nov (PLNR27, testnet), 26 Nov CT / 27 Nov Bangkok**

| Step | Transaction | Block | CT | Bangkok | Result |
| --- | --- | --- | --- | --- | --- |
| Create | [`0x26ab9fbc…6323`](https://testnet.bscscan.com/tx/0x26ab9fbc2def498e98436ee1754700eaddcd5c6d3a3ea54a83a7e9562d546323) | 145,021,087 | 11:39:46 | 00:39:46 | launched with the gate above |
| Buy | [`0x65bd6eba…68b5`](https://testnet.bscscan.com/tx/0x65bd6eba352db36dd2054f307330352fca71ce4468e8fc8778f9d21b3f2268b5) | 145,021,141 | 11:40:11 | 00:40:11 | 1,000,000,000 tokens for 0.003551336146272853 WBNB |
| Approve the token | [`0x0dbda5e9…2abd`](https://testnet.bscscan.com/tx/0x0dbda5e90174546b578d065b830bdb690ffc37b89eff2b93a23bbc6c2f682abd) | 145,021,174 | 11:40:26 | 00:40:26 | |
| Sell | [`0x1e420c74…fd56`](https://testnet.bscscan.com/tx/0x1e420c74807f518ea5a7ce5831add11c13b51a0d4cd06b20c6cc3eeb62f6fd56) | 145,021,178 | 11:40:27 | 00:40:27 | 900,000,000 tokens back to the curve for 0.003162356806547665 WBNB |
| Wrap and approve WBNB | [`0x0f15116a…cb5b`](https://testnet.bscscan.com/tx/0x0f15116a544404d6cd503522eab44920806fe5624b7ae711d10e7d07e8e1cb5b), [`0xefe88530…6252`](https://testnet.bscscan.com/tx/0xefe8853055d68f774bffe01e674f6467fb45d6608f37d804a5ad238518636252) | 145,021,207, 145,021,211 | 11:40:40, 11:40:42 | 00:40:40, 00:40:42 | |
| Buy to sell-out | [`0xdd809ed5…9467`](https://testnet.bscscan.com/tx/0xdd809ed51df954bd0e3f4aa931650ac6a187f20072cfeb22ee05ecd8224d9467) | 145,021,216 | 11:40:44 | 00:40:44 | 7,900,000,000 tokens for 0.100674906656366678 WBNB; sale Trading → SoldOut, no migration |
| Migrate, refused | [`0xce84183e…eeaf`](https://testnet.bscscan.com/tx/0xce84183e3eba32a691dd66dad351c1eba0541df7d64c46a7471cfe222891eeaf) | 145,021,247 | 11:40:58 | 00:40:58 | reverted on chain: `EvidenceMissing(0xfa22…94b8, 0x4ace…6bb9)` |
| Bind the 27 Nov record | [`0xd7be1172…d515`](https://testnet.bscscan.com/tx/0xd7be1172ffe756dc26175c9b6520fcdfe41d85a7b190cd571bffa851ed10d515) | 145,021,288 | 11:41:17 | 00:41:17 | `EvidenceBound`, key `0x24f59168…cf99` |
| Migrate | [`0x9d2b5112…6720`](https://testnet.bscscan.com/tx/0x9d2b5112d35700f4fe274fcc70dc537ddfb9755d4f891d4e4e26d7ee133b6720) | 145,021,313 | 11:41:28 | 00:41:28 | SoldOut → MigratePending → Migrated; `MigrateExecuted` and `Graduated` into pair `0x28Fb…0879` |

**Grand Prix Planner (PLNR, testnet), 25 Nov CT / 26 Nov Bangkok**

| Step | Transaction | Block | CT | Bangkok | Result |
| --- | --- | --- | --- | --- | --- |
| Create | [`0x87537227…ac6f`](https://testnet.bscscan.com/tx/0x875372271c9dde0ecdb3703dec11a7fd88108d68ce80bde84241ab4411ecac6f) | 144,842,416 | 13:16:51 | 02:16:51 | launched with the gate above |
| Wrap and approve WBNB | [`0x03058afb…418e`](https://testnet.bscscan.com/tx/0x03058afbded0dd16544dfc9e50141bdde73867dad454b6e5b9c156041d74418e), [`0x0f8d4103…2788`](https://testnet.bscscan.com/tx/0x0f8d4103585f9e51447e851589a1196c1b837cddc466c1d001545d41cfac2788) | 144,842,446, 144,842,450 | 13:17:05, 13:17:07 | 02:17:05, 02:17:07 | |
| Buy to sell-out | [`0x17d79404…3a56`](https://testnet.bscscan.com/tx/0x17d7940454fc2e05e39803520582b3faadbdda7fd6aab920b2880ec29df73a56) | 144,842,456 | 13:17:09 | 02:17:09 | 8,000,000,000 tokens for 0.100999999999999996 WBNB; Trading → SoldOut, no migration |
| Migrate, refused | [`0x219f25a2…686e`](https://testnet.bscscan.com/tx/0x219f25a2b86a8a73595911f40dd81f072655bd6711fdd4eb6b8108b6a733686e) | 144,842,485 | 13:17:22 | 02:17:22 | reverted on chain: `EvidenceMissing` |
| Bind the 26 Nov record | [`0xd100cfa2…1128`](https://testnet.bscscan.com/tx/0xd100cfa2402baaeec7de4545deedec2f72d238bbb53ec3fc34753d93718a1128) | 144,842,524 | 13:17:40 | 02:17:40 | `EvidenceBound`, key `0xafee502d…fdf9` |
| Migrate | [`0xc549f6e5…5330`](https://testnet.bscscan.com/tx/0xc549f6e5a6598ba308e6ecb837cf0da2a6fa23c1d72a6e40065df4c585af5330) | 144,842,547 | 13:17:51 | 02:17:51 | Migrated into pair `0xe54c…80Ee` |

**Module and preset registration on our Registry, 25 Nov CT:** implementation deployed [`0x1cd5fca5…4e45`](https://testnet.bscscan.com/tx/0x1cd5fca52f8af590effedca8e6d3682e1b3424626f2bcd03a2312a8e7be74e45) (block 144,842,374, 13:16:32 CT), `upsertModule` [`0xb9ad795d…ce11`](https://testnet.bscscan.com/tx/0xb9ad795d5b2d9236aed496105c2e66194b104a1dc5ae6a2636755f7e8f34ce11) (144,842,379, 13:16:34 CT), `upsertPreset` [`0x23aa595a…a7f2`](https://testnet.bscscan.com/tx/0x23aa595add67656eb2965908309467b1d4d2f35ade1a50f0dbbf39095e32a7f2) (144,842,385, 13:16:37 CT).

**Fees, as Bonding V1 charges them.** Each buy and sell paid 0.5% of the curve amount to the protocol and 0.5% to the developer pool, both into our FeeRouter: on the 27 Nov sell, 0.000015971499022967 WBNB each on a curve amount of 0.003194299804593599 WBNB. Graduation itself takes no fee: the whole raise went into the pair.

**Failure paths, checked by `eth_call`** at block 145,022,752 (27 Nov, 00:52 Bangkok), no transaction: another day's record is refused (`EvidenceBeforeMinimumDay` on PLNR27, `EvidenceCodeMismatch` on PLNR); the right day with another root, `EvidenceRootMismatch`; a binding from an outside wallet, `NotBinder`; buying or selling after graduation, OpenFour's `CoreErrBadPhase`; calling `graduate()` again does nothing.

**Cost of the 27 Nov run:** 7,311,355 gas at 0.1 gwei, 0.00073 tBNB, from the OpenFour testnet wallet (nonce 36 → 46, ten transactions; its mainnet nonce is 0).

## Risk notes

From the AI-assisted audit ([openfour-ai-audit.md](openfour-ai-audit.md)), which rates one finding High and four Medium; none puts the two launches above at risk, since both have graduated.

- **A record that never comes freezes the raise (High).** After sell-out, Bonding V1's vault closes trading; if no record ever qualifies, graduation never happens and the raise stays in the vault. Fix: require the record before the sale can sell out (a Trade module that holds the closing buy until a record is bound, keeping sells open), or a deadline after which the launch graduates as unverified.
- **The creator can bind any agent's record (Medium).** The chain cannot tell that the agent endorsed the launch. Fix: binding by the agent only, `creator == agent`, or an agent signature over the launch.
- **Pool seeding blocks graduation (Medium).** A holder can add liquidity to the token's PancakeSwap pair first; OpenFour's own V2 path has the same check. Fix: mark the pair at creation so the standard token refuses transfers into it before migration.
- **One key upgrades every launch (Medium on our deployment).** The module sits behind a beacon owned by our Registry, whose owner is one testnet wallet. On OpenFour's Hub this is governance's role.
- **Predicate 1 (raise floor) pools unsold tokens (Medium, unused).** Neither launch uses it; a validator should restrict it.
- **Smaller points.** One record can serve many launches; the preset reuses Bonding V1's validator; the module is built with solc 0.8.28 and transient storage while OpenFour builds with 0.8.24 (port specified).
- **What the evidence means.** Graduation shows the agent sealed a plan for at least 300 batteries before the market's gate, on the operating day the launch names; it does not show the plan earned money.
- **Testnet only.** Both tokens are testnet tokens with no value; nothing here is deployed on BSC mainnet, and no mainnet transaction was sent.

## OpenFour's Hub

OpenFour registers Hub modules and presets itself, after review: "Module registration is performed by OpenFour officials/governance. It is not a public entry point for third-party developers to call directly" (Developer Guide §17; §18 for presets), and its developer workflow forbids writing to a Registry one does not own. So the official route is a submission, not a transaction: the pack is ready in [`modules/openfour/submission/`](../../modules/openfour/submission) (`submit-pack.json` in the shape of OpenFour's `pack-submit.js`, and `tokens.json`), with this proposal, [the audit](openfour-ai-audit.md) and the screenshots. OpenFour's docs name [four.meme](https://four.meme) as the entry point for review submissions.

## Sources

- Chain reads: BSC testnet (chain 97) through BNB Chain's, ZAN's and PublicNode's public RPCs, 26–27 Nov 2026; BSC mainnet (chain 56) for the 27 Nov record, read only, 27 Nov 01:18 Bangkok.
- `modules/openfour/submission/tokens.json` (generated 27 Nov 00:52 Bangkok by `scripts/tokens-json.ts`), `modules/openfour/deployments/bsc-testnet.json`.
- OpenFour: openfour-docs at `079a45e9c3358c9f357c84f336c7d915c9f0e9fc` (Developer Guide §17–21, the developer workflow's submission list and audit guide, the Workbench, `OpenFourToken.sol`, `IOpenFourErrors.sol`, `PancakeV2MigrateLib.sol`).
