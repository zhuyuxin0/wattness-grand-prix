# OpenFour discovery and encoding

This MIT package verifies OpenFour's deployed BSC testnet wiring and reproduces the struct-encoding boundary needed by custom launch modules. It uses a public client, no wallet and an allowlist of read-only RPC methods.

## OpenFour Integration

The probe reads Registry, Core, Tools, ERC1967 implementation slots, active presets, module beacons, actual implementation addresses, descriptors and schemas at one fixed block. Evidence preserves each public request/response, observation time and failure. It does not create a token or claim that a launch is complete.

## Run

From the repository root:

```sh
pnpm --filter @gatelock/openfour build
pnpm --filter @gatelock/openfour test
pnpm --filter @gatelock/openfour probe
```

The probe writes `evidence/openfour/testnet-probe.json`. To write a separate observation at an existing block, run from this package:

```sh
node dist/probe.js ../../evidence/openfour/<name>.json <block>
```

The first argument is an output path; the optional second argument is a fixed block number. The RPC is fixed to the public chain-97 endpoint. There is no send-transaction or signing path.

## Module parameter encoding

`encodeModuleParams(schema, values)` expects already-typed values in contract units, in schema order. It encodes **one tuple** to match Solidity's `abi.decode(raw, (Params))`; no parameters means `0x`.

Five tests cover dynamic string/bytes round-trip, rejection of a flat-root encoding, static-only layouts, field-count checks and empty schemas. This is an encoding utility, not a complete form validator or launch module.

## Files

- `src/probe.ts`: original read-only discovery client, chain check and RPC-method allowlist.
- `src/schema.ts`: original single-tuple module encoder/decoder.
- `test/schema.test.ts`: single-tuple encoding tests.

## Licensing

The code in this package is original MIT code. ABI shapes and addresses come from the public OpenFour interfaces and testnet deployment. No OpenFour code is vendored here.
