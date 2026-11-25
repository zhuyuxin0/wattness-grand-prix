# contracts

`GateRecord` holds write-once commitments to an ERCOT operating day's plan. A
commit is refused at or after that day's day-ahead gate, 10:00 Central on the
day before, which the contract computes itself from `od` (YYYYMMDD).

## Contract

| Call | Behavior |
|---|---|
| `commit(scope, od, root, leafCount, codeHash)` | Stores the record under `keccak256(abi.encode(msg.sender, scope, od))` and appends the key to the sender's index. Reverts `AfterGate(od, gate)` when `block.timestamp >= gateTs(od)`, `AlreadyCommitted(key)` on a second write, `EmptyRecord` for a zero root or zero leaves, `InvalidDay(od)` for a date that does not exist or is before 2007. |
| `linkOutcome(key, stage, outcomeHash)` | Committer only, once per stage. Stage 1 (day-ahead settled) opens at the gate; stages 2 and 3 (real-time provisional and settled) open at `dayEndTs(od)`. |
| `get(key)` | The record; `committer` is zero when none exists. |
| `outcomeOf(key, stage)` | `{hash, linkedAt}`; `linkedAt` is zero until linked. |
| `keyOf`, `countOf`, `keyAt` | Key derivation and the per-committer index. |
| `gateTs(od)`, `dayEndTs(od)` | Gate and end of the operating day, Unix seconds. |

Central time is CDT (UTC−5) from the second Sunday in March to the first Sunday
in November and CST (UTC−6) otherwise. The tests pin the gate against
`America/Chicago` for every day from 2026 through 2040.

Readers should use `eth_call`: the public BSC testnet RPC refuses `eth_getLogs`.
`abi/GateRecord.json` is the ABI for packages that do not build Hardhat; a test
fails if it drifts from the artifact (`pnpm abi` rewrites it).

Measured locally: deploy 864,782 gas, first commit per wallet 189,271, later
commits 172,171.

## Scripts

All take `--network bsc-testnet` (default) or `--network localhost`, and
`--rpc <url>` to try one endpoint before the public list. The key comes from
`GATE_PRIVATE_KEY` in the file named by `GATE_SECRETS_ENV`.

```sh
pnpm chain:balance [--address 0x…]      # balance, nonce, deploy and commit cost; exit 2 if unfunded
pnpm chain:deploy [--dry-run] [--force]  # writes deployments/<network>.json
pnpm chain:verify                        # Sourcify, from deployments/<network>.json
pnpm chain:anchor --od YYYYMMDD --root 0x… [--dry-run]
```

`chain:deploy` refuses to deploy again while the recorded address has code. It
checks that the runtime code on chain equals the artifact's before writing the
deployment file. `chain:verify` needs the same build (`buildInfoId` in the
deployment file).

### Calldata anchor

The fallback when no contract is available: a zero-value transaction from the
committer to itself whose data is 52 bytes,

```
"GATEREC1" (8) | chain id, uint64 (8) | od, uint32 (4) | root (32)
```

It fixes the root at the block's time but does not enforce the gate or
write-once, so a verifier must say which it read.

### Local run

```sh
npx hardhat node --port 15191
GATE_SECRETS_ENV=/path/to/test.env pnpm chain:deploy --network localhost
```
