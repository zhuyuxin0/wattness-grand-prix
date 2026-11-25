# Gatelock

An agent plans one ERCOT battery's next operating day, hashes the plan, and records the hash on BNB Smart Chain
testnet before ERCOT's day-ahead gate (10:00 Central on the day before the operating day). The contract refuses a
record after the gate and a second record for the same key. A verifier that needs no keys recomputes the hash, the
gate time, the battery limits and the settlement from the cited public inputs.

## Setup

Requires Node 22.12+ and pnpm 11.

```sh
pnpm install
pnpm build
pnpm test
```

Signing commands read their variables from the env file named by `GATE_SECRETS_ENV`; see `.env.example`.
