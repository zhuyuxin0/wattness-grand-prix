// Fallback record: a zero-value transaction to self carrying GATEREC1 calldata.
// Usage: anchor --od 20261126 --root 0x<32 bytes> [--dry-run]
//        anchor --od 20261126 --dir out/od-20261126 [--dry-run]   root from root.txt; writes record.json there
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { isHex } from "viem";
import { loadAccount } from "./lib/account.ts";
import { fail, NETWORK_OPTIONS, networkFrom } from "./lib/args.ts";
import { encodeAnchor, readAnchor, sendAnchor } from "./lib/anchor.ts";
import { assertChain, formatNative, formatStamp, readerFor, signerFor } from "./lib/clients.ts";

try {
  const { values } = parseArgs({
    options: {
      ...NETWORK_OPTIONS,
      od: { type: "string" },
      root: { type: "string" },
      dir: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const network = networkFrom(values);
  const dir = values.dir ? resolve(process.env.INIT_CWD ?? process.cwd(), values.dir) : undefined;
  const root = values.root ?? (dir ? readFileSync(join(dir, "root.txt"), "utf8").trim() : undefined);
  if (dir && existsSync(join(dir, "record.json"))) throw new Error(`${dir} already holds record.json`);
  if (!values.od || !/^\d{8}$/.test(values.od)) throw new Error("--od must be YYYYMMDD");
  const od = Number(values.od);
  if (!root || !isHex(root) || root.length !== 66) throw new Error("--root must be 0x plus 64 hex digits");

  const reader = readerFor(network);
  await assertChain(reader);
  const account = loadAccount(network);
  const data = encodeAnchor({ chainId: reader.chain.id, od, root });
  const [gas, gasPrice] = await Promise.all([
    reader.estimateGas({ account: account.address, to: account.address, value: 0n, data }),
    reader.getGasPrice(),
  ]);
  console.log(`from      ${account.address} on ${network.name} (chain ${reader.chain.id})`);
  console.log(`data      ${data}`);
  console.log(`estimate  ${gas} gas = ${formatNative(gas * gasPrice, reader.chain)}`);
  if (values["dry-run"]) process.exit(0);

  const sent = await sendAnchor(reader, signerFor(network, account), od, root);
  const back = await readAnchor(reader, sent.txHash);
  if (back.root !== root.toLowerCase() || back.od !== od) throw new Error("anchor read back differs");
  console.log(`tx        ${sent.txHash}`);
  console.log(`block     ${sent.blockNumber} at ${formatStamp(sent.blockTimestamp)}`);
  if (dir) {
    const index = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { leaf_count?: number };
    const record = { mode: "anchor", chainId: reader.chain.id, txHash: sent.txHash, root: root.toLowerCase(), leafCount: index.leaf_count ?? 1 };
    writeFileSync(join(dir, "record.json"), `${JSON.stringify(record, null, 2)}\n`);
    console.log(`wrote     ${join(dir, "record.json")}`);
  }
} catch (err) {
  fail(err);
}
