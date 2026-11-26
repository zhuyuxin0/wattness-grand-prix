// The Flap season on BSC testnet (chain 97). Every address and transaction here
// is copied from the repository, and test/markets.test.mjs holds each one to
// its source:
//   packages/adapters/flap/src/season.ts       SEASON_TESTNET, TOKEN_IMPL
//   modules/flap/README.md                     the same table
//   packages/world/src/stations/stack/integrations.json   the launch and the vault claim
//   contracts/deployments/agents.bsc-testnet.json         the committer and the scope
// Round 3 is the factory's third round; the page reads its record from Flap's
// Portal on every load and shows it only under the season's launcher factory.

export const SEASON = {
  chainId: 97,
  portal: "0x000042108465206185A077Edc3F3fd2b49060000",
  gateRecord: "0x2922c68cE15EB3e83B7f43b136e981dDc4262876",
  quoteToken: "0x190C989D5665a0e404B444b53CAE9AbCfb600157",
  launcherFactory: "0xdeee6A7E242983Da85B8EBe2Cfb5b79156344082",
  vaultFactory: "0x3e7132f6D59EAD6c778C8Bd5274F399d5637dCB1",
  /** The tax token implementation the Portal clones; a launch's token is CREATE2(clone, salt, Portal). */
  tokenImpl: "0x7777c57ff7dc441c1715b2e36fa581c48B782222",
  launched: {
    launcher: "0x627A6C606d87d31121e5201bFf999695D3C70D59",
    token: "0xcCdA7b7B6cF49208a3E751e56c98cb34202e7777",
    pool: "0x510D53EFdAdEec8299D7328867Ddc6f815cbEA6B",
    vault: "0x44c5AFF0812bCe6b53c17910a3427ceB0955f70a",
    transactions: [
      { id: "launch", label: "Launch", hash: "0x34439fa4200a28a54678b1493900f4fee0ee294540ff2e27b40cebbeaea3c084" },
      { id: "vault-claim", label: "Vault claim", hash: "0x41a1ed514a49dd993fd946b69d97ad310a007269c1d9afdce21aa3b518c4ec3d" },
    ],
  },
  round3: { launcher: "0x4C3fBa949C25d1511b786A24Bd0Bcb6028D8dBd9" },
} as const;

/** The record wallet that seals the Wattness agent's plans in GateRecord. */
export const WATTNESS_AGENT = "0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8";

export const SCOPE = {
  label: "gate-record/ercot-da-energy",
  id: "0x4ace28d1c5fc87449d9960b5d139d6667e75a42fad1082c63dc9ba3f08586bb9",
} as const;
