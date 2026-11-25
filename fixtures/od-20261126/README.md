# Operating day 2026-11-26, as sealed

The record committed before ERCOT's day-ahead gate on 25 Nov 2026, kept here as a fixture that tests and adapters build against.

- `manifest.json`: the fleet index (316 leaves in resource order, the root, the exclusions).
- `leaves/`: two of the 316 leaves, the showcase DSWL_ESS_ESR1 and CLO_ESR1, each with its scenarios. Every other leaf is in the published record.
- `record.bsc-mainnet.json`: the GateRecord commit on BSC mainnet (chain 56).
- `record.bsc-testnet.json`: the same root committed on BSC testnet (chain 97), so testnet contracts can read it.

Data: ERCOT, read from the Wattness Terminal's public release. Calculation: this repository.
