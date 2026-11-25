# Season launch on Flap Pool Launch

A Launcher and Vault pair for Flap's Pool Launch Portal that launches the season token only once a named plan has been sealed in GateRecord before its day-ahead gate. If that hasn't happened by the deadline, every contribution can be refunded. The season token's working name is PRIX; it is a placeholder.

## How a season works

1. **Create.** `Portal.newLauncher(SeasonLauncherFactory, abi.encode(SeasonConfig))` deploys a `SeasonLauncher`. The Launcher pays the salt-lock fee and locks its own salt, so the token address ends in 7777.
2. **Contribute.** Contributors approve the quote token (test USD on chain 97) and call `contributeQuote(amount)`. Each wallet has a cap, and so does the round as a whole. A contributor may first call `back(agent)` to name the GateRecord committer whose records weight their earned share. By default that is the contributor's own address.
3. **Launch or refund.** Before the deadline, anyone may call `launch()` once the raise reaches `minRaise` and GateRecord holds the milestone record: the committer's entry for `milestoneOd` under `scope`, sealed before that day's gate and, with `milestoneStage` 1 to 3, with that outcome stage linked. After the deadline an unlaunched round only refunds, through `refund()`.
4. **Launch.** `launch()` calls `launchTaxTokenV2`. All contributions seed the V2 pool against half the supply. The other half, the reserve, comes back to the Launcher through `initializeDistribution`. The tax is 3% on each side, split 80% to the season vault and 20% burned.
5. **Claim.** `claim()` on the Launcher pays each contributor's share of the contributor part of the reserve, pro rata to their deposit.
6. **Earn.** The `SeasonVault` holds the earned part of the reserve (`earnedBps`) and takes the vault share of the tax in the quote token. It credits the tax by balance delta, up to `rewardCap`, and passes anything above the cap to the creator. `claim()` on the vault pays each contributor's deposit share times the fraction of season days on which their backed agent sealed a plan before the gate. The vault reads that from GateRecord at the time of the claim. The share not earned stays in the vault.

The contribution, the earned pool and the tax receipts are accounted for separately. A larger tax top-up is never promised: the pool takes what arrives, up to its cap. A token's price says nothing about an agent's plans. A sealed record shows that a plan was committed before the gate, not how good it was.

## Contracts

| Contract | Role |
|---|---|
| `SeasonLauncherFactory` | Launcher factory (`lf-v1`). It deploys its paired `SeasonVaultFactory` and a `SeasonLauncherDeployer`, and validates every `SeasonConfig`. |
| `SeasonLauncher` | The contribution round. It is the Portal's distribution strategy for the reserve. |
| `SeasonVaultFactory` | Vault factory (`pl-v1`). It makes one `SeasonVault`, only for a launching Launcher of its own factory. |
| `SeasonVault` | The earned pool. It reads GateRecord for each claim. |
| `FlapPoolLaunch.sol` | The Pool Launch types and Portal interfaces the contracts use. |
| `SeasonLib.sol` | GateRecord reads, transfers and the JSON text helpers. |

`taxRoute` 0 sends the vault share through the Portal's VAULT fee slot. `taxRoute` 1 sends it through a MARKETING slot to the same vault, which the Launcher opens just before the launch. Nothing can upgrade the Launchers or the vaults.

## On BSC testnet (97)

| | Address |
|---|---|
| Pool Launch Portal | `0x000042108465206185A077Edc3F3fd2b49060000` |
| GateRecord | `0x2922c68cE15EB3e83B7f43b136e981dDc4262876` |
| Quote token (faucet test USD, 18 decimals) | `0x190C989D5665a0e404B444b53CAE9AbCfb600157` |
| SeasonLauncherFactory | `0xdeee6A7E242983Da85B8EBe2Cfb5b79156344082` |
| SeasonVaultFactory | `0x3e7132f6D59EAD6c778C8Bd5274F399d5637dCB1` |
| Season round (launched) | `0x627A6C606d87d31121e5201bFf999695D3C70D59` |
| PRIX | `0xcCdA7b7B6cF49208a3E751e56c98cb34202e7777` |
| PRIX/USD pool | `0x510D53EFdAdEec8299D7328867Ddc6f815cbEA6B` |
| SeasonVault | `0x44c5AFF0812bCe6b53c17910a3427ceB0955f70a` |
| Refund round | `0x2db8Fb4B03229af56Dc1D5c30678f1693733D44C` |

The same addresses are in `SEASON_TESTNET` in `@gatelock/flap`. The season round's milestone is the Wattness agent's sealed record for operating day 26 Nov 2026. Its season days are 26 and 27 Nov.

## Build and test

From the repository root:

```sh
pnpm --filter @gatelock/flap build
pnpm --filter @gatelock/flap-season build
pnpm --filter @gatelock/flap-season test
pnpm --filter @gatelock/flap-season typecheck
```

The tests run against a stand-in Portal that follows the same call order (vault factory, token, pool, reserve) and against the workspace's real GateRecord contract.

## Run a season on testnet

`scripts/season.ts` runs one step per call. It signs with `FLAP_TESTNET_PRIVATE_KEY` from the secrets file (read through `loadSecrets`), and it checks that both RPC endpoints answer for chain 97 before it reads the key. Every transaction is simulated first, and its hash is written before the receipt is awaited. The step log and the addresses go to the directory you name. Keep that directory outside the repository.

```sh
cd modules/flap
node scripts/season.ts deploy     --evidence <dir>
node scripts/season.ts whitelist  --evidence <dir>   # the testnet helper enables the factory
node scripts/season.ts mint       --evidence <dir>   # 1,000 test USD, as the faucet mints
node scripts/season.ts create     --evidence <dir> [--label refund]
node scripts/season.ts back       --evidence <dir>
node scripts/season.ts contribute --evidence <dir> [--label refund]
node scripts/season.ts try-launch --evidence <dir> [--label refund]
node scripts/season.ts launch     --evidence <dir>
node scripts/season.ts claim      --evidence <dir>
node scripts/season.ts trade      --evidence <dir>   # a buy and a sell on the pool
node scripts/season.ts sync       --evidence <dir>
node scripts/season.ts earn       --evidence <dir>
node scripts/season.ts refund     --evidence <dir> --label refund
node scripts/season.ts read       --evidence <dir> [--label refund]
```

A `refund` round closes four minutes after `create`, and its milestone is a day that will not be sealed in that time.

## Sources and license

The Pool Launch types and interfaces follow the Portal's interfaces published in [flap-sh/FlapPoolLaunchVaultExample](https://github.com/flap-sh/FlapPoolLaunchVaultExample) at `29334f6` (MIT). The contracts here are original. MIT, see `LICENSE`.
