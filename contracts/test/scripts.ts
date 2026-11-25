import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { getAddress, keccak256, stringToHex } from "viem";
import { ANCHOR_TAG, decodeAnchor, encodeAnchor, readAnchor, sendAnchor } from "../scripts/lib/anchor.ts";
import { contractsPath, loadArtifact, loadBuildInfo } from "../scripts/lib/artifact.ts";
import type { Reader, Signer } from "../scripts/lib/clients.ts";
import { deployContract } from "../scripts/lib/deploy.ts";
import { assertNetworkAllowed, resolveNetwork, BSC_MAINNET_RPCS, BSC_TESTNET_RPCS } from "../scripts/lib/networks.ts";
import { loadAccount } from "../scripts/lib/account.ts";
import { verifyOnSourcify, verifyRequest } from "../scripts/lib/sourcify.ts";

const ROOT = keccak256(stringToHex("manifest"));

async function local() {
  const { viem } = await network.create({ override: { initialDate: "2026-11-20T00:00:00Z" } });
  const [wallet] = await viem.getWalletClients();
  assert.ok(wallet);
  // Hardhat's clients carry its own chain type; the scripts only need the viem surface.
  const reader = (await viem.getPublicClient()) as unknown as Reader;
  return { viem, reader, signer: wallet as unknown as Signer };
}

describe("abi export", () => {
  it("matches the compiled artifact", () => {
    const exported = JSON.parse(readFileSync(contractsPath("abi/GateRecord.json"), "utf8"));
    assert.deepEqual(exported, loadArtifact().abi, "run `pnpm abi` in contracts/");
  });
});

describe("networks", () => {
  it("fails over across the public BSC testnet RPCs, an override first", () => {
    const net = resolveNetwork("bsc-testnet", "https://rpc.example");
    assert.equal(net.chain.id, 97);
    assert.deepEqual(net.rpcUrls, ["https://rpc.example", ...BSC_TESTNET_RPCS]);
    assert.throws(() => resolveNetwork("bsc"), /unknown network/);
  });

  it("reaches BSC mainnet only with --mainnet, and refuses --mainnet anywhere else", () => {
    const main = resolveNetwork("bsc-mainnet");
    assert.equal(main.chain.id, 56);
    assert.deepEqual(main.rpcUrls, [...BSC_MAINNET_RPCS]);
    assert.throws(() => assertNetworkAllowed(main, false), /--mainnet/);
    assert.doesNotThrow(() => assertNetworkAllowed(main, true));
    assert.doesNotThrow(() => assertNetworkAllowed(resolveNetwork("bsc-testnet"), false));
    assert.throws(() => assertNetworkAllowed(resolveNetwork("bsc-testnet"), true), /only for --network bsc-mainnet/);
  });

  it("treats local as the Hardhat node and signs there with Hardhat's public test account", () => {
    const net = resolveNetwork("local");
    assert.equal(net.chain.id, 31337);
    assert.equal(loadAccount(net).address, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  });
});

describe("deploy", () => {
  it("deploys GateRecord and records a deployment whose runtime code matches the artifact", async () => {
    const { viem, reader, signer } = await local();
    const artifact = loadArtifact();
    const d = await deployContract(reader, signer, artifact, "localhost", "0.8.28+commit.7893614a");
    assert.equal(d.chainId, 31337);
    assert.equal(d.deployer, getAddress(signer.account.address));
    assert.equal(d.runtimeCodeHash, keccak256(artifact.deployedBytecode));
    assert.equal(d.buildInfoId, artifact.buildInfoId);
    assert.ok(BigInt(d.gasUsed) < 1_500_000n, `deploy used ${d.gasUsed} gas`);

    const gr = await viem.getContractAt("GateRecord", d.address);
    assert.equal(await gr.read.gateTs([20261126]), 1795622400n);
  });
});

describe("calldata anchor", () => {
  it("encodes tag, chain id, od and root in 52 bytes", () => {
    const data = encodeAnchor({ chainId: 97, od: 20261126, root: ROOT });
    assert.equal(data, `0x${"4741544552454331"}${"0000000000000061"}${"01352906"}${ROOT.slice(2)}`);
    assert.equal(ANCHOR_TAG, "0x4741544552454331");
    assert.deepEqual(decodeAnchor(data), { chainId: 97, od: 20261126, root: ROOT });
  });

  it("rejects malformed anchors", () => {
    const data = encodeAnchor({ chainId: 97, od: 20261126, root: ROOT });
    assert.throws(() => decodeAnchor(`${data}00`), /52 bytes/);
    assert.throws(() => decodeAnchor(`0x00${data.slice(4)}`), /not a GATEREC1/);
    assert.throws(() => encodeAnchor({ chainId: 97, od: 20261126, root: "0x1234" }), /32 bytes/);
  });

  it("sends a zero-value transaction to self and reads it back", async () => {
    const { reader, signer } = await local();
    const sent = await sendAnchor(reader, signer, 20261126, ROOT);
    const back = await readAnchor(reader, sent.txHash);
    assert.deepEqual(
      { chainId: back.chainId, od: back.od, root: back.root },
      { chainId: 31337, od: 20261126, root: ROOT },
    );
    assert.equal(getAddress(back.from), getAddress(signer.account.address));
    assert.equal(back.blockTimestamp, sent.blockTimestamp);
  });
});

describe("sourcify", () => {
  const artifact = loadArtifact();
  const buildInfo = loadBuildInfo(artifact.buildInfoId);
  const tx = keccak256("0xaa");
  const address = getAddress("0x00000000000000000000000000000000000000a1");

  it("submits the build's standard JSON input unchanged", () => {
    const req = verifyRequest(artifact, buildInfo, tx);
    assert.equal(req.stdJsonInput, buildInfo.input);
    assert.equal(req.contractIdentifier, "project/contracts/GateRecord.sol:GateRecord");
    assert.match(req.compilerVersion, /^0\.8\.28\+commit\.[0-9a-f]{8}$/);
    assert.equal(req.creationTransactionHash, tx);
  });

  it("refuses a build info that is not the artifact's", () => {
    assert.throws(() => verifyRequest(artifact, { ...buildInfo, id: "other" }, tx), /not the artifact's/);
  });

  function fakeSourcify(jobs: object[]) {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const f = (async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
      if (url.includes("/v2/contract/")) return json(404, { customCode: "not_found" });
      if (method === "POST") return json(202, { verificationId: "job-1" });
      return json(200, jobs.shift());
    }) as typeof fetch;
    return { f, calls };
  }

  it("posts to chain 97 and polls the job until it matches", async () => {
    const { f, calls } = fakeSourcify([
      { isJobCompleted: false },
      { isJobCompleted: true, contract: { match: "exact_match" } },
    ]);
    const req = verifyRequest(artifact, buildInfo, tx);
    const result = await verifyOnSourcify(97, address, req, { api: "https://s.test", fetch: f, pollMs: 1 });
    assert.deepEqual(result, { match: "exact_match", verificationId: "job-1", alreadyVerified: false });
    assert.deepEqual(
      calls.map((c) => `${c.method} ${c.url}`),
      [
        `GET https://s.test/v2/contract/97/${address}`,
        `POST https://s.test/v2/verify/97/${address}`,
        "GET https://s.test/v2/verify/job-1",
        "GET https://s.test/v2/verify/job-1",
      ],
    );
    assert.deepEqual(calls[1]?.body, JSON.parse(JSON.stringify(req)));
  });

  it("reports a failed job with Sourcify's code", async () => {
    const { f } = fakeSourcify([
      { isJobCompleted: true, error: { customCode: "no_match", message: "bytecode differs" } },
    ]);
    await assert.rejects(
      verifyOnSourcify(97, address, verifyRequest(artifact, buildInfo, tx), { api: "https://s.test", fetch: f }),
      /no_match: bytecode differs/,
    );
  });

  it("skips the submission when the contract is already verified", async () => {
    const f = (async () => new Response(JSON.stringify({ match: "match" }), { status: 200 })) as typeof fetch;
    const result = await verifyOnSourcify(97, address, verifyRequest(artifact, buildInfo, tx), { fetch: f });
    assert.deepEqual(result, { match: "match", alreadyVerified: true });
  });
});
