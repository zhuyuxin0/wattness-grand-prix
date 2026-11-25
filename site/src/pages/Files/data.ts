import { fetchJson, useLoad } from "../../data";

/** public/data/greenfield.json, written by scripts/data/greenfield.mjs. */
export interface GreenfieldIndex {
  schema: "grand-prix.greenfield.v1";
  operatingDay: string;
  network: { greenfield: string; bscChainId: number };
  bucket: { name: string; owner: string; visibility: string; id: string; primarySp: string };
  explorer: string;
  /** Each file is served at baseUrl + path. */
  baseUrl: string;
  objects: number;
  totalBytes: number;
  verifiedAt: string;
  allVerified: boolean;
  files: { path: string; kind: "leaf" | "scenarios" | "sync" | "receipt" | "index" | "root" | "salt" | string; bytes: number; sha256: string; verified: boolean }[];
}

export const useGreenfield = () => useLoad(() => fetchJson<GreenfieldIndex>("greenfield.json"), "greenfield");
