// Writes abi/GateRecord.json for the verifier and web app, which read the
// chain without a Hardhat build. test/abi.ts fails if it drifts from the artifact.
import { mkdirSync, writeFileSync } from "node:fs";
import { contractsPath, loadArtifact } from "./lib/artifact.ts";

const artifact = loadArtifact();
mkdirSync(contractsPath("abi"), { recursive: true });
const out = contractsPath(`abi/${artifact.contractName}.json`);
writeFileSync(out, `${JSON.stringify(artifact.abi, null, 2)}\n`);
console.log(`wrote ${out}`);
