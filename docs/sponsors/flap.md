# Flap: a season that launches only on a sealed plan

<!-- MEDIA: video-flap -->

Built on Flap's Pool Launch Portal through our own Launcher Factory, on BSC testnet. A season round launches its token only once GateRecord holds a named agent's plan for a named day, sealed before that day's gate; a round that has not launched by its deadline only refunds. Round 3 [launched](https://testnet.bscscan.com/tx/0x4881264736e39903dd28eadd23602d8d710c558055be4f2f74db9d5eeb872429) on BSC testnet at 08:12:32 CT on Nov 26 (21:12:32 Bangkok), 2 min 16 s after the Nov 27 record it waited for. The season token, PRIX, is a testnet placeholder.

Code: [`modules/flap`](../../modules/flap) (the contracts and the season runner) and [`packages/adapters/flap`](../../packages/adapters/flap) (the read clients). Launch UI: the Wattness Season Mini App, built from Flap's vault component template and [open on Flap's host](https://utter.cash/apps/wattness-season?artifactPath=vaultui_wattness-season_01M8B7TYBFEQE0QK4PP4DFY5E6%2Fv20261126132700625_wattness-season_b2e5ede52980&lang=en), and the [Season Token tab](https://gp.wattness.tech/markets/season), which reads the rounds live from BSC testnet.

## How the launch mechanism works

1. **Create.** `Portal.newLauncher(SeasonLauncherFactory, config)` deploys a `SeasonLauncher`, one round. The factory is enabled on Flap's testnet Portal through its testnet helper. The Launcher pays the salt-lock fee and locks its own salt, so the token's address ends in 7777.
2. **Contribute.** Contributors approve test USD and call `contributeQuote(amount)`, within a cap per wallet and one for the round. A contributor may first call `back(agent)` to name the GateRecord committer whose record weights their earned share.
3. **Launch or refund.** Before the deadline, anyone may call `launch()` once the raise reaches its minimum and GateRecord holds the milestone: the named committer's record for the milestone day under the round's scope, committed before that day's gate (and, if the round asks for one, with that outcome stage linked). After the deadline, a round that has not launched only refunds.
4. **Launch.** `launch()` calls the Portal's `launchTaxTokenV2`. Every contribution seeds the V2 pool against half the supply, and the other half, the reserve, comes back to the Launcher. The token carries a 3% tax on buys and on sells for its first 30 days. Flap's protocol fee, 10% of the tax, comes off first; of the rest, 80% goes to the season vault and 20% is burned, so 72% of the tax reaches the vault.
5. **Claim and earn.** Each contributor claims a share of the reserve in proportion to their deposit. The `SeasonVault` holds the earned part of the reserve and the tax it receives up to the round's reward cap (100 test USD; tax above the cap goes to the round's creator), and pays each contributor their deposit share times the fraction of season days on which their backed agent sealed a plan before the gate. It reads that from GateRecord at the time of each claim.

The contribution, the earned pool and the tax are accounted for separately, and nothing can upgrade the Launchers or the vaults. A token's price says nothing about an agent's plans: a sealed record shows that a plan was committed before the gate, not how good it was.

## The problem

A token launch waits only for money. Once a raise is full, the token launches and pays out whether or not the project behind it has done anything, so backers have nothing to hold the launch to. For an agent that plans batteries, the work is checkable on chain: either its plan for a day was sealed before the market's gate, or it was not.

## The audience

People who back an agent and want their stake tied to what the agent does; agent builders who want a launch that waits for evidence of the work, not for attention.

## What makes it distinctive

- **The launch condition is evidence of conduct, read on chain.** `launch()` reads the agent's record from GateRecord, keyed by the committer, the scope and the day, and GateRecord itself computes the gate the record had to beat. Once the raise and the record are in place, anyone may launch: no oracle reports the condition and no admin key grants it.
- **The payout follows the record, day by day, not the price.** A contributor's earned share grows with each season day on which their agent sealed in time.
- **A missed milestone has a clean exit.** The round refunds every deposit.
- **The same record serves every market.** The Grand Prix's verifier, the OpenFour graduation and this launch all read one GateRecord entry.

## On BSC testnet (chain 97)

| | Address |
|---|---|
| Pool Launch Portal (Flap) | `0x000042108465206185A077Edc3F3fd2b49060000` |
| SeasonLauncherFactory | `0xdeee6A7E242983Da85B8EBe2Cfb5b79156344082` |
| SeasonVaultFactory | `0x3e7132f6D59EAD6c778C8Bd5274F399d5637dCB1` |
| GateRecord | `0x2922c68cE15EB3e83B7f43b136e981dDc4262876` |
| Quote token (test USD) | `0x190C989D5665a0e404B444b53CAE9AbCfb600157` |
| Round 3 Launcher | `0x4C3fBa949C25d1511b786A24Bd0Bcb6028D8dBd9` |
| Round 3 token (PRIX, testnet placeholder) | `0xd8cDe23884594B31B6B553DAa4B22A68A78F7777` |
| Round 3 pool | `0x6181FB3Ca39eA4f856e7b180A9a535397bE583aC` |
| Round 3 vault | `0xc58cF0103C4d54AA21Fa4f522abFf05f3ca8d004` |
| Round 1 Launcher | `0x627A6C606d87d31121e5201bFf999695D3C70D59` |
| Round 1 token (PRIX, testnet placeholder), pool, vault | `0xcCdA7b7B6cF49208a3E751e56c98cb34202e7777`, `0x510D53EFdAdEec8299D7328867Ddc6f815cbEA6B`, `0x44c5AFF0812bCe6b53c17910a3427ceB0955f70a` |
| Refund round | `0x2db8Fb4B03229af56Dc1D5c30678f1693733D44C` |

## The launches

| What | Transaction | When (CT) |
|---|---|---|
| Factory deployed | [`0xad389c4c…`](https://testnet.bscscan.com/tx/0xad389c4c3ede2eb46a7712d85d0757c41d8528e2ffcf26607c57d37e6d896bc0) | Nov 25, 12:57:48 |
| Factory enabled through Flap's testnet helper | [`0x9084f63c…`](https://testnet.bscscan.com/tx/0x9084f63cad7e1d964abd88467a77e79a739b179469963e09ae4592df2de1a3fa) | Nov 25, 12:58:02 |
| Round 1 launched, its milestone the Nov 26 record | [`0x34439fa4…`](https://testnet.bscscan.com/tx/0x34439fa4200a28a54678b1493900f4fee0ee294540ff2e27b40cebbeaea3c084) | Nov 25, 12:59:28 |
| Round 1's vault paid by sealed days | [`0x41a1ed51…`](https://testnet.bscscan.com/tx/0x41a1ed514a49dd993fd946b69d97ad310a007269c1d9afdce21aa3b518c4ec3d) (reserve), [`0x1528a6d4…`](https://testnet.bscscan.com/tx/0x1528a6d4f59aeeb3fead543bf6c49487b6c4ccf12c8e280ff36048b34df5750f) (tax) | Nov 25, 13:00:29 and 13:05:56 |
| A round whose milestone was not sealed in time, refunded | [`0xe5f8fe07…`](https://testnet.bscscan.com/tx/0xe5f8fe075565845a46985a6e29c2540e6f8b9a579b57b115a5419ece21932df8) | Nov 25, 13:03:54 |
| Round 3 created, its milestone the Nov 27 record | [`0xb966c3f0…`](https://testnet.bscscan.com/tx/0xb966c3f007b6d46424cb5451ab0b65b0411c9a50035d823be752b90d694cd0c9) | Nov 26, 00:12:03 |
| The Nov 27 record committed on BSC testnet | [`0x1ff8d7d8…`](https://testnet.bscscan.com/tx/0x1ff8d7d8bceae913d50508600cd4304d4284930f8137d8f49348fee7f3a5d267) | Nov 26, 08:10:16 |
| Round 3 launched | [`0x48812647…`](https://testnet.bscscan.com/tx/0x4881264736e39903dd28eadd23602d8d710c558055be4f2f74db9d5eeb872429) | Nov 26, 08:12:32 (21:12:32 Bangkok) |

## Build and test

From the repository root:

```sh
pnpm --filter @gatelock/flap build
pnpm --filter @gatelock/flap-season build
pnpm --filter @gatelock/flap-season test
```

The tests run against a stand-in Portal that follows the Portal's call order and against the workspace's real GateRecord. `modules/flap/scripts/season.ts` runs a season on BSC testnet one step at a time ([its README](../../modules/flap/README.md)).
