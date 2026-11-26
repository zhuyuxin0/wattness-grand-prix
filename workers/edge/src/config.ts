import { checksumAddress, type Hex } from "./bytes.ts";
import { EdgeError } from "./errors.ts";

/** Bindings from wrangler.jsonc; every value is public. */
export interface Env {
  /** The public-read bucket's base URL; a day's files are under od-YYYYMMDD/. */
  GREENFIELD_BASE: string;
  /** The agent wallet whose records are served. GateRecord takes commits from any wallet. */
  COMMITTER: string;
  /** GateRecord, at the same address on both chains. */
  GATE_RECORD: string;
  /** Comma-separated public RPC URLs, tried in order. */
  RPC_BSC_MAINNET: string;
  RPC_BSC_TESTNET: string;
}

export const NETWORKS = { "bsc-mainnet": 56, "bsc-testnet": 97 } as const;
export type NetworkName = keyof typeof NETWORKS;
export const isNetwork = (s: string): s is NetworkName => Object.hasOwn(NETWORKS, s);

/** The scope every day's plans are committed under (core's PLAN_SCOPE_LABEL). */
export const PLAN_SCOPE_LABEL = "gate-record/ercot-da-energy";
export const FLEET_SCHEMA = "gate-record.fleet.v1";
export const MANIFEST_SCHEMA = "gate-record.manifest.v1";

/** A record this many blocks deep is served and cached; a shallower one is served with no-store. */
export const MIN_CONFIRMATIONS = 15;

export interface Config {
  greenfieldBase: string;
  committer: Hex;
  contract: Hex;
  rpc: Record<NetworkName, string[]>;
}

const urls = (raw: string | undefined, name: string): string[] => {
  const list = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length === 0 || list.some((u) => !/^https:\/\/[^\s]+$/.test(u))) throw new EdgeError(500, `${name} must list https URLs`);
  return list;
};

export function configFrom(env: Env): Config {
  const base = env.GREENFIELD_BASE ?? "";
  if (!/^https:\/\/[^\s]+\/$/.test(base)) throw new EdgeError(500, "GREENFIELD_BASE must be an https URL ending in /");
  const address = (raw: string | undefined, name: string): Hex => {
    try {
      return checksumAddress(raw ?? "");
    } catch {
      throw new EdgeError(500, `${name} is not an address`);
    }
  };
  return {
    greenfieldBase: base,
    committer: address(env.COMMITTER, "COMMITTER"),
    contract: address(env.GATE_RECORD, "GATE_RECORD"),
    rpc: { "bsc-mainnet": urls(env.RPC_BSC_MAINNET, "RPC_BSC_MAINNET"), "bsc-testnet": urls(env.RPC_BSC_TESTNET, "RPC_BSC_TESTNET") },
  };
}
