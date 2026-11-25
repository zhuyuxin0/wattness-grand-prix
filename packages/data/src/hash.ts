import { createHash } from "node:crypto";

export const SHA256 = /^[a-f0-9]{64}$/;

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}
