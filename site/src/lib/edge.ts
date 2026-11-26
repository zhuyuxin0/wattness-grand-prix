// The edge Worker on Cloudflare (workers/edge): it serves each sealed operating day's files from BNB Greenfield, each
// only after checking it against the root committed on GateRecord, and answers /verify/<battery> with one battery's
// verdict as JSON (schema gate-record.edge-verdict.v1): the leaf hash, its Merkle proof, the record key, the on-chain
// record and the gate, each with pass or fail and the values compared.

export const EDGE_HOST = "grand-prix-edge.wattness.workers.dev";
export const EDGE_URL = `https://${EDGE_HOST}`;

export type EdgeNetwork = "bsc-mainnet" | "bsc-testnet";

/** The edge's verdict for one battery on one operating day (YYYY-MM-DD), against GateRecord on that network. */
export function edgeVerifyUrl(resource: string, operatingDay: string, network: EdgeNetwork = "bsc-mainnet"): string {
  return `${EDGE_URL}/verify/${encodeURIComponent(resource)}?od=${encodeURIComponent(operatingDay)}&network=${network}`;
}
