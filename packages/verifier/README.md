# @gatelock/verifier

Checks a committed plan with no keys: it recomputes the root, reads the record
by `eth_call`, re-derives the arithmetic from the manifest, and re-hashes every
input on the data site.

```sh
pnpm verify fixtures/od-20261126/manifest.json --network bsc-mainnet                          # the sealed day's showcase leaf, inputs fetched
pnpm verify fixtures/od-20261126/manifest.json --network bsc-testnet --battery CLO_ESR1 --no-fetch   # another leaf by its audit path
pnpm verify out/od-20261127/manifest.json --no-chain                                           # a planned day before its commit
pnpm verify fixtures/od-20261126/manifest.json --offline                                       # no chain, no fetches
```

Exit 0 when nothing failed, 1 when a check failed, 2 on a usage or I/O error.

| Check | What it recomputes |
|---|---|
| V1 | leaf = SHA-256(0x00 ‖ JCS(manifest)); RFC 6962 root over the one leaf; record.json's root; for a copy, every changed field |
| V2 | `get(key)` with key = keccak256(abi.encode(wallet, scope, od)): root, leaf count, committer, od, scope; `keyOf` agrees with the local key; whether codeHash is the manifest's source tree (`engine.tree`) |
| V3 | the gate from the DST rule and from IANA America/Chicago, the manifest's gate, the contract's `gateTs`; committedAt before it; plan time before it |
| V4 | per arm and hour: power, SOC path from the opening SOC with losses on charging, SOC bounds, closing floor, cycle cap, contract limit, hedge within the scheduled energy |
| V5 | entry prices from the entry rule, collateral, the objective from mean and CVaR; with scenarios.json, its digest and each arm's mean and CVaR over the scenarios, weighted by the weather rule when a Cournot reading was applied |
| V6 | no day in 2026-07-30..2026-09-29 among the operating day, reference, history and basis days, or any input route |
| V7 | release manifest by its pinned SHA-256, then each catalog, then each payload; release and live-tier files by path; the local mirror only for files no longer served; a Cournot response beside the record by its SHA-256, then its claim, probability, basis and receipt time against the manifest's (checked even offline) |
| V8 | the manifest's exact shape: every field, no extras, integers only; for a Cournot input, the weather rule recomputed: observed before the plan time and the gate, the market one the rule reads, the stress weight, hedge limit and contract cap from the probability, the stress bucket from scenarios.json |
| V9 | the selected arm was solved and wins by the declared rule; null arms are listed as unsolved |
| V10 | per stage, the battery's outcome rebuilt: prices re-read from the release files it cites (stated prices offline), each arm valued at them, the rebuilt document hashed as a leaf; for a fleet, that leaf's audit path from `outcomes/stage-<n>/index.json` walked to the stage root, which must be the hash `outcomeOf(key, stage)` holds, linked after the stage opened; any field that differs is named; no stage linked on chain without its file |

The LP is not re-solved: V5 checks that the committed schedule scores what the
manifest says over the committed scenarios, not that it is optimal.

## Files beside the manifest

- `scenarios.json`: `{basis_days, history_days, hub_sum4, node_cents}`, the
  matrix whose SHA-256 over its JCS form is `scenarios.digest_sha256`.
- `record.json`: how it was committed. All fields optional.

  ```json
  { "mode": "contract", "chainId": 97, "contract": "0x…", "key": "0x…", "txHash": "0x…",
    "root": "0x…", "leafCount": 1, "scopeLabel": "CLO_ESR1/da-energy" }
  ```

  `mode: "anchor"` with `txHash` reads a GATEREC1 calldata anchor instead: the
  time is proven, write-once is not, and the report says so.
- `outcome-1.json` .. `outcome-3.json`: day-ahead settled, real-time provisional,
  real-time settled (`gate-record.outcome.v1`), for a one-leaf record.
- For a day's index: `outcomes/stage-<n>/index.json` (`gate-record.outcome-index.v1`:
  the stage, the plan root, one outcome leaf per plan leaf in plan order, their
  root) and `outcomes/stage-<n>/leaves/<resource>.json`, as `pnpm outcome` writes
  them. `--battery` picks the leaf for every check, V10 included; `--outcomes DIR`
  reads the stages from elsewhere. [docs/outcomes.md](../../docs/outcomes.md)
  says how the three stages settle.
- `cournot/probability.json`, when `outside_inputs.cournot.response` names it:
  the saved probability call, looked for beside the day's index, then beside
  the leaf and its parent directory.

A manifest's `outside_inputs` is null unless the plan read Cournot before the
gate; every manifest written before that, the 26 Nov record included, has null
there and verifies as before.

The scope is `keccak256("<resource>/da-energy")` unless record.json or
`--scope` names another. The contract address comes from `--contract`,
record.json, then `contracts/deployments/<network>.json`.
