// Contract calls go through the BNB agent SDK 0.6.1, as the Agent Studio seller
// did: its executor asks the MegaFuel testnet relay to sponsor each call (gas
// price 0) and pays the gas itself only when the relay refuses. Before a call
// is sent, pm_isSponsorable says which way it will go, so a wallet is funded
// only when it has to be.
import { randomBytes } from "node:crypto";
import { EVMWalletProvider, Paymaster } from "@bnbagent/sdk";
import { createWalletClient, fallback, http, type Abi, type Address, type Hash, type Hex } from "viem";
import { bscTestnet } from "viem/chains";
import { FUNDING, MEGAFUEL_TESTNET, reader, recordAccount, RECORD_WALLET, RECORD_WALLET_FLOOR, RPCS, say, sentTx, stop, tbnb } from "./common.ts";
import type { SentTx } from "@gatelock/agents";

// The SDK resolves its own RPC from the environment; point it at the endpoint the runners read from.
process.env.RPC_URL_BSC_TESTNET ??= RPCS[0];
process.env.BNBAGENT_USE_PAYMASTER = "1";

export const paymaster = new Paymaster(MEGAFUEL_TESTNET);

/** An in-memory SDK wallet: the key is never written to disk (persist: false). */
export function sdkWallet(key: Hex): EVMWalletProvider {
  return new EVMWalletProvider({ privateKey: key, password: randomBytes(24).toString("hex"), persist: false });
}

export interface Call {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}

/**
 * Runs one contract call through the SDK's executor: sponsored by MegaFuel when the relay accepts it, else
 * self-paid. Waits for the receipt and returns the hash; a revert stops the run.
 */
export async function execute(key: Hex, call: Call, description: string): Promise<Hash> {
  const executor = sdkWallet(key).makeExecutor({ client: reader as never, paymaster, receiptTimeout: 180 });
  const res = await executor.execute({ call: call as never, description });
  if (res.status !== 1) stop(`${description}: ${res.transactionHash} did not succeed (status ${res.status})`);
  return res.transactionHash;
}

/** Asks the relay whether it would sponsor this call; a relay error counts as a refusal. */
export async function sponsorable(from: Address, to: Address, data: Hex): Promise<{ sponsorable: boolean; gas: bigint; reason?: string }> {
  let gas: bigint;
  try {
    gas = ((await reader.estimateGas({ account: from, to, data })) * 12n) / 10n;
  } catch (e) {
    return { sponsorable: false, gas: 0n, reason: `estimateGas: ${(e as Error).message.split("\n")[0]}` };
  }
  try {
    return { sponsorable: await paymaster.isSponsorable({ from, to, data, value: 0n, gas }), gas };
  } catch (e) {
    return { sponsorable: false, gas, reason: (e as Error).message.split("\n")[0] };
  }
}

/**
 * Sends FUNDING (0.01 tBNB) from the record wallet to a role wallet, unless the role wallet already holds it.
 * One transfer at a time; refuses to take the record wallet below its floor.
 */
export async function fundFromRecordWallet(to: Address, why: string): Promise<SentTx | null> {
  const have = await reader.getBalance({ address: to });
  if (have >= FUNDING) {
    say(`${to} already holds ${tbnb(have)}; no funding`);
    return null;
  }
  const account = recordAccount();
  const balance = await reader.getBalance({ address: RECORD_WALLET });
  const gasPrice = await reader.getGasPrice();
  const cost = FUNDING + 21_000n * gasPrice;
  if (balance - cost < RECORD_WALLET_FLOOR) stop(`funding ${to} would take the record wallet below ${tbnb(RECORD_WALLET_FLOOR)} (it holds ${tbnb(balance)})`);
  const wallet = createWalletClient({ account, chain: bscTestnet, transport: fallback(RPCS.map((u) => http(u, { timeout: 20_000 }))) });
  say(`funding ${to} with ${tbnb(FUNDING)} from the record wallet: ${why}`);
  const hash: Hash = await wallet.sendTransaction({ to, value: FUNDING, gasPrice, type: "legacy" });
  const tx = await sentTx(hash);
  say(`funded: ${hash}; the record wallet holds ${tbnb(await reader.getBalance({ address: RECORD_WALLET }))}`);
  return tx;
}
