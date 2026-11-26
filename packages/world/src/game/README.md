# ONE PLAN, playable

The Arena's cabinet as a game on Desert Willow's sealed day: turn the schedule dial, drag glass onto hours, and score
the plan with the planner's own objective over the 301 sealed scenarios. "Seal my plan" commits it from the visitor's
own wallet to GateRecord on BSC testnet before the day's gate. The cabinet is the storyboard's (`../stations/game`);
this folder makes it live.

```ts
import { mountOnePlan } from './game';

const game = mountOnePlan(el, {
  theme: 'light',          // the site's theme: the deck under the stage follows it; the stage holds dark
  mode: 'play',            // 'play' (Markets tab: deck under the stage) or 'story' (the "your turn" beat: controls over it)
  onSeal: (receipt) => {}, // once a seal is mined and its Committed event read back
  data,                    // frame data with showcase, game and sealed_day; src/data/frame-data.json when absent
  // ethereum, codeHash, plan, now, dpr, camera, still: see OnePlanOptions in index.ts
});
await game.ready;
game.setPlan({ step: 20, glass });   // the dial's detent (0 = A ... 20 = C) and whole contracts an hour, sold positive
game.played().score.objective;       // micro-USD, the planner's objective for the plan the page holds
game.dispose();
```

## The rules it plays by

- **The dial** blends the price-chasing schedule (arm A) into the co-optimized one (arm C) in 21 detents:
  kW = round(((20 − i) A + i C) / 20) an hour, halves away from zero. A and C never move energy opposite ways in an
  hour, so every limit is linear along the dial; `scheduleLimits` checks the state of charge, power, the closing floor
  and the cycle cap on every change, and the tests check every detent against the engine's `checkLimits`.
- **The glass** goes only on hours where the battery moves energy: sold where the schedule discharges, bought where it
  charges, whole contracts from 0 to the hour's cap (100, or the scheduled MWh if lower). Turning the dial under placed
  glass can leave more glass than the schedule delivers: the light shows it, the score counts the glass that fits, and
  the plan cannot be sealed until the glass is fitted.
- **The score** is `floor(mean − 0.5 × CVaR90)` of the day totals, in integer micro-USD, as the engine's `evaluate`
  computes it. Each scenario's total is linear in the controls: per-hour unit values (node price × 10 a kW, and
  (4 × entry − hub_sum4) × 2,500 a contract) are computed once, so a change re-scores 301 × 24 products.
- **Beating the planner** is possible: the sealed C was solved in continuous kW and contracts and then rounded, and
  whole contracts on C's schedule (HE06 14, HE08 34, HE10 −17, HE11 −71, HE12 −100, HE13 −14, HE18 95) score $3,749.00
  against its $3,746.80. The read-out says so in the planner's own figures.

## Seal my plan

One leaf, one record: the plan becomes a `gate-record.arena-plan.v1` document (RFC 8785 canonical JSON, integers only:
the field it was played on, the schedule and contracts, the dial step, the score, the committer and a salt). Its leaf
hash, SHA-256(0x00 ‖ JCS), is the one-leaf tree's root, committed with
`commit(scope, od, root, 1, codeHash)` under `gate-record/arena/one-plan/<resource>`: one record per wallet, battery
and operating day. The page refuses any chain but 97 (it asks the wallet to switch or add the testnet, and reads the
chain again right before it sends), refuses after the day's gate by its own clock and the chain's, reads an existing
record first, names the contract's refusals (AfterGate, AlreadyCommitted), and never holds or asks for a key. With no
wallet it shows how to add BSC testnet and where to get test BNB. Nov 26's gate has passed, so that field plays as
practice; a field whose gate is still ahead seals.

## Files

```
index.ts         mountOnePlan: the stage, the cabinet, the loop, the controls and the seal
model.ts         the field, the dial's schedule, caps, limits, the exact scorer
hash.ts          RFC 8785 canonical JSON, SHA-256, Keccak-256
chain.ts         GateRecord's address, calls, errors, event and keys; BSC testnet; the gate's clock
leaf.ts          the arena leaf and its record
wallet.ts        the EIP-1193 seal flow
ui.ts, game.css  the dial, the rack, the read-out, the seal panel
play.html, .ts   the game on its own page (?mode=, theme=, dial=, glass=, select=, still=, now=, cam=)
shots.mjs        stills into storyboard/game
*.test.mjs       vitest: the scorer against the engine and the sealed record, the hashes and calls against core and
                 viem, the seal flow against a scripted wallet
play.check.mjs   the game played in headless Chrome, sealing against a scripted wallet
```

```sh
node_modules/.bin/vitest run --config packages/world/src/game/vitest.config.mjs   # from the repository root
sh scripts/serve.sh 15192                                                          # from packages/world
node src/game/play.check.mjs --port 15192
node src/game/shots.mjs --port 15192 --out storyboard/game --scale 2
sh scripts/stop.sh 15192
```
