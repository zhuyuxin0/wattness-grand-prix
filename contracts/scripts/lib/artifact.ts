import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Abi, Hex } from "viem";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

export interface Artifact {
  contractName: string;
  sourceName: string;
  inputSourceName: string;
  buildInfoId: string;
  abi: Abi;
  bytecode: Hex;
  deployedBytecode: Hex;
}

export interface BuildInfo {
  id: string;
  solcLongVersion: string;
  input: {
    language: string;
    sources: Record<string, { content: string }>;
    settings: Record<string, unknown>;
  };
}

function readJson<T>(rel: string, hint: string): T {
  const path = ROOT + rel;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new Error(`${rel} not found; ${hint}`);
    throw err;
  }
}

export function loadArtifact(name = "GateRecord"): Artifact {
  return readJson<Artifact>(`artifacts/contracts/${name}.sol/${name}.json`, "run `pnpm build` in contracts/");
}

export function loadBuildInfo(id: string): BuildInfo {
  return readJson<BuildInfo>(
    `artifacts/build-info/${id}.json`,
    "rebuild from the deployed commit with `pnpm build` in contracts/",
  );
}

export function contractsPath(rel: string): string {
  return ROOT + rel;
}
