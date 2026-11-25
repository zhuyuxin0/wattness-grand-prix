# The sealed day on BNB Greenfield (testnet)

The record of operating day 2026-11-26, the one committed to GateRecord before ERCOT's day-ahead gate, stored as
public objects on BNB Greenfield testnet so anyone can fetch the leaves the root covers without this repository.

- Network: Greenfield testnet (`greenfield_5600-1`), funded from BSC testnet (chain 97). Nothing here touches mainnet.
- Bucket: `wattness-grand-prix-records`, public-read, owned by the agent wallet `0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8`.
- Layout: object names mirror `out/od-20261126/`, so the paths inside `manifest.json` (`leaves/<R>.json`,
  `leaves/<R>.scenarios.json`) resolve against the manifest's own URL.

| object | source |
|---|---|
| `od-20261126/manifest.json` | the fleet index: 316 leaves, the root, the exclusions |
| `od-20261126/leaves/<R>.json`, `<R>.scenarios.json` | each battery's leaf and its price scenarios (632 files) |
| `od-20261126/sync/<R>.json` | the data sync that pins each leaf's inputs to the Terminal's public release (316 files) |
| `od-20261126/root.hex`, `salt.txt` | the committed root (`root.txt` locally) and the salt, which is also inside every leaf |
| `od-20261126/record.bsc-mainnet.json` | the GateRecord commit on BSC mainnet (`out/od-20261126/record.json`) |
| `od-20261126/record.bsc-testnet.json` | the same root on BSC testnet (`out/od-20261126-bsc-testnet/record.json`) |

The primary SP's edge firewall answers 405 to any path ending in `root.txt`, so the root is stored as `root.hex`; the same
root is in `manifest.json` and both receipts.

The leaves and manifest are byte-identical in the mainnet and testnet output folders; the script checks that and
stores one copy.

`published.json` lists every object with its URL, size and SHA-256, and whether the bytes downloaded from the storage
provider matched the local file. `transactions.json` lists every transaction sent (the BSC testnet bridge transfer, the
bucket, and the batched object creations).

## Run

```sh
pnpm install --ignore-workspace     # this folder only; not part of the workspace
node publish.mjs status             # balances on both chains, the bucket
node publish.mjs fund --send        # if Greenfield is below 0.05 BNB: TokenHub.transferOut 0.2 tBNB from BSC testnet
node publish.mjs publish --send     # bucket, then objects (20 per transaction), then uploads to the primary SP
node publish.mjs check              # download every object, compare SHA-256, write published.json
```

Without `--send`, `fund` and `publish` simulate and send nothing. `publish` resumes: objects already on chain are
checked against the local checksums and only the missing payloads are uploaded. `--no-sync` leaves out `sync/`.

The key is `GATE_PRIVATE_KEY` in `~/Documents/wattness-secrets/bnb-bangkok.env`, read by name and never printed; the
script stops unless it derives the agent wallet's address.

The cross-chain transfer uses the BSC testnet side of the Greenfield bridge as published in
[bnb-chain/greenfield-contracts](https://github.com/bnb-chain/greenfield-contracts): `TokenHub`
`0xED8e5C546F84442219A5a987EE1D820698528E04`, value = amount + `CrossChain.relayFee()` + `CrossChain.minAckRelayFee()`.

## Check one file yourself

```sh
curl -s <url from published.json> | shasum -a 256
```

The leaf hash in `manifest.json` and the root committed on chain are checked by the verifier
(`pnpm verify`), not by this script: storage here establishes that the published bytes are the ones the record names.

Data: ERCOT, read from the Wattness Terminal's public release. Calculation: this repository.
