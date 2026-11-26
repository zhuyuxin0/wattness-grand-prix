declare module "*?raw" {
  const text: string;
  export default text;
}

declare namespace Cloudflare {
  interface Env {
    GREENFIELD_BASE: string;
    COMMITTER: string;
    GATE_RECORD: string;
    RPC_BSC_MAINNET: string;
    RPC_BSC_TESTNET: string;
  }
}
