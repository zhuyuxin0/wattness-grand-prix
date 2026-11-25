# Flap Integration

An original MIT, read-only preflight adapter for Flap **Pool Launch** on BSC Testnet. It reads the live quote registry, Launcher-factory enablement, creation pause, salt-lock fee and graduation lens at a pinned block. It calculates a conservative funding requirement with explicit token decimals and separates native launch payment from ERC20 approval and the salt-lock fee.

From the workspace root:

```sh
pnpm --filter @gatelock/flap build
pnpm --filter @gatelock/flap typecheck
pnpm --filter @gatelock/flap test
pnpm --filter @gatelock/flap probe
```

The probe uses a public chain-97 RPC, needs no key and writes `evidence/flap/live-read.json`. It has no wallet, signing or transaction-submission method. All contract calls in an observation use the same block. The response retains that block's number, hash and timestamp; unrelated block transactions are omitted.

## Use

```ts
import { previewLaunch, readPortalSnapshot, ZERO, WAD } from '@gatelock/flap';

const snapshot = await readPortalSnapshot(rpcRead, deployedFactory, ZERO);
const preview = previewLaunch(97, snapshot.quote, snapshot.factory, {
  totalSupply: 1_000_000_000n * WAD,
  poolToken: 500_000_000n * WAD,
  poolQuote: 3n * WAD,
  creatorBuyQuote: 0n,
});
```

`previewLaunch` rejects disabled quote pairs, disabled Launcher factories, unsupported chains and invalid allocations. The optional enabled Vault state takes precedence over the Launcher multiplier, following the current indexer guide. Its rational floors round upward as a conservative estimate. **The on-chain lens is authoritative**, especially for fractional shares and effective factory selection.

For an actual recorded Launcher, use `readGraduationLens(rpcRead, snapshot, params, launcher)`. It checks that `getLauncher` links the instance to the pinned factory, then calls `graduationFloorV2ForLauncher`. The generic lens excludes Launcher discounts and does not establish launch permission. A full preflight still needs factory-specific restrictions, token configuration, reserve distribution, the salt and all launch parameters validated by the contracts.

`assertLaunchPayment` enforces exact native launch value or sufficient ERC20 Portal allowance. The salt-lock creation fee is **not** included in the subsequent launch payment. No function establishes battery control, validates a trading edge or attributes competence to a token price.
