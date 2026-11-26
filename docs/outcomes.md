# Outcomes: how a sealed plan settles

A plan is sealed before ERCOT's day-ahead gate, 10:00 CT on the day before the operating day. Nothing in it can
change after that. What comes later is its outcome: the same plan valued at the prices ERCOT then publishes. The
outcome is linked to the same GateRecord entry in up to three stages, one hash per stage, with
`linkOutcome(key, stage, root)`. The contract takes a stage only from the record's committer, only once, and not
before the stage opens.

## The three stages

| Stage | Name | Opens | Prices |
|---|---|---|---|
| 1 | day-ahead settled | at the gate | the day-ahead SPP at each battery's settlement point (NP4-190-CD), from the Terminal's release |
| 2 | real-time provisional | when the operating day ends, 00:00 CT | the same day-ahead prices; each hub's 15-minute prices rebuilt from the day's SCED runs on the live tier |
| 3 | real-time settled | when the operating day ends | the same day-ahead prices; ERCOT's first-published real-time 15-minute SPPs at the hub (NP6-905-CD) |

In plain words:

- **Stage 1.** The day-ahead market has cleared, so the energy leg is known. Each schedule is a day-ahead
  schedule at its own node, so each hour's energy is paid or charged at that node's day-ahead price. The hedge
  cannot settle yet: it settles on real-time hub prices, which do not exist until the day runs. An arm that
  holds contracts therefore shows its energy, wear and fees, and its hedge and net as pending (null). Arm A,
  which holds none, has its net.
- **Stage 2.** Once the day has run, the live tier holds every SCED run. Each 15-minute interval's hub price is
  the time-weighted mean of the runs in effect during it, rounded to the cent. The hedge settles on those
  prices, provisionally, and every arm has a net.
- **Stage 3.** When the release holds ERCOT's first-published real-time prices for every interval of the day,
  the hedge settles on them. This is the figure the instrument's own rule names.

Each arm is valued the same way at every stage:

- energy: each hour's kW at the node's day-ahead price, positive when discharging;
- wear: the discharged energy at the assumed wear rate;
- fees: the contracts traded at the fee per contract;
- hedge: per hour, contracts × (entry − settlement), where the settlement is the mean of the hour's four 15-minute
  hub prices clipped to the contract's floor and ceiling, and the entry is the assumed fair value the plan states;
- net = energy − wear + hedge − fees.

Amounts are whole micro-dollars, computed in integers. The hedge marked at the hub's day-ahead price is reported
beside the result in `summary.json` and never added to it.

## What a stage writes

Beside the planned day and its `record.json`:

```
out/od-YYYYMMDD/
  manifest.json                   the plan's fleet index
  record.json                     the commit
  outcomes/stage-1/
    leaves/<resource>.json        one gate-record.outcome.v1 per battery
    index.json                    gate-record.outcome-index.v1
    summary.json                  each battery's arms in dollars, for reading
    link.<network>.json           the linkOutcome transaction, once sent
```

`index.json` holds the stage, the plan root it settles, one outcome leaf per plan leaf in the plan's order
(each with the plan leaf it settles and its document), and their RFC 6962 root. Outcome leaf i settles plan leaf
i, so one audit path shape serves both trees. Leaves are hashed as the plan's are: SHA-256 of 0x00 and the
document's JCS form. Each document cites the release files its prices came from, by route and SHA-256.

## How anyone checks one battery (V10)

1. Read the battery's outcome document and the stage's index.
2. Rebuild the document: read the price files it cites from the release (each file's SHA-256 must match both the
   citation and the release's catalog), take the stage's prices from them, and value every arm with the formula
   above. Offline, the prices the document states are used, and the report says so. At stage 2 the provisional
   hub prices are taken as stated, with the method in `index.json` (`rt_rule`) and their live-tier files hashed
   by V7.
3. Hash the rebuilt document as a leaf, walk the audit path the index's leaves give up to the outcome root, and
   compare that root with the one `outcomeOf(key, stage)` holds. The link must be no earlier than the stage's
   opening.
4. Any value that differs is named: `prices.da_node_cents[18] 13350, published 3450`, or
   `arm C: energy_uusd 2625780000, recomputed 2624780000`.

```
pnpm verify out/od-20261126/manifest.json --network bsc-mainnet                       # the showcase battery
pnpm verify out/od-20261126/manifest.json --network bsc-mainnet --battery CLO_ESR1    # any other
pnpm verify out/od-20261126/manifest.json --no-chain                                  # before the link
```

A stage linked on chain whose files are not given fails V10: a verifier cannot pass a record whose committer
has linked an outcome nobody can read.

## Linking a stage

Run from the repository root, with the planned day in `out/od-YYYYMMDD`. Check the clock first with
`TZ=America/Chicago date; TZ=Asia/Bangkok date`.

1. **Dry run.** The default: it reads the record on chain, reads the release `release.json` selects now, writes
   the stage's documents and simulates `linkOutcome`. Exit 3 means the release does not hold the stage's prices
   yet; nothing is written and nothing is sent.

   ```
   pnpm outcome --od 2026-11-26 --stage 1 --network bsc-mainnet --mainnet
   ```

2. **Checks.** V10 on a few batteries with their prices re-read, then every battery offline.

   ```
   ROOT=$(jq -r .root out/od-20261126/outcomes/stage-1/index.json)     # the root the dry run printed
   pnpm verify out/od-20261126/manifest.json --no-chain
   pnpm verify out/od-20261126/manifest.json --no-chain --battery CLO_ESR1
   for r in $(jq -r '.leaves[].resource' out/od-20261126/manifest.json); do
     node packages/verifier/dist/cli.js out/od-20261126/manifest.json --offline --battery "$r" | tail -1
   done | sort | uniq -c                                                # 316 VERIFIED (3 skipped)
   ```

3. **Send**, after review, at the reviewed root. A run whose documents give any other root, for instance because
   a newer release was published in between, writes and sends nothing. On BSC mainnet `--root` is required.

   ```
   pnpm outcome --od 2026-11-26 --stage 1 --network bsc-mainnet --mainnet --send --root "$ROOT"
   ```

4. **Verify on chain.**

   ```
   pnpm verify out/od-20261126/manifest.json --network bsc-mainnet
   ```

   Expect V1 to V10 PASS, V10 naming the linked root and its time in CT and Bangkok.

Stages 2 and 3 run the same way after the day ends, with `--stage 2` or `--stage 3`.
