# Tonight: operating day 2026-11-26 on BSC testnet

The record for operating day 2026-11-26 must be on chain before ERCOT's day-ahead gate: 10:00 CT on 25 Nov, which is
23:00 Bangkok (unix 1795622400). Every time below is Bangkok; CT is Bangkok minus 13 hours tonight.

| Bangkok | CT | Cutoff |
|---|---|---|
| 21:45 | 08:45 | Contract live (deployed and the test record in). If not, take the calldata anchor path below. |
| 22:00 | 09:00 | Go/no-go: wallet funded, plan built and verified locally. |
| 22:30 | 09:30 | Commit sent and confirmed. |
| 22:45 | 09:45 | Last fallback started (anchor if the commit failed; RFC 3161 if there is no gas). |
| 23:00 | 10:00 | Gate. The contract refuses the day from this second on. |

Run every command from the repository root. Check the clock with `TZ=Asia/Bangkok date; TZ=America/Chicago date`
before each step.

## Before 21:45

**0. Clean tree.** A plan for a real chain refuses a dirty tree, because the record's codeHash is the git tree hash of
the source that planned it. Commit everything first. `out/` and `cache/` are ignored and do not count.

```
git status --porcelain        # expect: no output
```

**1. Balance.** Needs `GATE_PRIVATE_KEY` in the env file that `GATE_SECRETS_ENV` names (its default is in
`packages/core/src/secrets.ts`).

```
pnpm --filter @gatelock/contracts chain:balance
```

Expect `address 0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8` and `funded: deploy plus N commits`. Exit code 2 and
`NOT FUNDED for the deploy` means no tBNB yet. About 0.001 tBNB covers the deploy and dozens of commits at 0.1 gwei.

**2. Deploy.**

```
pnpm -r build
pnpm --filter @gatelock/contracts chain:deploy --dry-run   # estimate ~872,813 gas
pnpm --filter @gatelock/contracts chain:deploy
```

Expect `address 0x...`, `tx 0x...`, `block N at <unix> (... CT / ... Bangkok)` and
`wrote .../contracts/deployments/bsc-testnet.json`. Commit that file now (step 0 again), or the plan refuses the tree.

**3. Sourcify.**

```
pnpm --filter @gatelock/contracts chain:verify
```

Expect a match after polling. If Sourcify is slow, move on: it does not gate the record.

**4. Test record.** A throwaway commit (scope `gate-record/test`, od 20991231) proves the deployed contract accepts a
commit from this wallet.

```
pnpm commit --test --network bsc-testnet
```

Expect `gate 4102329600 (2099-12-30 10:00:00 CT ...)`, `tx 0x...`, `gas used ~189,000` and
`wrote out/test-20991231-gate-record-test/record.json`.

## 21:45 to 22:30

**5. Sync** (optional; the plan fetches what it needs and the cache is warm).

```
pnpm data:sync
```

Expect `release terminal-daily-20261124-1120 manifest 9ae88df7...` and `all SHA-256 checked`.

**6. Plan.** The fleet takes about 3 minutes warm, 6 cold; the showcase alone about 20 seconds.

```
pnpm plan --od 2026-11-26 --network bsc-testnet --fleet
```

Expect:

```
operating day 2026-11-26, gate 2026-11-25T10:00:00-06:00 (2026-11-25 23:00:00 Bangkok)
plan time     ... s before the gate
network       bsc-testnet, committer 0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8
source        tree <40 hex>, HEAD <40 hex>            # no "(dirty working tree)"
DSWL_ESS_ESR1      DSWL_BES1      arms ABC selected C
...
leaves        316 (showcase DSWL_ESS_ESR1), 23 excluded, ... s
root          0x...
wrote         .../out/od-20261126
```

On the local proof at 21:20 the fleet was 316 leaves and 23 exclusions (census rows without a size). If the fleet run
fails or is still running at 22:10, stop it and plan the showcase alone into the same directory:

```
rm -rf out/od-20261126
pnpm plan --od 2026-11-26 --network bsc-testnet
```

If `GATE_PRIVATE_KEY` is unreadable, pass the address instead: `--wallet 0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8`.

**7. Verify locally, before spending gas.**

```
pnpm verify out/od-20261126/manifest.json --no-chain
python3 -I tools/verify_hash.py out/od-20261126/manifest.json --expect "$(cat out/od-20261126/root.txt)"
```

Expect V1 and V4 to V9 PASS, V2 and V3 SKIP (no chain read), `VERIFIED (3 skipped)`; Python prints `leaves 316`,
the root, `MATCH`.

**8. Commit.**

```
pnpm commit --od 2026-11-26 --network bsc-testnet --dry-run
pnpm commit --od 2026-11-26 --network bsc-testnet
```

The dry run prints the scope (`gate-record/ercot-da-energy`), root, leaf count, codeHash (the tree hash followed by
24 zeros), key, the gate with seconds left, and the gas estimate (~172,000). A refusal prints the contract's own
error: `AfterGate(20261126, 1795622400)` past the gate, `AlreadyCommitted(key)` for a second try. Then expect
`tx 0x...`, `block N at ... , S s before the gate` and `wrote out/od-20261126/record.json`.

**9. Verify on chain.**

```
pnpm verify out/od-20261126/manifest.json --network bsc-testnet
pnpm verify out/od-20261126/manifest.json --network bsc-testnet --battery CLO_ESR1 --no-fetch
```

Expect V1 to V9 PASS, V10 SKIP (no outcomes yet), `VERIFIED (1 skipped)`. V2 names the key, the contract and
`codeHash is source tree <tree>`; V3 gives the seconds before the gate; V7 hashes about 520 files against the release.
The second command checks one battery's leaf by its Merkle proof (`audit path of 9 hashes` for 316 leaves).

If wattness.tech answers 429, the verifier backs off and retries; `--no-fetch` skips V7 for a quick check.

## Fallback A: calldata anchor (contract not live by 21:45, or the commit fails)

A zero-value transaction to self carrying `GATEREC1 || chainId || od || root`. It proves the time, not write-once.
Plan as in step 6 first, then:

```
pnpm --filter @gatelock/contracts chain:anchor --od 20261126 --dir out/od-20261126 --network bsc-testnet --dry-run
pnpm --filter @gatelock/contracts chain:anchor --od 20261126 --dir out/od-20261126 --network bsc-testnet
pnpm verify out/od-20261126/manifest.json --network bsc-testnet
```

Expect `tx 0x...`, `block N at ...` and `wrote out/od-20261126/record.json` (`mode: "anchor"`); the verifier's V2 notes
that an anchor proves time, not write-once.

## Fallback B: RFC 3161 timestamp (no gas at all)

Only the 32-byte root leaves the machine.

```
scripts/timestamp/stamp.sh out/od-20261126/manifest.json digicert
scripts/timestamp/stamp.sh out/od-20261126/manifest.json freetsa
scripts/timestamp/verify.sh out/od-20261126/manifest.json out/od-20261126/digicert.tsr out/od-20261126/digicert.tsq
```

Expect the root, the signer, the stamp in CT and `... s before the gate at unix 1795622400`.

## Proof on a local node

`scripts/local-proof.sh` runs the whole path on a throwaway Hardhat node at 127.0.0.1:15191 and stops it after:
deploy, the test record, a plan, the commit, verify PASS (the day, and one battery by its proof), a modified copy
rejected with its diff, two replays giving the same root and the committed leaf, Python's root equal to
TypeScript's, and a commit after the gate refused with `AfterGate`. Add `--fleet` for every battery. Local plans and
records go under `out/local/`, apart from the real record.
