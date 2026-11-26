// The one Node API the Worker uses, provided by the runtime under nodejs_compat.
declare module "node:crypto" {
  interface Hash {
    update(data: Uint8Array): Hash;
    digest(): Uint8Array;
  }
  export function createHash(algorithm: "sha256"): Hash;
}
