// Our OpenFour deployment on BSC testnet (chain 97) and the PLNR launch. Every
// address and transaction is copied from the repository, and
// test/markets.test.mjs holds each one to its source:
//   modules/openfour/deployments/bsc-testnet.json          the deployment, the preset, the launch
//   packages/world/src/stations/stack/integrations.json    the refused and the granted graduation, the binding

export const OPENFOUR = {
  chainId: 97,
  registry: "0x4458EdB563886b1568701A13aDFb0D3e17254e99",
  core: "0x90feAb906d1eE89611576DD6F042Bca840A94aF7",
  tools: "0x4a60f097A2f39a007bd92737B6c80aEE30992072",
  wbnb: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
  gateRecord: "0x2922c68cE15EB3e83B7f43b136e981dDc4262876",
  module: {
    tag: "module.migrate.evidence_gated",
    implementation: "0xfc2E00dCfC39C71F97Ce0e6ba9C52717Ed8fbA8e",
    beacon: "0xd57B39899b3bb33d85ACAAe705d571a1559F30C6",
    pairFactory: "0x6725F303b657a9451d8BA641348b6761A6CC7a17",
  },
  preset: { id: "1795634196178", name: "Evidence-gated Bonding V1" },
  launch: {
    name: "Grand Prix Planner",
    symbol: "PLNR",
    token: "0xB1e792b2C6Bf7Ae7A1D972af313442039422ef14",
    vault: "0xD5AfAbB7B4C97B7a46a5282Ce44d4619EB3bc300",
    migrateModule: "0xD23E368C50b8F5E8624Adfc30cdE2D4dE8E87735",
    agent: "0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8",
    pair: "0xe54cDdE2d4A28b0131C5Dc6b9E5Afb20701680Ee",
  },
  /** The launch's transactions, in the order they ran. */
  steps: [
    { id: "module", hash: "0x1cd5fca52f8af590effedca8e6d3682e1b3424626f2bcd03a2312a8e7be74e45" },
    { id: "preset", hash: "0x23aa595add67656eb2965908309467b1d4d2f35ade1a50f0dbbf39095e32a7f2" },
    { id: "create", hash: "0x875372271c9dde0ecdb3703dec11a7fd88108d68ce80bde84241ab4411ecac6f" },
    { id: "refused", hash: "0x219f25a2b86a8a73595911f40dd81f072655bd6711fdd4eb6b8108b6a733686e" },
    { id: "bind", hash: "0xd100cfa2402baaeec7de4545deedec2f72d238bbb53ec3fc34753d93718a1128" },
    { id: "graduated", hash: "0xc549f6e5a6598ba308e6ecb837cf0da2a6fa23c1d72a6e40065df4c585af5330" },
  ],
} as const;

export type StepId = (typeof OPENFOUR.steps)[number]["id"];
