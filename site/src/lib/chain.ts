export interface ChainInfo {
  id: number;
  name: string;
  explorer: string | null;
  mainnet: boolean;
}

const CHAINS: Record<number, ChainInfo> = {
  56: { id: 56, name: "BNB Smart Chain", explorer: "https://bscscan.com", mainnet: true },
  97: { id: 97, name: "BNB Smart Chain Testnet", explorer: "https://testnet.bscscan.com", mainnet: false },
  31337: { id: 31337, name: "Local chain", explorer: null, mainnet: false },
};

export function chainInfo(id: number): ChainInfo {
  return CHAINS[id] ?? { id, name: `Chain ${id}`, explorer: null, mainnet: false };
}

export type ExplorerKind = "tx" | "address" | "block";

export function explorerUrl(chainId: number, kind: ExplorerKind, value: string | number): string | null {
  const base = chainInfo(chainId).explorer;
  return base ? `${base}/${kind}/${value}` : null;
}
