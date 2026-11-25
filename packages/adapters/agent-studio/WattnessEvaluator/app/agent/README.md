# WattnessEvaluator agent

The deploy codeLocation and the only key-holder for the WattnessEvaluator seller. It is configured for the BNB Chain managed platform (`[deploy].destination = "platform"`), a 48-hour testnet trial. The managed runtime ships one esbuild bundle of `src/unifiedMain.ts`, so everything the work needs is imported, including the vendored evaluator and the sealed record.

- `src/unifiedMain.ts`: the serving entrypoint. Hosted, it binds A2A on 9000 and Foundry invocations on 8088. On loopback with `--port`, it binds that port only.
- `src/evaluationWork.ts`: the work hook and the task format.
- `src/sellerCore.ts`, `src/executor.ts`: the negotiate and notify_funded skills, and background delivery.
- `src/signing.ts`: every on-chain write (quote signature, submit, settle).
- `src/agentCard.ts`: the A2A agent card.
- `scripts/vendor-evaluator.mjs`: writes `vendor/wattness-evaluator.js` from `packages/adapters/agent-studio` and `fixtures/od-20261126`. `vendor/wattness-evaluator.d.ts` is its committed interface.
- `studio.toml`: the network, wallet address, seller price, assets and storage.

The keystore and `.env.local` live in the workspace `.studio/`, outside this directory, so packaging can never include them.

    pnpm vendor        # after building the adapter in the repository
    pnpm test
    pnpm typecheck
    pnpm exec bag dev --port 15194 --host 127.0.0.1
