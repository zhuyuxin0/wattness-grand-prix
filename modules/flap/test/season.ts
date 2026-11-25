import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { type Address, getAddress, type Hex, keccak256, parseEther, stringToHex, zeroAddress } from "viem";
import { encodeSeasonConfig, type SeasonConfig } from "@gatelock/flap";

// 2026-11-20 00:00 UTC: both season days' gates are still ahead of the chain clock.
const GENESIS = "2026-11-20T00:00:00Z";
const START = 1795132800n;
const GATE_1126 = 1795622400n;
const GATE_1127 = 1795708800n;
const SCOPE = keccak256(stringToHex("gate-record/ercot-da-energy"));
const ROOT = keccak256(stringToHex("root"));
const CODE = keccak256(stringToHex("code"));
const FEE = parseEther("0.005");
const RESERVE = parseEther("500000000");
const USD = (n: number) => parseEther(String(n));

async function setup() {
  const { viem } = await network.create({ override: { initialDate: GENESIS } });
  const [creator, alice, bob, agent, carol] = await viem.getWalletClients();
  assert.ok(creator && alice && bob && agent && carol);
  type Who = NonNullable<typeof alice>;
  const gr = await viem.deployContract("TestGateRecord");
  const quote = await viem.deployContract("MockERC20", ["USD", "USD"]);
  const portal = await viem.deployContract("MockPortal");
  const factory = await viem.deployContract("SeasonLauncherFactory", [portal.address, quote.address, gr.address]);
  const clock = await viem.getTestClient();
  const reader = await viem.getPublicClient();
  for (const w of [alice, bob, carol]) await quote.write.mint([w.account.address, USD(5_000)]);

  const config = (over: Partial<SeasonConfig> = {}): SeasonConfig => ({
    name: "Grand Prix Season",
    symbol: "PRIX",
    meta: "",
    salt: keccak256(stringToHex(`salt-${Math.random()}`)),
    minRaise: USD(1_500),
    raiseCap: USD(2_000),
    walletCap: USD(1_000),
    deadline: START + 7n * 86_400n,
    milestoneCommitter: getAddress(agent.account.address),
    milestoneOd: 20261126,
    milestoneStage: 0,
    scope: SCOPE,
    seasonDays: [20261126, 20261127],
    earnedBps: 2_000,
    rewardCap: USD(100),
    taxRoute: 0,
    ...over,
  });

  async function create(c: SeasonConfig) {
    const data = encodeSeasonConfig(c);
    const launcherAddress = await portal.simulate.newLauncher([factory.address, data], { value: FEE }).then((r) => r.result);
    await portal.write.newLauncher([factory.address, data], { value: FEE });
    return viem.getContractAt("SeasonLauncher", launcherAddress);
  }

  async function contribute(launcher: Address, who: Who, amount: bigint) {
    const q = await viem.getContractAt("MockERC20", quote.address, { client: { wallet: who } });
    await q.write.approve([launcher, amount]);
    const l = await viem.getContractAt("SeasonLauncher", launcher, { client: { wallet: who } });
    await l.write.contributeQuote([amount]);
  }

  const asAgent = await viem.getContractAt("TestGateRecord", gr.address, { client: { wallet: agent } });
  const seal = async (od: number, at: bigint) => {
    await clock.setNextBlockTimestamp({ timestamp: at });
    await asAgent.write.commit([SCOPE, od, ROOT, 316, CODE]);
  };
  const asLauncher = (address: Address, who: Who) => viem.getContractAt("SeasonLauncher", address, { client: { wallet: who } });
  const asVault = (address: Address, who: Who) => viem.getContractAt("SeasonVault", address, { client: { wallet: who } });

  return { viem, gr, quote, portal, factory, clock, reader, creator, alice, bob, agent, carol, config, create, contribute, seal, asLauncher, asVault };
}

describe("SeasonLauncherFactory", () => {
  it("pairs with its vault factory and speaks the Pool Launch spec versions", async () => {
    const { viem, factory, portal } = await setup();
    assert.equal(await factory.read.factorySpecVersion(), "lf-v1");
    const vf = await viem.getContractAt("SeasonVaultFactory", await factory.read.vaultFactory());
    assert.equal(await vf.read.factorySpecVersion(), "pl-v1");
    assert.equal(getAddress(await vf.read.launcherFactory()), getAddress(factory.address));
    assert.equal(getAddress(await vf.read.hub()), getAddress(portal.address));
    const schema = await factory.read.launcherDataSchema();
    assert.equal(schema.fields.length, 16);
  });

  it("creates a Launcher only through the Portal, which locks its own salt", async () => {
    const { viem, factory, portal, config, create, alice } = await setup();
    const c = config();
    const launcher = await create(c);
    assert.equal(getAddress(await portal.read.saltLocker([c.salt])), getAddress(launcher.address));
    assert.equal(getAddress((await portal.read.getLauncher([launcher.address])).launcherFactory), getAddress(factory.address));

    const direct = await viem.getContractAt("SeasonLauncherFactory", factory.address, { client: { wallet: alice } });
    await viem.assertions.revertWithCustomErrorWithArgs(
      direct.write.newLauncher([alice.account.address, encodeSeasonConfig(config())]),
      factory,
      "NotHub",
      [getAddress(alice.account.address)],
    );
    await assert.rejects(portal.write.newLauncher([factory.address, encodeSeasonConfig(config())], { value: FEE - 1n }));

    const d = JSON.parse(await launcher.read.description());
    assert.equal(d.v, 1);
    assert.equal(d.symbol, "PRIX");
    assert.equal(d.targetRaise, USD(1_500).toString());
    assert.equal(d.poolTokenRatio, parseEther("0.5").toString());
  });

  it("refuses a config that is not canonical or out of range", async () => {
    const { viem, factory, portal, config } = await setup();
    const bad: Array<[Partial<SeasonConfig>, string]> = [
      [{ seasonDays: [20261127, 20261126] }, "seasonDays"],
      [{ seasonDays: [] }, "seasonDays"],
      [{ deadline: START - 1n }, "deadline"],
      [{ minRaise: USD(3_000) }, "minRaise"],
      [{ symbol: 'PR"X' }, "symbol"],
      [{ earnedBps: 5_001 }, "earnedBps"],
      [{ taxRoute: 2 as 0 }, "taxRoute"],
    ];
    for (const [over, field] of bad) {
      await viem.assertions.revertWithCustomErrorWithArgs(
        portal.write.newLauncher([factory.address, encodeSeasonConfig(config(over))], { value: FEE }),
        factory,
        "InvalidConfig",
        [field],
      );
    }
    const gr = await viem.getContractAt("TestGateRecord", await factory.read.gateRecord());
    await viem.assertions.revertWithCustomErrorWithArgs(
      portal.write.newLauncher([factory.address, encodeSeasonConfig(config({ milestoneOd: 20261131 }))], { value: FEE }),
      gr,
      "InvalidDay",
      [20261131],
    );
    const trailing = `${encodeSeasonConfig(config())}00` as Hex;
    await viem.assertions.revertWithCustomError(portal.write.newLauncher([factory.address, trailing], { value: FEE }), factory, "InvalidData");
  });
});

describe("SeasonLauncher", () => {
  it("caps contributions per wallet and in total", async () => {
    const { viem, config, create, contribute, alice, bob, carol } = await setup();
    const l = await create(config());
    await contribute(l.address, alice, USD(1_000));
    await viem.assertions.revertWithCustomErrorWithArgs(contribute(l.address, alice, 1n), l, "OverWalletCap", [USD(1_000) + 1n, USD(1_000)]);
    await contribute(l.address, bob, USD(1_000));
    await viem.assertions.revertWithCustomErrorWithArgs(contribute(l.address, carol, 1n), l, "OverRaiseCap", [USD(2_000) + 1n, USD(2_000)]);
    assert.equal(await l.read.raised(), USD(2_000));
    assert.deepEqual((await l.read.contributors()).map((a) => getAddress(a)), [alice, bob].map((w) => getAddress(w.account.address)));
  });

  it("launches only once the milestone was sealed before its gate", async () => {
    const { viem, quote, portal, config, create, contribute, seal, alice, bob } = await setup();
    const l = await create(config());
    await contribute(l.address, alice, USD(1_000));
    await viem.assertions.revertWithCustomErrorWithArgs(l.write.launch(), l, "BelowMinRaise", [USD(1_000), USD(1_500)]);
    await contribute(l.address, bob, USD(1_000));
    await viem.assertions.revertWithCustomError(l.write.launch(), l, "MilestoneNotMet");
    assert.equal(await l.read.milestoneMet(), false);

    await seal(20261126, GATE_1126 - 600n);
    assert.equal(await l.read.milestoneMet(), true);
    await l.write.launch();

    const token = await l.read.token();
    const vault = await l.read.vault();
    assert.equal(await l.read.status(), 1);
    const [launchVault] = await portal.read.getLaunchVault([token]);
    assert.equal(getAddress(launchVault), getAddress(vault));
    const prix = await viem.getContractAt("MockERC20", token);
    const earned = RESERVE / 5n;
    assert.equal(await l.read.earnedTokens(), earned);
    assert.equal(await prix.read.balanceOf([vault]), earned);
    assert.equal(await prix.read.balanceOf([l.address]), RESERVE - earned);
    assert.equal(await quote.read.balanceOf([l.address]), 0n);
    assert.equal(await quote.read.balanceOf([await portal.read.lastPool()]), USD(2_000));
    await viem.assertions.revertWithCustomError(l.write.launch(), l, "NotOpen");
  });

  it("pays contributors their part of the reserve pro rata, once", async () => {
    const { viem, config, create, contribute, seal, alice, bob, asLauncher } = await setup();
    const l = await create(config());
    await contribute(l.address, alice, USD(1_000));
    await contribute(l.address, bob, USD(500));
    await seal(20261126, GATE_1126 - 1n);
    await l.write.launch();
    const prix = await viem.getContractAt("MockERC20", await l.read.token());
    const part = RESERVE - RESERVE / 5n;
    const aliceL = await asLauncher(l.address, alice);
    await aliceL.write.claim();
    assert.equal(await prix.read.balanceOf([alice.account.address]), (USD(1_000) * part) / USD(1_500));
    await viem.assertions.revertWithCustomError(aliceL.write.claim(), l, "NothingToClaim");
  });

  it("refunds every contribution when the deadline passes without a launch", async () => {
    const { viem, quote, clock, config, create, contribute, alice, bob, asLauncher } = await setup();
    const c = config({ milestoneOd: 20261231, deadline: START + 3_600n });
    const l = await create(c);
    await contribute(l.address, alice, USD(1_000));
    await contribute(l.address, bob, USD(800));
    const aliceL = await asLauncher(l.address, alice);
    await viem.assertions.revertWithCustomError(aliceL.write.refund(), l, "RefundUnavailable");

    await clock.setNextBlockTimestamp({ timestamp: c.deadline });
    await clock.mine({ blocks: 1 });
    assert.equal(await l.read.status(), 2);
    await viem.assertions.revertWithCustomError(l.write.launch(), l, "NotOpen");
    await viem.assertions.revertWithCustomError(contribute(l.address, alice, 1n), l, "NotOpen");
    const before = await quote.read.balanceOf([alice.account.address]);
    await aliceL.write.refund();
    assert.equal(await quote.read.balanceOf([alice.account.address]), before + USD(1_000));
    assert.equal(await l.read.raised(), USD(800));
    await viem.assertions.revertWithCustomError(aliceL.write.refund(), l, "NothingToRefund");
  });
});

describe("SeasonVault", () => {
  async function launched(taxRoute: 0 | 1 = 0) {
    const s = await setup();
    const l = await s.create(s.config({ taxRoute }));
    const aliceL = await s.asLauncher(l.address, s.alice);
    await aliceL.write.back([s.agent.account.address]);
    await s.contribute(l.address, s.alice, USD(1_000));
    await s.contribute(l.address, s.bob, USD(1_000));
    await s.seal(20261126, GATE_1126 - 60n);
    await l.write.launch();
    const vault = await s.viem.getContractAt("SeasonVault", await l.read.vault());
    const prix = await s.viem.getContractAt("MockERC20", await l.read.token());
    return { ...s, l, vault, prix };
  }

  it("weights the earned pool by deposit and the backed agent's sealed days", async () => {
    const { viem, l, vault, prix, seal, alice, bob, agent, asVault } = await launched();
    assert.equal(getAddress(await l.read.agentOf([alice.account.address])), getAddress(agent.account.address));
    assert.deepEqual(await vault.read.skillOf([agent.account.address]), [1n, 2n]);
    assert.deepEqual(await vault.read.skillOf([bob.account.address]), [0n, 2n]);

    const earned = RESERVE / 5n;
    const aliceV = await asVault(vault.address, alice);
    await aliceV.write.claim();
    assert.equal(await prix.read.balanceOf([alice.account.address]), earned / 4n);
    await viem.assertions.revertWithCustomError((await asVault(vault.address, bob)).write.claim(), vault, "NothingToClaim");

    // The second season day sealed before its gate doubles Alice's earned share.
    await seal(20261127, GATE_1127 - 60n);
    assert.deepEqual(await vault.read.claimable([alice.account.address]), [0n, earned / 4n]);
    await aliceV.write.claim();
    assert.equal(await prix.read.balanceOf([alice.account.address]), earned / 2n);
  });

  it("counts no record sealed at or after the gate, and none under another scope", async () => {
    const { viem, vault, agent, carol, gr, clock } = await launched();
    const asCarol = await viem.getContractAt("TestGateRecord", gr.address, { client: { wallet: carol } });
    await clock.setNextBlockTimestamp({ timestamp: GATE_1127 - 30n });
    await asCarol.write.commit([keccak256(stringToHex("other")), 20261127, ROOT, 1, CODE]);
    assert.deepEqual(await vault.read.skillOf([carol.account.address]), [0n, 2n]);
    await clock.setNextBlockTimestamp({ timestamp: GATE_1127 });
    const asAgent = await viem.getContractAt("TestGateRecord", gr.address, { client: { wallet: agent } });
    await viem.assertions.revertWithCustomError(asAgent.write.commit([SCOPE, 20261127, ROOT, 1, CODE]), gr, "AfterGate");
    assert.deepEqual(await vault.read.skillOf([agent.account.address]), [1n, 2n]);
  });

  it("credits trading tax by balance delta up to the cap and passes the rest to the creator", async () => {
    const { viem, quote, portal, l, vault, creator, alice, asVault, seal } = await launched();
    const token = await l.read.token();
    const tax = await viem.getContractAt("MockERC20", quote.address, { client: { wallet: alice } });
    await tax.write.approve([portal.address, USD(1_000)]);
    const portalAsAlice = await viem.getContractAt("MockPortal", portal.address, { client: { wallet: alice } });

    await portalAsAlice.write.dispatchTax([token, quote.address, USD(80)]);
    await vault.write.sync();
    assert.equal(await vault.read.pooled(), USD(80));
    const creatorBefore = await quote.read.balanceOf([creator.account.address]);
    await portalAsAlice.write.dispatchTax([token, quote.address, USD(50)]);
    await vault.write.sync();
    assert.equal(await vault.read.pooled(), USD(100));
    assert.equal(await vault.read.forwarded(), USD(30));
    assert.equal(await quote.read.balanceOf([creator.account.address]), creatorBefore + USD(30));

    // Alice holds half the deposits and her agent has sealed one of two days.
    assert.equal((await vault.read.claimable([alice.account.address]))[0], USD(25));
    await seal(20261127, GATE_1127 - 1n);
    const before = await quote.read.balanceOf([alice.account.address]);
    await (await asVault(vault.address, alice)).write.claim();
    assert.equal(await quote.read.balanceOf([alice.account.address]), before + USD(50));
    const s = await vault.read.state();
    assert.equal(s.quotePaid, USD(50));
    assert.equal(s.recognized, USD(130));
  });

  it("routes the tax through a MARKETING slot to the same vault", async () => {
    const { l, vault, portal, prix } = await launched(1);
    const token = await l.read.token();
    assert.equal(getAddress(await portal.read.taxRecipient([token])), getAddress(vault.address));
    const [launchVault] = await portal.read.getLaunchVault([token]);
    assert.equal(launchVault, zeroAddress);
    assert.equal(await prix.read.balanceOf([vault.address]), RESERVE / 5n);
  });

  it("is made only for a launching Launcher of its own factory", async () => {
    const { viem, factory, alice, l } = await launched();
    const vf = await viem.getContractAt("SeasonVaultFactory", await factory.read.vaultFactory(), { client: { wallet: alice } });
    await viem.assertions.revertWithCustomErrorWithArgs(
      vf.write.newVault([l.address, l.address, 0, "0x"]),
      vf,
      "NotHub",
      [getAddress(alice.account.address)],
    );
    await viem.assertions.revertWithCustomErrorWithArgs(vf.write.openVault([l.address]), vf, "NotLauncher", [getAddress(alice.account.address)]);
  });
});
